// Label-size preset list. Each preset describes a physical label size:
// dimensions plus favorite flag. Print settings (darkness, speed, offsets)
// are global, not per-preset — see the settings store in storage.js.
//
// After v2 storage migration, presets live in IndexedDB (sticky_zebra.presets).
// The "Custom" sentinel is appended at render time and never stored in the DB.

import { loadPresetsFromDB, replaceAllPresets } from './storage.js';

const PRINTER_DPI = 203;

// Fields that were added in Phase 1 (per-stock settings) and subsequently
// removed. Stripped on load so they don't pollute IndexedDB records.
const OBSOLETE_FIELDS = ['darkness', 'speed', 'xOffset', 'yOffset', 'calibrated', 'calibratedAt'];

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
};

function stamp(p, idx = 0) {
  return {
    id: p.id ?? `seed-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
    label: p.label,
    w: p.w,
    h: p.h,
    favorite: !!p.favorite,
  };
}

function isValid(p) {
  return p && typeof p.label === 'string' && Number.isFinite(p.w) && Number.isFinite(p.h);
}

/** Strip any obsolete per-stock fields that may linger from Phase 1. */
function stripObsoleteFields(p) {
  let changed = false;
  const out = { ...p };
  for (const key of OBSOLETE_FIELDS) {
    if (key in out) {
      delete out[key];
      changed = true;
    }
  }
  return changed ? out : p;
}

/** Load the editable preset list from IndexedDB. If the store is empty
 *  (first run or failed migration), seeds the defaults. Strips any
 *  obsolete per-stock fields from Phase 1. */
export async function loadPresets() {
  let presets = await loadPresetsFromDB();

  if (presets.length === 0) {
    const seeded = SEED_PRESETS.map((p, i) => stamp(p, i));
    await replaceAllPresets(seeded);
    return seeded;
  }

  // Validate and strip obsolete fields.
  let needsWrite = false;
  const cleaned = [];
  for (const p of presets) {
    if (!isValid(p)) continue;
    const stripped = stripObsoleteFields(p);
    const stamped = stamp(stripped);
    if (stripped !== p) needsWrite = true;
    cleaned.push(stamped);
  }

  if (needsWrite) {
    await replaceAllPresets(cleaned);
  }

  return cleaned;
}

/** Persist the full preset list (replaces all records). */
export async function savePresets(presets) {
  await replaceAllPresets(presets);
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
  };
}
