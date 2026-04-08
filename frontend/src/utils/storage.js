// localStorage helpers for saving and restoring complete designs.
//
// Two keys are used:
//   thermal_designs   — gallery: an array of explicitly saved designs.
//   thermal_autosave  — single auto-saved snapshot of the current session.

const DESIGNS_KEY = 'thermal_designs';
const AUTOSAVE_KEY = 'thermal_autosave';

// ── ImageData ↔ data URL helpers ──────────────────────────────────────────────

/** Convert ImageData (image layer's originalImage) to a PNG data URL. */
function imageDataToDataURL(imageData) {
  const c = document.createElement('canvas');
  c.width = imageData.width;
  c.height = imageData.height;
  c.getContext('2d').putImageData(imageData, 0, 0);
  return c.toDataURL('image/png');
}

/** Decode a PNG data URL back into an ImageData (async — uses an Image element). */
export async function dataURLToImageData(dataURL) {
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataURL;
  });
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, c.width, c.height);
}

// ── Per-layer serialize / deserialize ─────────────────────────────────────────

function serializeLayer(layer) {
  if (layer.type === 'image') {
    const { originalImage, ...rest } = layer;
    return {
      ...rest,
      originalImageDataURL: originalImage ? imageDataToDataURL(originalImage) : null,
    };
  }
  return { ...layer };
}

async function deserializeLayer(l) {
  if (l.type === 'image' && l.originalImageDataURL) {
    const originalImage = await dataURLToImageData(l.originalImageDataURL);
    const { originalImageDataURL, ...rest } = l;
    return { ...rest, originalImage };
  }
  return { ...l };
}

// ── Whole-design serialize / deserialize ──────────────────────────────────────

/** Build a serializable design object from current app state. */
export function serializeDesign({ name, layers, presetIdx, customW, customH, thumbnail, favorite = false }) {
  return {
    id: `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    thumbnail,
    savedAt: new Date().toISOString(),
    favorite,
    presetIdx,
    customW,
    customH,
    layers: layers.map(serializeLayer),
  };
}

/** Async because image layers reconstruct an ImageData via an Image element. */
export async function deserializeDesign(design) {
  const layers = await Promise.all(design.layers.map(deserializeLayer));
  return {
    layers,
    presetIdx: design.presetIdx,
    customW: design.customW,
    customH: design.customH,
  };
}

// ── Designs gallery (saved list) ──────────────────────────────────────────────

export function loadDesigns() {
  try {
    const raw = localStorage.getItem(DESIGNS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeDesigns(designs) {
  localStorage.setItem(DESIGNS_KEY, JSON.stringify(designs));
}

/** Append a design to the saved list. Throws if storage is full. */
export function saveDesign(design) {
  const designs = loadDesigns();
  designs.push(design);
  writeDesigns(designs);
}

export function deleteDesign(id) {
  writeDesigns(loadDesigns().filter(d => d.id !== id));
}

export function toggleFavorite(id) {
  writeDesigns(loadDesigns().map(d => (d.id === id ? { ...d, favorite: !d.favorite } : d)));
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────

/** Generate a thumbnail data URL by scaling the source canvas down. */
export function makeThumbnail(srcCanvas, maxWidth = 200) {
  if (!srcCanvas || srcCanvas.width === 0 || srcCanvas.height === 0) return null;
  const ratio = srcCanvas.height / srcCanvas.width;
  const w = Math.min(maxWidth, srcCanvas.width);
  const h = Math.max(1, Math.round(w * ratio));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(srcCanvas, 0, 0, w, h);
  return c.toDataURL('image/png');
}

// ── Autosave (used by phase 3) ────────────────────────────────────────────────

export function autoSave(snapshot) {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage full — drop silently, autosave is best-effort */
  }
}

export function loadAutoSave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAutoSave() {
  localStorage.removeItem(AUTOSAVE_KEY);
}
