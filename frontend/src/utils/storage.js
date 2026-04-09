// IndexedDB-backed storage for saved designs and the autosave snapshot.
//
// localStorage's ~5MB cap is easily exceeded by image-heavy designs, so we
// keep everything in IndexedDB instead. The schema is intentionally simple:
//
//   db: "sticky_zebra"
//     designs  — keyPath "id"        — every saved design
//     autosave — single record at key "current"
//
// On first open we migrate any leftover thermal_designs / thermal_autosave
// localStorage entries from the previous storage backend, then delete them.

const DB_NAME = 'sticky_zebra';
const DB_VERSION = 1;
const STORE_DESIGNS = 'designs';
const STORE_AUTOSAVE = 'autosave';
const AUTOSAVE_KEY = 'current';

const LEGACY_DESIGNS_KEY = 'thermal_designs';
const LEGACY_AUTOSAVE_KEY = 'thermal_autosave';

// ── IndexedDB wrapper ─────────────────────────────────────────────────────────

let dbReadyPromise = null;

function openRawDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_DESIGNS)) {
        db.createObjectStore(STORE_DESIGNS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_AUTOSAVE)) {
        db.createObjectStore(STORE_AUTOSAVE);
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

  const oldAutosaveRaw = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
  if (oldAutosaveRaw) {
    try {
      const snap = JSON.parse(oldAutosaveRaw);
      if (snap) await putRaw(STORE_AUTOSAVE, snap, AUTOSAVE_KEY);
    } catch (err) {
      console.warn('Failed to parse legacy autosave:', err);
    }
    localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
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
    const { originalImageDataURL, ...rest } = l;
    return { ...rest, originalImage };
  }
  return { ...l };
}

// ── Whole-design serialize / deserialize ──────────────────────────────────────

/** Build a serializable design object from current app state. */
export function serializeDesign({ name, layers, presetIdx, customW, customH, labelW, labelH, thumbnail, favorite = false }) {
  return {
    id: `design-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    thumbnail,
    savedAt: new Date().toISOString(),
    favorite,
    presetIdx,
    customW,
    customH,
    labelW,
    labelH,
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

export async function loadDesigns() {
  return dbGetAll(STORE_DESIGNS);
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

// ── Autosave ──────────────────────────────────────────────────────────────────

export async function autoSave(snapshot) {
  try {
    await dbPut(STORE_AUTOSAVE, snapshot, AUTOSAVE_KEY);
  } catch (err) {
    // Best-effort: a quota error or transient transaction failure shouldn't
    // throw out into the React effect.
    console.warn('Autosave write failed:', err);
  }
}

export async function loadAutoSave() {
  try {
    const snap = await dbGet(STORE_AUTOSAVE, AUTOSAVE_KEY);
    return snap ?? null;
  } catch {
    return null;
  }
}

export async function clearAutoSave() {
  try {
    await dbDelete(STORE_AUTOSAVE, AUTOSAVE_KEY);
  } catch {
    /* ignore */
  }
}
