// IndexedDB-backed storage for designs, label-size presets, and app settings
// (screen DPI, print settings, etc.).
//
// Schema (version 2):
//   db: "sticky_zebra"
//     designs  — keyPath "id"          — every saved design
//     autosave — (legacy, unused)      — kept to avoid a version bump
//     presets  — keyPath "id"          — label-size presets
//     settings — no keyPath, keyed by setting name (e.g. "screenDPI")
//
// Version 1→2 migration adds the presets and settings stores and pulls in
// data from localStorage (thermal_label_presets_v2, thermal_screen_dpi).
// The legacy thermal_designs / thermal_autosave localStorage migration from
// v1 is preserved for users who never opened v1.

const DB_NAME = 'sticky_zebra';
const DB_VERSION = 2;
const STORE_DESIGNS = 'designs';
const STORE_AUTOSAVE = 'autosave';
const STORE_PRESETS = 'presets';
const STORE_SETTINGS = 'settings';

// Legacy localStorage keys — read once during migration, then deleted.
const LEGACY_DESIGNS_KEY = 'thermal_designs';
const LEGACY_PRESETS_KEY_V2 = 'thermal_label_presets_v2';
const LEGACY_PRESETS_KEY_V1 = 'thermal_label_presets';
const LEGACY_DPI_KEY = 'thermal_screen_dpi';

// ── IndexedDB wrapper ─────────────────────────────────────────────────────────

let dbReadyPromise = null;

function openRawDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;

      // v0→v1: create designs + autosave stores
      if (oldVersion < 1) {
        if (!db.objectStoreNames.contains(STORE_DESIGNS)) {
          db.createObjectStore(STORE_DESIGNS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_AUTOSAVE)) {
          db.createObjectStore(STORE_AUTOSAVE);
        }
      }

      // v1→v2: create presets + settings stores
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(STORE_PRESETS)) {
          db.createObjectStore(STORE_PRESETS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDB() {
  if (dbReadyPromise) return dbReadyPromise;
  dbReadyPromise = openRawDB().then(async (db) => {
    try {
      await migrateFromLocalStorage(db);
    } catch (err) {
      console.warn('Migration from localStorage failed:', err);
    }
    return db;
  });
  return dbReadyPromise;
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbGet(store, key) {
  const db = await openDB();
  return reqToPromise(tx(db, store, 'readonly').get(key));
}

async function dbGetAll(store) {
  const db = await openDB();
  return (await reqToPromise(tx(db, store, 'readonly').getAll())) ?? [];
}

async function dbPut(store, value, key) {
  const db = await openDB();
  const objStore = tx(db, store, 'readwrite');
  const req = key !== undefined ? objStore.put(value, key) : objStore.put(value);
  return reqToPromise(req);
}

async function dbDelete(store, key) {
  const db = await openDB();
  return reqToPromise(tx(db, store, 'readwrite').delete(key));
}

async function dbClear(store) {
  const db = await openDB();
  return reqToPromise(tx(db, store, 'readwrite').clear());
}

// ── Migration from localStorage ───────────────────────────────────────────────

async function migrateFromLocalStorage(db) {
  // Use direct put requests against the open handle so we don't recurse into
  // openDB() while it's still resolving.
  const putRaw = (storeName, value, key) => new Promise((resolve, reject) => {
    const objStore = db.transaction(storeName, 'readwrite').objectStore(storeName);
    const req = key !== undefined ? objStore.put(value, key) : objStore.put(value);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  // ── v1 legacy: designs + autosave from localStorage ──
  const oldDesignsRaw = localStorage.getItem(LEGACY_DESIGNS_KEY);
  if (oldDesignsRaw) {
    try {
      const designs = JSON.parse(oldDesignsRaw);
      if (Array.isArray(designs)) {
        for (const d of designs) {
          if (d && d.id) await putRaw(STORE_DESIGNS, d);
        }
      }
    } catch (err) {
      console.warn('Failed to parse legacy designs:', err);
    }
    localStorage.removeItem(LEGACY_DESIGNS_KEY);
  }

  // ── v2 migration: presets from localStorage → IndexedDB ──
  // Check if the presets store is already populated (don't re-migrate).
  const existingPresets = await new Promise((resolve, reject) => {
    const s = db.transaction(STORE_PRESETS, 'readonly').objectStore(STORE_PRESETS);
    const r = s.count();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });

  if (existingPresets === 0) {
    // Try v2 key first, then v1
    let presets = null;
    const v2Raw = localStorage.getItem(LEGACY_PRESETS_KEY_V2);
    if (v2Raw) {
      try {
        const parsed = JSON.parse(v2Raw);
        if (Array.isArray(parsed)) presets = parsed;
      } catch { /* fall through */ }
    }
    if (!presets) {
      const v1Raw = localStorage.getItem(LEGACY_PRESETS_KEY_V1);
      if (v1Raw) {
        try {
          const parsed = JSON.parse(v1Raw);
          if (Array.isArray(parsed)) presets = parsed;
        } catch { /* ignore */ }
      }
    }
    if (presets) {
      for (const p of presets) {
        if (p && p.id) await putRaw(STORE_PRESETS, p);
      }
    }
  }
  // Clean up both preset localStorage keys regardless
  localStorage.removeItem(LEGACY_PRESETS_KEY_V2);
  localStorage.removeItem(LEGACY_PRESETS_KEY_V1);

  // ── v2 migration: screen DPI from localStorage → IndexedDB ──
  const dpiRaw = localStorage.getItem(LEGACY_DPI_KEY);
  if (dpiRaw) {
    try {
      const v = Number(dpiRaw);
      if (Number.isFinite(v) && v > 0) {
        await putRaw(STORE_SETTINGS, v, 'screenDPI');
      }
    } catch { /* ignore */ }
    localStorage.removeItem(LEGACY_DPI_KEY);
  }
}

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
    // Strip the data URL field — it's been hydrated into ImageData now.
    const { originalImageDataURL: _stripped, ...rest } = l;
    return { ...rest, originalImage };
  }
  return { ...l };
}

// ── Whole-design serialize / deserialize ──────────────────────────────────────

/** Build a serializable design object from current app state.
 *  Stores presetId (stable across reorder/delete) instead of presetIdx.
 *  Pass `id` to overwrite an existing design's record (keeping its gallery
 *  slot); omit it for a fresh save. `savedAt` always refreshes to now. */
export function serializeDesign({ id, name, layers, presetId, customW, customH, labelW, labelH, thumbnail, favorite = false, demoSafe = false }) {
  return {
    id: id ?? `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    thumbnail,
    savedAt: new Date().toISOString(),
    favorite,
    demoSafe,
    presetId,
    customW,
    customH,
    labelW,
    labelH,
    layers: layers.map(serializeLayer),
  };
}

/** Async because image layers reconstruct an ImageData via an Image element.
 *  Resolves presetId to a dropdown index; falls back to Custom if the stock
 *  was deleted. Also handles legacy designs that stored presetIdx. */
export async function deserializeDesign(design, dropdownPresets) {
  const layers = await Promise.all(design.layers.map(deserializeLayer));

  let presetId = design.presetId ?? null;

  // Legacy migration: design stored presetIdx but no presetId.
  if (!presetId && typeof design.presetIdx === 'number' && dropdownPresets) {
    const legacy = dropdownPresets[design.presetIdx];
    if (legacy && legacy.id) presetId = legacy.id;
  }

  // Resolve presetId → index in the current dropdown list.
  let resolvedIdx = null;
  if (presetId && dropdownPresets) {
    const idx = dropdownPresets.findIndex(p => p.id === presetId);
    if (idx >= 0) resolvedIdx = idx;
  }

  // If the stock no longer exists, fall back to Custom with saved dimensions.
  if (resolvedIdx === null && dropdownPresets) {
    resolvedIdx = dropdownPresets.findIndex(p => p.id === 'custom');
    if (resolvedIdx < 0) resolvedIdx = dropdownPresets.length - 1;
  }

  return {
    layers,
    presetId,
    presetIdx: resolvedIdx ?? 0,
    customW: design.customW,
    customH: design.customH,
    id: design.id,
    name: design.name,
    demoSafe: design.demoSafe ?? false,
  };
}

// ── Designs gallery (saved list) ──────────────────────────────────────────────

export async function loadDesigns() {
  const designs = await dbGetAll(STORE_DESIGNS);
  // Backfill demoSafe on any legacy records that predate the field. Persist
  // the backfill so the migration runs only once per record.
  const missing = designs.filter(d => d && d.demoSafe === undefined);
  if (missing.length > 0) {
    for (const d of missing) {
      d.demoSafe = false;
      try { await dbPut(STORE_DESIGNS, d); } catch { /* non-fatal */ }
    }
  }
  return designs;
}

/** Append a design to the saved list. Throws on quota exceeded. */
export async function saveDesign(design) {
  await dbPut(STORE_DESIGNS, design);
}

export async function deleteDesign(id) {
  await dbDelete(STORE_DESIGNS, id);
}

export async function toggleFavorite(id) {
  // Read-modify-write within a single transaction so concurrent toggles can't
  // race against each other.
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const txObj = db.transaction(STORE_DESIGNS, 'readwrite');
    const store = txObj.objectStore(STORE_DESIGNS);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const design = getReq.result;
      if (!design) { resolve(); return; }
      design.favorite = !design.favorite;
      const putReq = store.put(design);
      putReq.onsuccess = () => resolve();
      putReq.onerror = () => reject(putReq.error);
    };
    getReq.onerror = () => reject(getReq.error);
  });
}

// ── Thumbnail ─────────────────────────────────────────────────────────────────

/** Generate a thumbnail data URL by scaling the source canvas down. The
 *  default 150px wide + 0.6 JPEG quality is a much smaller payload than the
 *  previous 200px PNG, which keeps the IndexedDB rows lean for designs with
 *  many saves. */
export function makeThumbnail(srcCanvas, maxWidth = 150) {
  if (!srcCanvas || srcCanvas.width === 0 || srcCanvas.height === 0) return null;
  const ratio = srcCanvas.height / srcCanvas.width;
  const w = Math.min(maxWidth, srcCanvas.width);
  const h = Math.max(1, Math.round(w * ratio));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  // Paint a white background — the canvas may have transparent pixels, and
  // JPEG can't encode alpha so they'd otherwise turn black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(srcCanvas, 0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.6);
}

// ── Presets (label stocks) ────────────────────────────────────────────────────

export async function loadPresetsFromDB() {
  return dbGetAll(STORE_PRESETS);
}

export async function savePresetToDB(preset) {
  await dbPut(STORE_PRESETS, preset);
}

export async function deletePresetFromDB(id) {
  await dbDelete(STORE_PRESETS, id);
}

export async function replaceAllPresets(presets) {
  await dbClear(STORE_PRESETS);
  for (const p of presets) {
    await dbPut(STORE_PRESETS, p);
  }
}

// ── Settings (screen DPI, etc.) ───────────────────────────────────────────────

export async function loadSetting(key) {
  try {
    const val = await dbGet(STORE_SETTINGS, key);
    return val ?? null;
  } catch {
    return null;
  }
}

export async function saveSetting(key, value) {
  await dbPut(STORE_SETTINGS, value, key);
}

export async function deleteSetting(key) {
  await dbDelete(STORE_SETTINGS, key);
}
