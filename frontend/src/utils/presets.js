// Label-size preset list. Built-in presets are immutable; user-added presets
// live in localStorage and can be added / deleted from the right-sidebar
// editor. The "Custom" sentinel is always last and lets the label size be
// specified in inches via the W/H inputs.

const USER_PRESETS_KEY = 'thermal_label_presets';
const PRINTER_DPI = 203;

export const DEFAULT_PRESETS = [
  { label: '3.00 × 2.00"',   w: 570, h: 406, builtin: true },
  { label: '4.00 × 2.00"',   w: 832, h: 406, builtin: true },
  { label: '4.00 × 3.00"',   w: 832, h: 609, builtin: true },
  { label: '2.25 × 2.00"',   w: 457, h: 406, builtin: true },
  { label: '2.25 × 1.25"',   w: 457, h: 254, builtin: true },
];

export const CUSTOM_PRESET = { label: 'Custom', w: null, h: null, builtin: true, custom: true };

/** User-added preset shape: { id, label, w, h, builtin: false } where w/h are
 *  in printer dots. Stored under thermal_label_presets in localStorage. */

export function loadUserPresets() {
  try {
    const raw = localStorage.getItem(USER_PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(p => p && typeof p.label === 'string' && Number.isFinite(p.w) && Number.isFinite(p.h));
  } catch {
    return [];
  }
}

export function saveUserPresets(presets) {
  try {
    localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    /* quota / privacy mode — ignore */
  }
}

/** Merged dropdown list: defaults → user-added → Custom. */
export function mergedPresets(userPresets) {
  return [...DEFAULT_PRESETS, ...userPresets, CUSTOM_PRESET];
}

/** Make a new user preset from inches input. */
export function makeUserPreset(label, widthInches, heightInches) {
  return {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    label,
    w: Math.max(1, Math.round(widthInches * PRINTER_DPI)),
    h: Math.max(1, Math.round(heightInches * PRINTER_DPI)),
    builtin: false,
  };
}
