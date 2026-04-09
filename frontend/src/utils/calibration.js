// Tiny localStorage-backed store for the screen DPI calibration result.
// Lives outside storage.js (which is IndexedDB-only) because the calibrated
// value is small, single-record, and read synchronously on mount.

const DPI_KEY = 'thermal_screen_dpi';

export function loadScreenDPI() {
  try {
    const raw = localStorage.getItem(DPI_KEY);
    if (!raw) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

export function saveScreenDPI(dpi) {
  try {
    localStorage.setItem(DPI_KEY, String(dpi));
  } catch {
    /* quota / privacy mode — ignore */
  }
}

export function clearScreenDPI() {
  try {
    localStorage.removeItem(DPI_KEY);
  } catch {
    /* ignore */
  }
}
