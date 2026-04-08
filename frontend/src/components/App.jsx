import { useCallback, useEffect, useRef, useState } from 'react';
import { encodePrintPayload } from '../utils/epl2.js';
import CanvasPreview from './CanvasPreview.jsx';
import LayerControls, { PRESETS } from './LayerControls.jsx';
import LayerPanel from './LayerPanel.jsx';
import { measureTextLayer } from '../utils/renderText.js';
import './studio.css';

const DEFAULT_BIGTEXT = {
  type: 'bigtext',
  name: 'Big Text 1',
  visible: true,
  text: '',
  font: 'Arial Black',
  bold: true,
  italic: false,
  smallCaps: false,
  allCaps: true,
  hAlign: 'center',
  vAlign: 'middle',
  letterSpacing: -2,
  invert: false,
  xor: true,
  ditherAlgo: 'none',
  ditherAmount: 50,
};

let bigTextSeq = 1;
function makeBigTextLayer() {
  const n = ++bigTextSeq;
  return {
    ...DEFAULT_BIGTEXT,
    id: `bigtext-${Date.now()}-${n}`,
    name: `Big Text ${n}`,
  };
}

let textSeq = 0;
function makeTextLayer(labelW, labelH) {
  const n = ++textSeq;
  const proto = {
    type: 'text',
    text: 'Text',
    font: 'Arial Black',
    bold: true,
    italic: false,
    fontSize: 40,
    rotation: 0,
    flipH: false,
    flipV: false,
    x: 0,
    y: 0,
  };
  // Measure synchronously so the initial bounding box is roughly correct.
  // CanvasPreview will refine it on the first render once fonts are loaded.
  const m = measureTextLayer(proto);
  return {
    id: `text-${Date.now()}-${n}`,
    name: `Text ${n}`,
    visible: true,
    ...proto,
    width: m.width,
    height: m.height,
    x: Math.round((labelW - m.width) / 2),
    y: Math.round((labelH - m.height) / 2),
    invert: false,
    xor: true,
    ditherAlgo: 'none',
    ditherAmount: 50,
  };
}

let imageSeq = 0;
/** Read a File into an HTMLImageElement, then into ImageData. */
async function loadImageFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    const tmp = document.createElement('canvas');
    tmp.width = img.naturalWidth;
    tmp.height = img.naturalHeight;
    const ctx = tmp.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, tmp.width, tmp.height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function makeImageLayer(file, originalImage, labelW, labelH) {
  const naturalW = originalImage.width;
  const naturalH = originalImage.height;
  // Scale to fit the label preserving aspect ratio.
  const scale = Math.min(1, labelW / naturalW, labelH / naturalH);
  const width = Math.round(naturalW * scale);
  const height = Math.round(naturalH * scale);
  const n = ++imageSeq;
  return {
    id: `image-${Date.now()}-${n}`,
    type: 'image',
    name: file.name || `Image ${n}`,
    visible: true,
    originalImage,
    naturalW,
    naturalH,
    x: Math.round((labelW - width) / 2),
    y: Math.round((labelH - height) / 2),
    width,
    height,
    rotation: 0,
    flipH: false,
    flipV: false,
    lockAspect: false,
    invert: false,
    xor: true,
    ditherAlgo: 'floydSteinberg',
    ditherAmount: 50,
    threshold: 128,
  };
}

