// Screen DPI calibration — backed by IndexedDB (sticky_zebra.settings).
// The value migrates from localStorage on first v2 DB open (see storage.js).

import { loadSetting, saveSetting, deleteSetting } from './storage.js';

export async function loadScreenDPI() {
  const v = await loadSetting('screenDPI');
  if (v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function saveScreenDPI(dpi) {
  await saveSetting('screenDPI', dpi);
}

export async function clearScreenDPI() {
  await deleteSetting('screenDPI');
}
