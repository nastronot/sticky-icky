import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { encodePrintPayload } from '../utils/epl2.js';
import CanvasPreview from './CanvasPreview.jsx';
import LayerControls from './LayerControls.jsx';
import LayerPanel from './LayerPanel.jsx';
import PresetEditor from './PresetEditor.jsx';
import {
  loadPresets,
  savePresets,
  buildDropdownList,
  makePreset,
} from '../utils/presets.js';
import { ImagePlus } from 'lucide-react';
import { measureTextLayer } from '../utils/renderText.js';
import {
  saveDesign,
  serializeDesign,
  deserializeDesign,
  loadDesigns,
  deleteDesign as storageDeleteDesign,
  toggleFavorite as storageToggleFavorite,
  makeThumbnail,
  loadSetting,
  saveSetting,
} from '../utils/storage.js';
import Gallery from './Gallery.jsx';
import SaveDialog from './SaveDialog.jsx';
import Settings from './Settings.jsx';
import PatternEditor from './PatternEditor.jsx';
import PatternManager from './PatternManager.jsx';
import { PatternContext } from './patternContext.js';
import {
  DEFAULT_PATTERNS,
  PATTERN_SIZE,
  setPatternsRegistry,
} from '../utils/patterns.js';
import {
  loadPatternsFromDB,
  savePatternToDB,
  deletePatternFromDB,
} from '../utils/storage.js';
import { loadScreenDPI, saveScreenDPI } from '../utils/calibration.js';
import {
  DEFAULT_THEME,
  DEFAULT_ACCENT,
  applyTheme,
  loadTheme,
  loadAccent,
  saveTheme,
  saveAccent,
} from '../utils/theme.js';
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
  fillPattern: 'default-solid',
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
    allCaps: false,
    smallCaps: false,
    letterSpacing: 0,
    hAlign: 'left',
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
    fillPattern: 'default-solid',
    invert: false,
    xor: true,
    ditherAlgo: 'none',
    ditherAmount: 50,
  };
}

let addressSeq = 0;
/** Multi-line address layer. Occupies the full label bounds like Big Text —
 *  no x/y/width/height/rotation. Auto-fits the largest font size that fits
 *  the label (minus PAD on every side), then scales by sizeScale (0.25..1,
 *  default 1 = auto-fit). Lines are left-aligned within a block centered
 *  horizontally + vertically across the full label. Hard-capped at 7 lines
 *  (see ADDRESS_MAX_LINES). */
function makeAddressLayer() {
  const n = ++addressSeq;
  return {
    id: `address-${Date.now()}-${n}`,
    type: 'address',
    name: `Address ${n}`,
    visible: true,
    text: '',
    postcrossingId: '',
    font: 'Inter',
    bold: true,
    italic: false,
    sizeScale: 1,
    fillPattern: 'default-solid',
    invert: false,
    xor: true,
    ditherAlgo: 'none',
    ditherAmount: 50,
  };
}

