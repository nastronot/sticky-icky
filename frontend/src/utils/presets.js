// Label-size preset list. After this revision there's no built-in vs user
// distinction — every preset is editable, deletable, and favoritable. The
// list is stored as one localStorage record; favorites sort to the top of
// the dropdown list. The "Custom" sentinel is appended at render time and
// is never part of the editable list itself.

const PRESETS_KEY = 'thermal_label_presets_v2';
const LEGACY_PRESETS_KEY = 'thermal_label_presets';
const PRINTER_DPI = 203;

// Used the first time the app runs (no saved presets at all). Also merged
// in alongside legacy user presets when migrating from the v1 format so the
// user starts with the familiar five sizes.
const SEED_PRESETS = [
  { label: '3.00 × 2.00"',   w: 570, h: 406 },
  { label: '4.00 × 2.00"',   w: 832, h: 406 },
  { label: '4.00 × 3.00"',   w: 832, h: 609 },
  { label: '2.25 × 2.00"',   w: 457, h: 406 },
  { label: '2.25 × 1.25"',   w: 457, h: 254 },
];

export const CUSTOM_PRESET = { id: 'custom', label: 'Custom', w: null, h: null, custom: true };

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

/** Load the editable preset list. Migrates from the v1 schema (which only
 *  stored user-added presets, with the five built-ins hardcoded) by merging
 *  the v1 user list onto the seed defaults. */
export function loadPresets() {
  // v2 first
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter(isValid).map(stamp);
    }
  } catch { /* fall through to migration */ }

  // v1 → v2 migration
  let legacy = [];
  try {
    const legacyRaw = localStorage.getItem(LEGACY_PRESETS_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw);
      if (Array.isArray(parsed)) {
        legacy = parsed.filter(isValid).map((p, i) => stamp({ ...p, favorite: false }, i));
      }
      localStorage.removeItem(LEGACY_PRESETS_KEY);
    }
  } catch { /* ignore */ }

  const merged = [...SEED_PRESETS.map((p, i) => stamp(p, i)), ...legacy];
  savePresets(merged);
  return merged;
}

export function savePresets(presets) {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* quota / privacy mode — ignore */
  }
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
