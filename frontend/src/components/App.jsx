import { useCallback, useRef, useState } from 'react';
import { encodePrintPayload } from '../utils/epl2.js';
import CanvasPreview from './CanvasPreview.jsx';
import LayerControls, { PRESETS } from './LayerControls.jsx';
import LayerPanel from './LayerPanel.jsx';
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

  const preset = PRESETS[presetIdx];
  const labelW = preset.w ?? Math.round(customW * 203);
  const labelH = preset.h ?? Math.round(customH * 203);

  const selectedLayer = layers.find(l => l.id === selectedLayerId) ?? null;
  const visibleCanvasRef = useRef(null);

  // ── Layer mutators ────────────────────────────────────────────────────────
  const patchSelectedLayer = useCallback((patch) => {
    setLayers(ls => ls.map(l => (l.id === selectedLayerId ? { ...l, ...patch } : l)));
  }, [selectedLayerId]);

  const addBigText = useCallback(() => {
    const layer = makeBigTextLayer();
    setLayers(ls => [...ls, layer]);
    setSelectedLayerId(layer.id);
  }, []);

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

  const moveLayer = useCallback((id, delta) => {
    setLayers(ls => {
      const idx = ls.findIndex(l => l.id === id);
      const target = idx + delta;
      if (idx === -1 || target < 0 || target >= ls.length) return ls;
      const next = ls.slice();
      const [layer] = next.splice(idx, 1);
      next.splice(target, 0, layer);
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

  return (
    <div className="studio">
      <LayerControls
        selectedLayer={selectedLayer}
        onLayerChange={patchSelectedLayer}
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
      />

      <LayerPanel
        layers={layers}
        selectedLayerId={selectedLayerId}
        onSelect={setSelectedLayerId}
        onAddBigText={addBigText}
        onAddImage={addImage}
        onToggleVisibility={toggleVisibility}
        onDelete={deleteLayer}
        onMoveUp={(id) => moveLayer(id, -1)}
        onMoveDown={(id) => moveLayer(id, 1)}
      />
    </div>
  );
}