let shapeSeq = 0;
const SHAPE_KIND_LABELS = {
  rectangle: 'Rectangle',
  ellipse:   'Ellipse',
  polygon:   'Polygon',
  star:      'Star',
  line:      'Line',
};
function makeShapeLayer(kind, labelW, labelH) {
  const n = ++shapeSeq;
  const base = {
    id: `shape-${Date.now()}-${n}`,
    type: 'shape',
    shapeKind: kind,
    name: `${SHAPE_KIND_LABELS[kind] ?? 'Shape'} ${n}`,
    visible: true,
    fillPattern: 'default-solid',
    invert: false,
    xor: true,
    ditherAlgo: 'none',
    ditherAmount: 50,
  };
  if (kind === 'line') {
    // Horizontal line across the middle third of the canvas.
    const y = Math.round(labelH / 2);
    const xStart = Math.round(labelW / 3);
    const xEnd   = Math.round((labelW / 3) * 2);
    return { ...base, x1: xStart, y1: y, x2: xEnd, y2: y, thickness: 2 };
  }
  // Rectangle / ellipse default to 200×200; polygon / star default to the
  // equivalent 200×200 bbox (radius 100).
  const defaultSize = kind === 'rectangle' || kind === 'ellipse' ? 200 : 200;
  const w = Math.min(defaultSize, labelW);
  const h = Math.min(defaultSize, labelH);
  const bbox = {
    ...base,
    x: Math.round((labelW - w) / 2),
    y: Math.round((labelH - h) / 2),
    width: w,
    height: h,
    rotation: 0,
  };
  if (kind === 'polygon') return { ...bbox, sides: 6 };
  if (kind === 'star')    return { ...bbox, points: 5, innerRadiusRatio: 0.4 };
  return bbox;
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
    // Image-processing pipeline (upscale → threshold-or-dither). All off
    // by default — legacy designs load unchanged, and old designs with
    // removed edge fields (edgeEnabled/edgeStrength) or upscaleFactor=4
    // are silently ignored by the render path.
    upscaleEnabled: false,
    thresholdMode: 'off',      // 'off' | 'auto' | 'manual'
    thresholdValue: 128,       // used when thresholdMode === 'manual'
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
  const [printStatus, setPrintStatus] = useState(null); // null | 'printing' | 'ok' | {error}
  const [copies, setCopies] = useState(1);
  const [viewportRotation, setViewportRotation] = useState(0); // 0 | 90 (purely visual)
  const [trueSize, setTrueSize] = useState(false);
  const [cropMode, setCropMode] = useState(null); // null | { layerId, rect: { x, y, w, h } } in image-pixel space
  const [screenDPI, setScreenDPI] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presets, setPresets] = useState([]);
  const [presetEditorOpen, setPresetEditorOpen] = useState(false);

  // ── Global print settings (persisted to IndexedDB settings store) ────────
  const [darkness, setDarkness] = useState(15);
  const [speed, setSpeed] = useState(1);
  const [xOffset, setXOffset] = useState(27);  // dots (GW p1, empirically tuned default)
  const [yOffset, setYOffset] = useState(0);    // dots

  // ── Appearance (theme + accent) ──────────────────────────────────────────
  // Defaults match the pre-JS CSS root so the first paint after a cold load
  // matches the persisted selection for anyone on the default OLED/zebra
  // combo. The index.html pre-paint script applies those defaults to <html>
  // before React mounts to keep the flash to zero.
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [accent, setAccent] = useState(DEFAULT_ACCENT);
  const dropdownPresets = useMemo(() => buildDropdownList(presets), [presets]);
  const [saveStatus, setSaveStatus] = useState(null);   // null | 'saved' | {error}
  const [focusTextNonce, setFocusTextNonce] = useState(0);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryDesigns, setGalleryDesigns] = useState([]);
  // Tracks the identity of the most-recently loaded design so that Save can
  // pre-populate the dialog and re-save into the same record. null = no design
  // loaded (fresh canvas or post-New).
  const [loadedDesign, setLoadedDesign] = useState(null); // null | { id, name, demoSafe }
  // Save-dialog state: null = closed, otherwise a pending save payload.
  const [saveDialog, setSaveDialog] = useState(null); // null | { thumbnail }
  // Demo mode: hidden, session-only toggle that filters the gallery to
  // designs flagged demoSafe. Intentionally not persisted.
  const [demoMode, setDemoMode] = useState(false);

  // ── Patterns ─────────────────────────────────────────────────────────────
  // Source of truth for every pattern swatch/render lookup in the app. The
  // patterns.js module-level registry mirrors this array (kept in sync via
  // setPatternsRegistry calls below) so the synchronous render helpers can
  // still look patterns up by id.
  const [patterns, setPatterns] = useState([]);
  const [patternEditor, setPatternEditor] = useState(null); // null | { initial, afterSave }
  const [patternManagerOpen, setPatternManagerOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const requestFocusText = useCallback(() => setFocusTextNonce(n => n + 1), []);

  // Clamp presetIdx in case the user just deleted the preset that was
  // currently selected.
  const safePresetIdx = Math.min(presetIdx, dropdownPresets.length - 1);
  const preset = dropdownPresets[safePresetIdx];
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

  const addAddress = useCallback(() => {
    const layer = makeAddressLayer();
    setLayers(ls => [...ls, layer]);
    setSelectedLayerId(layer.id);
  }, []);

  const addShape = useCallback((kind) => {
    const layer = makeShapeLayer(kind, labelW, labelH);
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

  const duplicateLayer = useCallback((id) => {
    let newId = null;
    setLayers(ls => {
      const idx = ls.findIndex(l => l.id === id);
      if (idx === -1) return ls;
      const orig = ls[idx];
      newId = `${orig.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      // Shallow clone — image layers' originalImage ImageData is read-only
      // and is safe to share by reference. The dither cache keys on layer
      // id so the copy gets its own (initially empty) cache entry.
      const copy = { ...orig, id: newId, name: `${orig.name} copy` };
      const next = ls.slice();
      // Insert directly above the original in the array (= above in z-order
      // since the composite walks layers low → high index).
      next.splice(idx + 1, 0, copy);
      return next;
    });
    if (newId) setSelectedLayerId(newId);
  }, []);

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
      imageData.data, canvas.width, canvas.height, labelW, labelH,
      darkness, speed, copies, xOffset, yOffset,
    );
    try {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8765';
      const res = await fetch(`${apiBase}/print`, {
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
  }, [labelW, labelH, copies, darkness, speed, xOffset, yOffset]);

  const handlePresetIdxChange = useCallback((i) => {
    setPresetIdx(i);
    setPrintStatus(null);
  }, []);

  // True-size toggle: if there's no calibrated DPI yet, the first activation
  // routes through the settings modal's Display tab. Subsequent toggles flip directly.
  const handleToggleTrueSize = useCallback(() => {
    if (!trueSize && screenDPI === null) {
      setSettingsOpen(true);
      return;
    }
    setTrueSize(t => !t);
  }, [trueSize, screenDPI]);

  const handleCalibrationDone = useCallback((dpi) => {
    saveScreenDPI(dpi);
    setScreenDPI(dpi);
    if (!trueSize) setTrueSize(true);
  }, [trueSize]);

  // ── Global print settings persistence ────────────────────────────────────
  const handleDarknessChange = useCallback((v) => {
    setDarkness(v);
    saveSetting('darkness', v).catch(err => console.warn('Failed to save darkness:', err));
  }, []);

  const handleSpeedChange = useCallback((v) => {
    setSpeed(v);
    saveSetting('speed', v).catch(err => console.warn('Failed to save speed:', err));
  }, []);

  const handleXOffsetChange = useCallback((v) => {
    setXOffset(v);
    saveSetting('xOffset', v).catch(err => console.warn('Failed to save xOffset:', err));
  }, []);

  const handleYOffsetChange = useCallback((v) => {
    setYOffset(v);
    saveSetting('yOffset', v).catch(err => console.warn('Failed to save yOffset:', err));
  }, []);

  const handleThemeChange = useCallback((t) => {
    setTheme(t);
    applyTheme(t, accent);
    saveTheme(t).catch(err => console.warn('Failed to save theme:', err));
  }, [accent]);

  const handleAccentChange = useCallback((a) => {
    setAccent(a);
    applyTheme(theme, a);
    saveAccent(a).catch(err => console.warn('Failed to save accent:', err));
  }, [theme]);

  // ── Label-size presets ────────────────────────────────────────────────────
  const handleAddPreset = useCallback(async (label, widthInches, heightInches) => {
    const next = makePreset(label, widthInches, heightInches);
    setPresets(prev => [...prev, next]);
    // Persist asynchronously — state is already updated optimistically.
    savePresets([...presets, next]).catch(err => console.warn('Failed to save presets:', err));
  }, [presets]);

  const handleDeletePreset = useCallback(async (id) => {
    if (presets.length <= 1) return;
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    savePresets(updated).catch(err => console.warn('Failed to save presets:', err));
  }, [presets]);

  const handleToggleFavoritePreset = useCallback((id) => {
    const updated = presets.map(p => (p.id === id ? { ...p, favorite: !p.favorite } : p));
    setPresets(updated);
    savePresets(updated).catch(err => console.warn('Failed to save presets:', err));
    // Toggling a favorite reorders the dropdown list. Re-find the previously
    // selected preset by id so the user's selection follows it.
    const oldList = buildDropdownList(presets);
    const newList = buildDropdownList(updated);
    const currentId = oldList[presetIdx]?.id;
    if (currentId) {
      const newIdx = newList.findIndex(p => p.id === currentId);
      if (newIdx >= 0 && newIdx !== presetIdx) setPresetIdx(newIdx);
    }
  }, [presets, presetIdx]);

  // Refresh the gallery's design list from IndexedDB. Called whenever the
  // gallery opens, after a save, and after a delete / favorite toggle.
  const refreshGallery = useCallback(async () => {
    try {
      setGalleryDesigns(await loadDesigns());
    } catch (err) {
      console.error('Failed to load designs:', err);
      setGalleryDesigns([]);
    }
  }, []);

  const handleOpenGallery = useCallback(() => {
    setGalleryOpen(true);
    // Fire-and-forget — the gallery will re-render with the designs once
    // the IndexedDB read resolves.
    refreshGallery();
  }, [refreshGallery]);

  const handleCloseGallery = useCallback(() => {
    setGalleryOpen(false);
  }, []);

  const handleLoadDesign = useCallback(async (design) => {
    // Confirm before clobbering meaningful in-progress work.
    const hasContent =
      layers.length > 1 ||
      (layers[0]?.type === 'bigtext' && (layers[0]?.text ?? '').length > 0) ||
      (layers[0]?.type === 'text' && (layers[0]?.text ?? '') !== 'Text') ||
      (layers[0]?.type === 'image');
    if (hasContent && !window.confirm('Replace the current design? Unsaved changes will be lost.')) {
      return;
    }
    try {
      const restored = await deserializeDesign(design, dropdownPresets);
      // Suppress history capture for the destructive replace — undo would
      // be confusing across a full design swap.
      suppressNextHistoryRef.current = true;
      setLayers(restored.layers);
      setSelectedLayerId(restored.layers[0]?.id ?? null);
      setPresetIdx(restored.presetIdx ?? 0);
      if (typeof restored.customW === 'number') setCustomW(restored.customW);
      if (typeof restored.customH === 'number') setCustomH(restored.customH);
      setLoadedDesign({
        id: restored.id,
        name: restored.name,
        demoSafe: restored.demoSafe ?? false,
      });
      setGalleryOpen(false);
    } catch (err) {
      console.error('Load failed:', err);
      window.alert(`Load failed: ${err.message ?? err}`);
    }
  }, [layers, dropdownPresets]);

  const handleDeleteDesign = useCallback(async (id) => {
    try {
      await storageDeleteDesign(id);
    } catch (err) {
      console.error('Delete failed:', err);
    }
    await refreshGallery();
  }, [refreshGallery]);

  const handleToggleFavorite = useCallback(async (id) => {
    try {
      await storageToggleFavorite(id);
    } catch (err) {
      console.error('Toggle favorite failed:', err);
    }
    await refreshGallery();
  }, [refreshGallery]);

  // ── Image crop tool ───────────────────────────────────────────────────────
  const enterCropMode = useCallback((layerId) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer || layer.type !== 'image' || !layer.originalImage) return;
    setCropMode({
      layerId,
      rect: { x: 0, y: 0, w: layer.originalImage.width, h: layer.originalImage.height },
    });
  }, [layers]);

  const updateCropRect = useCallback((rect) => {
    setCropMode(c => (c ? { ...c, rect } : null));
  }, []);

  const cancelCropMode = useCallback(() => {
    setCropMode(null);
  }, []);

  const applyCropMode = useCallback(() => {
    setCropMode(c => {
      if (!c) return null;
      const layer = layers.find(l => l.id === c.layerId);
      if (!layer?.originalImage) return null;

      const orig = layer.originalImage;
      const x = Math.max(0, Math.min(orig.width - 1, Math.round(c.rect.x)));
      const y = Math.max(0, Math.min(orig.height - 1, Math.round(c.rect.y)));
      const w = Math.max(1, Math.min(orig.width - x, Math.round(c.rect.w)));
      const h = Math.max(1, Math.min(orig.height - y, Math.round(c.rect.h)));

      // Re-paint the original ImageData onto a temp canvas, then read just
      // the cropped slice as a new ImageData.
      const tmp = document.createElement('canvas');
      tmp.width = orig.width;
      tmp.height = orig.height;
      tmp.getContext('2d').putImageData(orig, 0, 0);
      const cropped = tmp.getContext('2d').getImageData(x, y, w, h);

      // Anchor the cropped region's center to where it was before so the
      // visible content doesn't jump on apply.
      const oldCenterX = layer.x + ((x + w / 2) / orig.width) * layer.width;
      const oldCenterY = layer.y + ((y + h / 2) / orig.height) * layer.height;
      const newWidth = (w / orig.width) * layer.width;
      const newHeight = (h / orig.height) * layer.height;

      setLayers(ls => ls.map(l => (l.id === c.layerId ? {
        ...l,
        originalImage: cropped,
        naturalW: w,
        naturalH: h,
        width: newWidth,
        height: newHeight,
        x: oldCenterX - newWidth / 2,
        y: oldCenterY - newHeight / 2,
      } : l)));
      return null;
    });
  }, [layers]);

  // ── Pattern management ───────────────────────────────────────────────────
  // Patterns live in IndexedDB; the React state mirror is kept sync'd on every
  // mutation, and setPatternsRegistry fires off a useEffect so render-time
  // lookups see the new bitmap data.

  const openPatternEditor = useCallback((initial, afterSave) => {
    setPatternEditor({ initial: initial ?? null, afterSave: afterSave ?? null });
  }, []);

  const handlePatternSave = useCallback(async ({ id, label, data }) => {
    // Editing an existing pattern preserves its isDefault / favorite / createdAt
    // so the default-ness stays stable across edits.
    const existing = id ? patterns.find(p => p.id === id) : null;
    const record = {
      id: existing?.id ?? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      label,
      width: PATTERN_SIZE,
      height: PATTERN_SIZE,
      data: data.slice(),
      isDefault: existing?.isDefault ?? false,
      favorite: existing?.favorite ?? false,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    };
    try { await savePatternToDB(record); }
    catch (err) { console.error('Pattern save failed:', err); return; }
    setPatterns(prev => {
      const i = prev.findIndex(p => p.id === record.id);
      if (i >= 0) {
        const copy = prev.slice();
        copy[i] = record;
        return copy;
      }
      return [...prev, record];
    });
    const after = patternEditor?.afterSave;
    setPatternEditor(null);
    if (after) after(record);
  }, [patterns, patternEditor]);

  const handlePatternToggleFavorite = useCallback(async (id) => {
    const target = patterns.find(p => p.id === id);
    if (!target) return;
    const next = { ...target, favorite: !target.favorite };
    try { await savePatternToDB(next); }
    catch (err) { console.error('Favorite toggle failed:', err); return; }
    setPatterns(prev => prev.map(p => (p.id === id ? next : p)));
  }, [patterns]);

  // Count the number of saved designs that reference a given pattern id.
  // Used so the delete-pattern confirmation can quote a usage count.
  const countPatternUsage = useCallback(async (patternId) => {
    try {
      const designs = await loadDesigns();
      let count = 0;
      for (const d of designs) {
        if (Array.isArray(d.layers) && d.layers.some(l => l?.fillPattern === patternId)) {
          count += 1;
        }
      }
      return count;
    } catch (err) {
      console.warn('Usage count failed:', err);
      return 0;
    }
  }, []);

  const handlePatternDelete = useCallback(async (pattern) => {
    const usage = await countPatternUsage(pattern.id);
    const msg = usage > 0
      ? `Pattern "${pattern.label}" is used in ${usage} design${usage === 1 ? '' : 's'}. Deleting will cause those layers to fall back to solid fill. Delete anyway?`
      : `Delete pattern "${pattern.label}"?`;
    if (!window.confirm(msg)) return;
    try { await deletePatternFromDB(pattern.id); }
    catch (err) { console.error('Pattern delete failed:', err); return; }
    setPatterns(prev => prev.filter(p => p.id !== pattern.id));
    // Any layers in the *current* canvas referencing the deleted pattern
    // silently fall back to solid via getPattern's legacy shim on next
    // render. Nothing else to do here.
  }, [countPatternUsage]);

  const handleRestoreDefaults = useCallback(async () => {
    const existingIds = new Set(patterns.map(p => p.id));
    const missing = DEFAULT_PATTERNS.filter(p => !existingIds.has(p.id));
    if (missing.length === 0) return;
    const now = new Date().toISOString();
    const added = [];
    for (const p of missing) {
      const record = {
        id: p.id,
        label: p.label,
        width: PATTERN_SIZE,
        height: PATTERN_SIZE,
        data: p.data,
        isDefault: true,
        favorite: false,
        createdAt: now,
      };
      try {
        await savePatternToDB(record);
        added.push(record);
      } catch (err) {
        console.warn('restore default failed:', p.id, err);
      }
    }
    if (added.length > 0) setPatterns(prev => [...prev, ...added]);
  }, [patterns]);

  const patternContextValue = useMemo(() => ({
    patterns,
    onCreatePattern: () => {
      // When created via the picker, auto-select the new pattern on the
      // currently selected layer.
      const targetLayerId = selectedLayerId;
      openPatternEditor(null, (created) => {
        if (targetLayerId) {
          setLayers(ls => ls.map(l => (
            l.id === targetLayerId ? { ...l, fillPattern: created.id } : l
          )));
        }
      });
    },
    onManagePatterns: () => setPatternManagerOpen(true),
  }), [patterns, selectedLayerId, openPatternEditor]);

  const handleImportDesign = useCallback(async (design) => {
    try {
      // Re-stamp id and savedAt so the import doesn't collide with an
      // existing design that already lives in the store.
      const stamped = {
        ...design,
        id: `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        savedAt: new Date().toISOString(),
      };
      await saveDesign(stamped);
      await refreshGallery();
    } catch (err) {
      console.error('Import failed:', err);
      window.alert(`Import failed: ${err.message ?? err}`);
    }
  }, [refreshGallery]);

  const handleNewDesign = useCallback(() => {
    const hasContent =
      layers.length > 1 ||
      (layers[0]?.type === 'bigtext' && (layers[0]?.text ?? '').length > 0) ||
      (layers[0]?.type === 'text' && (layers[0]?.text ?? '') !== 'Text') ||
      (layers[0]?.type === 'image');
    if (hasContent && !window.confirm('Start fresh? Unsaved changes will be lost.')) {
      return;
    }
    suppressNextHistoryRef.current = true;
    // Wipe undo/redo so the previous design isn't reachable from the fresh
    // canvas — also drop any in-flight burst snapshot.
    historyRef.current.past = [];
    historyRef.current.future = [];
    if (pendingHistoryRef.current.timer) {
      clearTimeout(pendingHistoryRef.current.timer);
      pendingHistoryRef.current.timer = null;
      pendingHistoryRef.current.snapshot = null;
    }
    setLayers([{ ...DEFAULT_BIGTEXT, id: 'default' }]);
    setSelectedLayerId('default');
    setPresetIdx(0);
    setCustomW(4.0);
    setCustomH(2.0);
    setLoadedDesign(null);
  }, [layers]);

  // Open the save dialog. Refreshes galleryDesigns so the dialog's
  // overwrite-check sees the current set of saved designs.
  const handleSave = useCallback(async () => {
    const canvas = visibleCanvasRef.current;
    const thumbnail = makeThumbnail(canvas);
    try {
      setGalleryDesigns(await loadDesigns());
    } catch (err) {
      console.warn('Failed to refresh designs for save dialog:', err);
    }
    setSaveDialog({ thumbnail });
  }, []);

  const handleSaveCancel = useCallback(() => {
    setSaveDialog(null);
  }, []);

  // Commit the save. `id` may be the loaded design's id, an overwrite
  // target's id, or null for a brand-new record. Preserves the existing
  // target's favorite flag when overwriting.
  const handleSaveCommit = useCallback(async ({ id, name, demoSafe }) => {
    if (!saveDialog) return;
    const existing = id ? galleryDesigns.find(d => d.id === id) : null;
    try {
      const design = serializeDesign({
        id: id ?? undefined,
        name,
        layers,
        presetId: preset.id,
        customW,
        customH,
        labelW,
        labelH,
        thumbnail: saveDialog.thumbnail,
        favorite: existing?.favorite ?? false,
        demoSafe,
      });
      await saveDesign(design);
      setLoadedDesign({ id: design.id, name: design.name, demoSafe: design.demoSafe });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus({ error: err.message ?? 'Save failed' });
    } finally {
      setSaveDialog(null);
    }
  }, [saveDialog, galleryDesigns, layers, preset, customW, customH, labelW, labelH]);

  // ── Async init: presets, DPI, global settings ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loadedPresets = [];
      try {
        loadedPresets = await loadPresets();
      } catch (err) {
        console.warn('Failed to load presets:', err);
      }
      let loadedDPI = null;
      try {
        loadedDPI = await loadScreenDPI();
      } catch (err) {
        console.warn('Failed to load screen DPI:', err);
      }
      const loadedDarkness = await loadSetting('darkness');
      const loadedSpeed = await loadSetting('speed');
      let loadedXOffset = await loadSetting('xOffset');
      const loadedYOffset = await loadSetting('yOffset');

      // One-time migration: xOffset was stored under the old broken pipeline
      // where the value was divided by 8 before reaching GW. Now GW receives
      // xOffset directly (dots). Existing stored values like 80 need to
      // become 10 (80 / 8 = 10).
      const xOffsetMigrated = await loadSetting('xOffset_v2_migrated');
      if (!xOffsetMigrated && loadedXOffset !== null && loadedXOffset > 40) {
        loadedXOffset = Math.round(loadedXOffset / 8);
        await saveSetting('xOffset', loadedXOffset);
      }
      if (!xOffsetMigrated) {
        await saveSetting('xOffset_v2_migrated', true);
      }

      // Patterns: first-run seed of the 12 built-ins (guarded by a flag so
      // defaults the user has deleted don't come back).
      let loadedPatterns = [];
      try {
        loadedPatterns = await loadPatternsFromDB();
      } catch (err) {
        console.warn('Failed to load patterns:', err);
      }
      const seeded = await loadSetting('patterns_seeded_v1');
      if (!seeded) {
        const existingIds = new Set(loadedPatterns.map(p => p.id));
        const toSeed = DEFAULT_PATTERNS.filter(p => !existingIds.has(p.id));
        if (toSeed.length > 0) {
          const now = new Date().toISOString();
          for (const p of toSeed) {
            const record = {
              id: p.id,
              label: p.label,
              width: PATTERN_SIZE,
              height: PATTERN_SIZE,
              data: p.data,
              isDefault: true,
              favorite: false,
              createdAt: now,
            };
            try { await savePatternToDB(record); } catch (err) { console.warn('seed pattern failed:', p.id, err); }
            loadedPatterns.push(record);
          }
        }
        try { await saveSetting('patterns_seeded_v1', true); } catch { /* non-fatal */ }
      }

      if (cancelled) return;
      setPresets(loadedPresets);
      setPatterns(loadedPatterns);
      setPatternsRegistry(loadedPatterns);
      if (loadedDPI !== null) setScreenDPI(loadedDPI);
      if (loadedDarkness !== null) setDarkness(loadedDarkness);
      if (loadedSpeed !== null) setSpeed(loadedSpeed);
      if (loadedXOffset !== null) setXOffset(loadedXOffset);
      if (loadedYOffset !== null) setYOffset(loadedYOffset);

      // Appearance — load theme + accent and apply to <html>. Pre-paint
      // defaults are already on the root so the first paint is correct;
      // this swaps in the user's saved choice once IndexedDB resolves.
      try {
        const [t, a] = await Promise.all([loadTheme(), loadAccent()]);
        if (cancelled) return;
        setTheme(t);
        setAccent(a);
        applyTheme(t, a);
      } catch (err) {
        console.warn('Failed to load appearance:', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Keep the render-time pattern registry synced with React state on every
  // patterns change (new / edit / delete / favourite). Invalidates the canvas
  // pattern cache as a side-effect so subsequent renders see the fresh data.
  useEffect(() => {
    if (patterns.length > 0) setPatternsRegistry(patterns);
  }, [patterns]);

  // ── Paste image from clipboard ────────────────────────────────────────────
  // Document-level paste listener. Skips when focus is on a text input so the
  // browser's normal paste-into-textarea behavior keeps working. Looks for the
  // first image item on the clipboard, converts it to a File, and routes it
  // through the same addImage flow as the file picker / drop handler.
  useEffect(() => {
    const onPaste = (e) => {
      const t = document.activeElement;
      if (
        t && (
          t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable
        )
      ) {
        return;
      }
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type && item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            addImage(blob);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [addImage]);

  // ── Scroll-to-increment on number / range inputs ──────────────────────────
  // Document-level wheel listener: when the cursor is over an <input
  // type="number"> or <input type="range">, the wheel steps the value
  // instead of scrolling the page. preventDefault requires the listener
  // to be non-passive. The new value is written via the React-friendly
  // prototype setter + dispatched 'input' event so the controlled
  // component's onChange handler fires normally.
  useEffect(() => {
    const protoSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    const onWheel = (e) => {
      const t = e.target;
      if (!(t instanceof window.HTMLInputElement)) return;
      if (t.type !== 'number' && t.type !== 'range') return;
      if (t.disabled || t.readOnly) return;
      e.preventDefault();
      const step = Number(t.step) || 1;
      const min = t.min !== '' ? Number(t.min) : -Infinity;
      const max = t.max !== '' ? Number(t.max) : Infinity;
      const dir = e.deltaY > 0 ? -1 : 1;
      const cur = Number(t.value) || 0;
      const raw = cur + dir * step;
      // Clamp and snap to a sensible decimal precision derived from the
      // step (so 0.01 steps don't drift into floating-point noise).
      const decimals = (String(step).split('.')[1] ?? '').length;
      const clamped = Math.max(min, Math.min(max, raw));
      const next = Number(clamped.toFixed(decimals));
      protoSetter.call(t, String(next));
      t.dispatchEvent(new Event('input', { bubbles: true }));
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  // Bound at document level so they fire from anywhere except editable fields.
  const layersRef = useRef(layers);
  const selectedRef = useRef(selectedLayerId);
  // Mirror layers + selection into refs so the document-level keydown
  // listener (bound once) can read fresh values without re-binding.
  useEffect(() => {
    layersRef.current = layers;
    selectedRef.current = selectedLayerId;
  });

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
      if (ctrl && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const id = selectedRef.current;
        if (id) duplicateLayer(id);
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
  }, [undo, redo, deleteLayer, duplicateLayer]);

  // ── Drag-and-drop image files ─────────────────────────────────────────────
  // dragenter/dragleave fire on every child as the cursor crosses descendants,
  // so we use a counter to track "is the file drag currently inside the studio
  // root" rather than relying on a single boolean. Only File drags activate
  // the overlay — the layer-list HTML5 drag (dataTransfer.types includes
  // 'text/plain' but not 'Files') doesn't trigger it.
  const isFileDrag = (e) => {
    const types = e.dataTransfer?.types;
    return !!types && Array.from(types).includes('Files');
  };

  const handleDragEnter = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setDragOver(true);
  };

  const handleDragOver = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDragLeave = (e) => {
    if (!isFileDrag(e)) return;
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragOver(false);
    }
  };

  const handleDrop = (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    for (const file of files) {
      if (file.type && file.type.startsWith('image/')) {
        addImage(file);
      }
    }
  };

  return (
    <PatternContext.Provider value={patternContextValue}>
    <div
      className="studio"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <LayerControls
        selectedLayer={selectedLayer}
        onLayerChange={patchSelectedLayer}
        focusTextNonce={focusTextNonce}
        cropMode={cropMode}
        onEnterCrop={enterCropMode}
        onApplyCrop={applyCropMode}
        onCancelCrop={cancelCropMode}
      />

      <CanvasPreview
        ref={visibleCanvasRef}
        layers={layers}
        labelW={labelW}
        labelH={labelH}
        viewportRotation={viewportRotation}
        trueSize={trueSize}
        screenDPI={screenDPI}
        selectedLayerId={selectedLayerId}
        onSelectLayer={setSelectedLayerId}
        onPatchLayer={(id, patch) => setLayers(ls => ls.map(l => (l.id === id ? { ...l, ...patch } : l)))}
        onRequestFocusText={requestFocusText}
        cropMode={cropMode}
        onUpdateCropRect={updateCropRect}
        patterns={patterns}
      />

      <LayerPanel
        layers={layers}
        selectedLayerId={selectedLayerId}
        onSelect={setSelectedLayerId}
        onAddBigText={addBigText}
        onAddText={addText}
        onAddImage={addImage}
        onAddAddress={addAddress}
        onAddShape={addShape}
        onToggleVisibility={toggleVisibility}
        onDelete={deleteLayer}
        onDuplicate={duplicateLayer}
        onMoveLayerTo={moveLayerTo}
        presets={dropdownPresets}
        presetIdx={safePresetIdx}
        onPresetIdxChange={handlePresetIdxChange}
        onEditPresets={() => setPresetEditorOpen(true)}
        customW={customW}
        onCustomWChange={setCustomW}
        customH={customH}
        onCustomHChange={setCustomH}
        viewportRotation={viewportRotation}
        onToggleViewportRotation={() => setViewportRotation(r => (r === 0 ? 90 : 0))}
        trueSize={trueSize}
        onToggleTrueSize={handleToggleTrueSize}
        onOpenSettings={() => setSettingsOpen(true)}
        onNew={handleNewDesign}
        onSave={handleSave}
        saveStatus={saveStatus}
        onOpenGallery={handleOpenGallery}
        onPrint={handlePrint}
        printStatus={printStatus}
        copies={copies}
        onCopiesChange={setCopies}
      />

      {galleryOpen && (
        <Gallery
          designs={galleryDesigns}
          demoMode={demoMode}
          onLoad={handleLoadDesign}
          onDelete={handleDeleteDesign}
          onToggleFavorite={handleToggleFavorite}
          onImport={handleImportDesign}
          onClose={handleCloseGallery}
        />
      )}

      {saveDialog && (
        <SaveDialog
          initialName={loadedDesign?.name ?? ''}
          initialDemoSafe={loadedDesign?.demoSafe ?? false}
          loadedDesignId={loadedDesign?.id ?? null}
          existingDesigns={galleryDesigns}
          onCancel={handleSaveCancel}
          onSave={handleSaveCommit}
        />
      )}

      <div className={`drop-zone-overlay ${dragOver ? 'active' : ''}`}>
        <div className="drop-zone-box">
          <ImagePlus size={56} strokeWidth={1.5} />
          <span>Drop image to add layer</span>
        </div>
      </div>

      {settingsOpen && (
        <Settings
          darkness={darkness}
          speed={speed}
          xOffset={xOffset}
          yOffset={yOffset}
          screenDPI={screenDPI}
          theme={theme}
          accent={accent}
          onChangeDarkness={handleDarknessChange}
          onChangeSpeed={handleSpeedChange}
          onChangeXOffset={handleXOffsetChange}
          onChangeYOffset={handleYOffsetChange}
          onCalibrationDone={handleCalibrationDone}
          onChangeTheme={handleThemeChange}
          onChangeAccent={handleAccentChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {presetEditorOpen && (
        <PresetEditor
          presets={presets}
          onAdd={handleAddPreset}
          onDelete={handleDeletePreset}
          onToggleFavorite={handleToggleFavoritePreset}
          onClose={() => setPresetEditorOpen(false)}
        />
      )}

      {patternManagerOpen && (
        <PatternManager
          patterns={patterns}
          onNew={() => openPatternEditor(null, null)}
          onEdit={(p) => openPatternEditor(p, null)}
          onDelete={handlePatternDelete}
          onToggleFavorite={handlePatternToggleFavorite}
          onRestoreDefaults={handleRestoreDefaults}
          onClose={() => setPatternManagerOpen(false)}
        />
      )}

      {patternEditor && (
        <PatternEditor
          initial={patternEditor.initial}
          existingPatterns={patterns}
          onCancel={() => setPatternEditor(null)}
          onSave={handlePatternSave}
        />
      )}
      <div style={{
        position: 'fixed', bottom: 8, left: 8,
        fontSize: 11, color: 'var(--text-muted)', pointerEvents: 'none',
        zIndex: 9999, userSelect: 'none',
      }}>
        <span
          onClick={() => setDemoMode(m => !m)}
          style={{
            cursor: 'pointer',
            pointerEvents: 'auto',
            padding: '2px 1px',
            color: demoMode ? 'var(--accent)' : 'inherit',
          }}
        >v</span>{__APP_VERSION__}
      </div>
    </div>
    </PatternContext.Provider>
  );
}
