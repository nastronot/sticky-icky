// Label-stock preset list. Each preset describes a physical label stock with
// dimensions and per-stock print settings (darkness, speed, GW offsets).
//
// After v2 storage migration, presets live in IndexedDB (sticky_zebra.presets).
// The "Custom" sentinel is appended at render time and never stored in the DB.

import { loadPresetsFromDB, savePresetToDB, deletePresetFromDB, replaceAllPresets } from './storage.js';

const PRINTER_DPI = 203;

// Default print-setting values applied to every new or migrated preset.
const STOCK_DEFAULTS = {
  darkness: 15,
  speed: 1,
  xOffset: 8,
  yOffset: 0,
  calibrated: false,
  calibratedAt: null,
};

// Used the first time the app runs (no saved presets at all).
const SEED_PRESETS = [
  { label: '3.00 \u00d7 2.00"',   w: 570, h: 406 },
  { label: '4.00 \u00d7 2.00"',   w: 832, h: 406 },
  { label: '4.00 \u00d7 3.00"',   w: 832, h: 609 },
  { label: '2.25 \u00d7 2.00"',   w: 457, h: 406 },
  { label: '2.25 \u00d7 1.25"',   w: 457, h: 254 },
];

export const CUSTOM_PRESET = {
  id: 'custom',
  label: 'Custom',
  w: null,
  h: null,
  custom: true,
  ...STOCK_DEFAULTS,
};

/** Ensure a preset has all required fields (fills in stock defaults for
 *  presets migrated from the old shape that lack them). */
function ensureStockFields(p) {
  let changed = false;
  const out = { ...p };
  for (const [key, def] of Object.entries(STOCK_DEFAULTS)) {
    if (out[key] === undefined) {
      out[key] = def;
      changed = true;
    }
  }
  return changed ? out : p;
}

function stamp(p, idx = 0) {
  return ensureStockFields({
    id: p.id ?? `seed-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    label: p.label,
    w: p.w,
    h: p.h,
    favorite: !!p.favorite,
    darkness: p.darkness,
    speed: p.speed,
    xOffset: p.xOffset,
    yOffset: p.yOffset,
    calibrated: p.calibrated,
    calibratedAt: p.calibratedAt,
  });
}

function isValid(p) {
  return p && typeof p.label === 'string' && Number.isFinite(p.w) && Number.isFinite(p.h);
}

/** Load the editable preset list from IndexedDB. If the store is empty
 *  (first run or failed migration), seeds the defaults. Also backfills
 *  stock fields on any legacy presets that lack them. */
export async function loadPresets() {
  let presets = await loadPresetsFromDB();

  if (presets.length === 0) {
    // Seed defaults
    const seeded = SEED_PRESETS.map((p, i) => stamp(p, i));
    await replaceAllPresets(seeded);
    return seeded;
  }

  // Validate and backfill stock fields on legacy presets.
  let needsWrite = false;
  const cleaned = [];
  for (const p of presets) {
    if (!isValid(p)) continue;
    const filled = ensureStockFields(p);
    if (filled !== p) needsWrite = true;
    cleaned.push(filled);
  }

  // Persist any backfilled changes.
  if (needsWrite) {
    await replaceAllPresets(cleaned);
  }

  return cleaned;
}

/** Persist the full preset list (replaces all records). */
export async function savePresets(presets) {
  await replaceAllPresets(presets);
}

/** Save a single preset (add or update). */
export async function saveOnePreset(preset) {
  await savePresetToDB(preset);
}

/** Delete a single preset by id. */
export async function deletePreset(id) {
  await deletePresetFromDB(id);
}

/** Build the dropdown list: favorites first (stable within group), then
 *  the rest, then the Custom sentinel. */
export function buildDropdownList(presets) {
  const fav = presets.filter(p => p.favorite);
  const rest = presets.filter(p => !p.favorite);
  return [...fav, ...rest, CUSTOM_PRESET];
}

export function makePreset(label, widthInches, heightInches) {
  return {
    id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label,
    w: Math.max(1, Math.round(widthInches * PRINTER_DPI)),
    h: Math.max(1, Math.round(heightInches * PRINTER_DPI)),
    favorite: false,
    ...STOCK_DEFAULTS,
  };
}
