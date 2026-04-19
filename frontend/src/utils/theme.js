// Theme + accent state. Backed by the existing IndexedDB settings store —
// no schema change needed because that store is key-value.
//
// A theme class (theme-light / theme-dark / theme-oled) and an accent class
// (accent-<id>) are both applied to <html>. CSS variables cascade from the
// theme class (surfaces + text tokens) and the accent class (--accent and
// friends). See components/studio.css for the variable definitions.

import { loadSetting, saveSetting } from './storage.js';

export const THEMES = ['light', 'dark', 'oled'];
export const DEFAULT_THEME = 'oled';

export const ACCENTS = [
  { id: 'zebra-yellow', name: 'Zebra Yellow', value: '#FED00A', fg: '#000000' },
  { id: 'hot-magenta',  name: 'Hot Magenta',  value: '#FF2E93', fg: '#000000' },
  { id: 'cyber-cyan',   name: 'Cyber Cyan',   value: '#00E5FF', fg: '#000000' },
  { id: 'acid-lime',    name: 'Acid Lime',    value: '#C6FF00', fg: '#000000' },
  { id: 'blaze-orange', name: 'Blaze Orange', value: '#FF6B1A', fg: '#000000' },
  { id: 'riot-purple',  name: 'Riot Purple',  value: '#B026FF', fg: '#FFFFFF' },
  { id: 'siren-red',    name: 'Siren Red',    value: '#FF1744', fg: '#FFFFFF' },
];
export const DEFAULT_ACCENT = 'zebra-yellow';

export function normalizeTheme(t) {
  return THEMES.includes(t) ? t : DEFAULT_THEME;
}

export function normalizeAccent(a) {
  return ACCENTS.some(x => x.id === a) ? a : DEFAULT_ACCENT;
}

/** Apply theme + accent classes to <html>. Removes stale classes from any
 *  previous selection first so toggling is clean. */
export function applyTheme(theme, accent) {
  const html = document.documentElement;
  const t = normalizeTheme(theme);
  const a = normalizeAccent(accent);
  for (const name of THEMES) html.classList.remove(`theme-${name}`);
  for (const entry of ACCENTS) html.classList.remove(`accent-${entry.id}`);
  html.classList.add(`theme-${t}`);
  html.classList.add(`accent-${a}`);
}

export async function loadTheme() {
  const v = await loadSetting('theme');
  return normalizeTheme(v);
}

export async function loadAccent() {
  const v = await loadSetting('accent');
  return normalizeAccent(v);
}

export async function saveTheme(theme) {
  await saveSetting('theme', normalizeTheme(theme));
}

export async function saveAccent(accent) {
  await saveSetting('accent', normalizeAccent(accent));
}