export default function App() {
  // ── Layer state ───────────────────────────────────────────────────────────
  const [layers, setLayers] = useState(() => [{ ...DEFAULT_BIGTEXT, id: 'default' }]);
  const [selectedLayerId, setSelectedLayerId] = useState('default');

  // ── Global (label / print) state ──────────────────────────────────────────
  const [presetIdx, setPresetIdx] = useState(0);
  const [customW, setCustomW] = useState(4.0);
  const [customH, setCustomH] = useState(2.0);
  const [darkness, setDarkness] = useState(15);
  const [speed, setSpeed] = useState(1);
  const [printStatus, setPrintStatus] = useState(null); // null | 'printing' | 'ok' | {error}
  const [focusTextNonce, setFocusTextNonce] = useState(0);
  const requestFocusText = useCallback(() => setFocusTextNonce(n => n + 1), []);

  const preset = PRESETS[presetIdx];
  const labelW = preset.w ?? Math.round(customW * 203);
  const labelH = preset.h ?? Math.round(customH * 203);

  const selectedLayer = layers.find(l => l.id === selectedLayerId) ?? null;
  const visibleCanvasRef = useRef(null);

  // ── Undo / redo ───────────────────────────────────────────────────────────
  // History is captured automatically from layer changes, but bursts of
  // changes (text typing, slider drags, canvas drags) coalesce into a single
  // undo step via a 350 ms debounce so a ctrl+z reverts a meaningful chunk
  // rather than a single keystroke.
  const HISTORY_LIMIT = 20;
  const HISTORY_DEBOUNCE_MS = 350;
  const historyRef = useRef({ past: [], future: [] });
  const prevLayersRef = useRef(null);
  const pendingHistoryRef = useRef({ snapshot: null, timer: null });
  const suppressNextHistoryRef = useRef(false);

  const flushPendingHistory = useCallback(() => {
    const pending = pendingHistoryRef.current;
    if (pending.timer === null) return;
    clearTimeout(pending.timer);
    historyRef.current.past.push(pending.snapshot);
    if (historyRef.current.past.length > HISTORY_LIMIT) historyRef.current.past.shift();
    pending.timer = null;
    pending.snapshot = null;
  }, []);

  useEffect(() => {
    // First render: just establish the baseline.
    if (prevLayersRef.current === null) {
      prevLayersRef.current = layers;
      return;
    }
    const prev = prevLayersRef.current;
    prevLayersRef.current = layers;

    // Don't capture history while restoring from undo / redo.
    if (suppressNextHistoryRef.current) {
      suppressNextHistoryRef.current = false;
      return;
    }

    // Coalesce a burst of changes: snapshot the *pre-burst* state once and
    // schedule a commit. Subsequent changes inside the debounce window keep
    // the same snapshot.
    const pending = pendingHistoryRef.current;
    if (pending.timer === null) {
      pending.snapshot = prev;
      pending.timer = setTimeout(() => {
        historyRef.current.past.push(pending.snapshot);
        if (historyRef.current.past.length > HISTORY_LIMIT) historyRef.current.past.shift();
        historyRef.current.future = [];
        pending.timer = null;
        pending.snapshot = null;
      }, HISTORY_DEBOUNCE_MS);
    }
  }, [layers]);

  const undo = useCallback(() => {
    flushPendingHistory();
    const past = historyRef.current.past;
    if (past.length === 0) return;
    const snapshot = past.pop();
    historyRef.current.future.push(layers);
    suppressNextHistoryRef.current = true;
    setLayers(snapshot);
    // Keep selection valid: if the previously-selected layer no longer
    // exists in the snapshot, fall back to the first layer.
    if (!snapshot.find(l => l.id === selectedLayerId)) {
      setSelectedLayerId(snapshot[0]?.id ?? null);
    }
  }, [layers, selectedLayerId, flushPendingHistory]);

  const redo = useCallback(() => {
    flushPendingHistory();
    const future = historyRef.current.future;
    if (future.length === 0) return;
    const snapshot = future.pop();
    historyRef.current.past.push(layers);
    if (historyRef.current.past.length > HISTORY_LIMIT) historyRef.current.past.shift();
    suppressNextHistoryRef.current = true;
    setLayers(snapshot);
    if (!snapshot.find(l => l.id === selectedLayerId)) {
      setSelectedLayerId(snapshot[0]?.id ?? null);
    }
  }, [layers, selectedLayerId, flushPendingHistory]);

  // ── Layer mutators ────────────────────────────────────────────────────────
  const patchSelectedLayer = useCallback((patch) => {
    setLayers(ls => ls.map(l => (l.id === selectedLayerId ? { ...l, ...patch } : l)));
  }, [selectedLayerId]);

  const addBigText = useCallback(() => {
    const layer = makeBigTextLayer();
    setLayers(ls => [...ls, layer]);
    setSelectedLayerId(layer.id);
  }, []);

  const addText = useCallback(() => {
    const layer = makeTextLayer(labelW, labelH);
    setLayers(ls => [...ls, layer]);
    setSelectedLayerId(layer.id);
  }, [labelW, labelH]);

  const addImage = useCallback(async (file) => {
    try {
      const imageData = await loadImageFile(file);
      const layer = makeImageLayer(file, imageData, labelW, labelH);
      setLayers(ls => [...ls, layer]);
      setSelectedLayerId(layer.id);
    } catch (err) {
      console.error('Failed to import image:', err);
    }
  }, [labelW, labelH]);

  const toggleVisibility = useCallback((id) => {
    setLayers(ls => ls.map(l => (l.id === id ? { ...l, visible: !l.visible } : l)));
  }, []);

  const deleteLayer = useCallback((id) => {
    setLayers(ls => {
      if (ls.length === 1) return ls;
      const next = ls.filter(l => l.id !== id);
      if (id === selectedLayerId) setSelectedLayerId(next[0].id);
      return next;
    });
  }, [selectedLayerId]);

  const moveLayerTo = useCallback((id, targetIdx) => {
    setLayers(ls => {
      const fromIdx = ls.findIndex(l => l.id === id);
      if (fromIdx === -1) return ls;
      // No-op if dropping into the slot the layer already occupies.
      if (targetIdx === fromIdx || targetIdx === fromIdx + 1) return ls;
      const next = ls.slice();
      const [layer] = next.splice(fromIdx, 1);
      // Removing earlier element shifts all later indices down by one.
      const insertAt = targetIdx > fromIdx ? targetIdx - 1 : targetIdx;
      next.splice(insertAt, 0, layer);
      return next;
    });
  }, []);

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = useCallback(async () => {
    const canvas = visibleCanvasRef.current;
    if (!canvas) return;
    setPrintStatus('printing');
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const body = encodePrintPayload(
      imageData.data, canvas.width, canvas.height, labelW, labelH, darkness, speed,
    );
    try {
      const res = await fetch('http://localhost:8765/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok) {
        setPrintStatus('ok');
      } else {
        setPrintStatus({ error: json.detail ?? 'Unknown error' });
      }
    } catch (err) {
      setPrintStatus({ error: err.message });
    }
  }, [labelW, labelH, darkness, speed]);

  const handlePresetIdxChange = useCallback((i) => {
    setPresetIdx(i);
    setPrintStatus(null);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // Bound at document level so they fire from anywhere except editable fields.
  const layersRef = useRef(layers);
  const selectedRef = useRef(selectedLayerId);
  layersRef.current = layers;
  selectedRef.current = selectedLayerId;

  useEffect(() => {
    const isEditable = (el) => {
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const onKeyDown = (e) => {
      // Undo / redo are allowed even from inside text fields, otherwise
      // typing locks you out of them.
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (ctrl && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redo();
        return;
      }
      // The rest of the shortcuts shouldn't fire while editing text.
      if (isEditable(e.target)) return;

      const id = selectedRef.current;
      const ls = layersRef.current;
      const layer = ls.find(l => l.id === id);

      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedLayerId(null);
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && layer && ls.length > 1) {
        e.preventDefault();
        deleteLayer(id);
        return;
      }
      if (layer && (layer.type === 'image' || layer.type === 'text')) {
        const step = e.shiftKey ? 10 : 1;
        let dx = 0;
        let dy = 0;
        if (e.key === 'ArrowLeft')  dx = -step;
        if (e.key === 'ArrowRight') dx =  step;
        if (e.key === 'ArrowUp')    dy = -step;
        if (e.key === 'ArrowDown')  dy =  step;
        if (dx !== 0 || dy !== 0) {
          e.preventDefault();
          setLayers(prev => prev.map(l => (l.id === id ? { ...l, x: l.x + dx, y: l.y + dy } : l)));
          return;
        }
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [undo, redo, deleteLayer]);

  return (
    <div className="studio">
      <LayerControls
        selectedLayer={selectedLayer}
        onLayerChange={patchSelectedLayer}
        focusTextNonce={focusTextNonce}
        presetIdx={presetIdx}
        onPresetIdxChange={handlePresetIdxChange}
        customW={customW}
        onCustomWChange={setCustomW}
        customH={customH}
        onCustomHChange={setCustomH}
        darkness={darkness}
        onDarknessChange={setDarkness}
        speed={speed}
        onSpeedChange={setSpeed}
        onPrint={handlePrint}
        printStatus={printStatus}
      />

      <CanvasPreview
        ref={visibleCanvasRef}
        layers={layers}
        labelW={labelW}
        labelH={labelH}
        selectedLayerId={selectedLayerId}
        onSelectLayer={setSelectedLayerId}
        onPatchLayer={(id, patch) => setLayers(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)))}
        onRequestFocusText={requestFocusText}
      />

      <LayerPanel
        layers={layers}
        selectedLayerId={selectedLayerId}
        onSelect={setSelectedLayerId}
        onAddBigText={addBigText}
        onAddText={addText}
        onAddImage={addImage}
        onToggleVisibility={toggleVisibility}
        onDelete={deleteLayer}
        onMoveLayerTo={moveLayerTo}
      />
    </div>
  );
}
