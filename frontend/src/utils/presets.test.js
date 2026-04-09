import { describe, it, expect, beforeEach } from 'vitest';
import {
  CUSTOM_PRESET,
  loadPresets,
  savePresets,
  buildDropdownList,
  makePreset,
} from './presets.js';

// Tiny in-memory localStorage stub installed before each test so the
// load/save helpers can run in the default node test environment without a
// jsdom dependency.
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (i) => Array.from(store.keys())[i] ?? null,
  };
  return store;
}

beforeEach(() => {
  installLocalStorage();
});

describe('makePreset', () => {
  it('converts inches to dots at 203 DPI', () => {
    const p = makePreset('test', 2.0, 1.0);
    expect(p.w).toBe(406);
    expect(p.h).toBe(203);
  });

  it('rounds to the nearest integer dot', () => {
    const p = makePreset('odd', 1.005, 1.005);
    // 1.005 * 203 = 203.115 → 203
    expect(p.w).toBe(204);
    expect(p.h).toBe(204);
  });

  it('clamps to a 1px minimum', () => {
    const p = makePreset('zero', 0, 0);
    expect(p.w).toBe(1);
    expect(p.h).toBe(1);
  });

  it('starts unfavorited', () => {
    const p = makePreset('test', 2, 1);
    expect(p.favorite).toBe(false);
  });

  it('generates a unique id', () => {
    const a = makePreset('a', 2, 1);
    const b = makePreset('b', 2, 1);
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^preset-/);
  });

  it('preserves the supplied label', () => {
    const p = makePreset('My Label', 2, 1);
    expect(p.label).toBe('My Label');
  });
});

describe('buildDropdownList', () => {
  const a = { id: 'a', label: 'A', w: 100, h: 100, favorite: false };
  const b = { id: 'b', label: 'B', w: 100, h: 100, favorite: true };
  const c = { id: 'c', label: 'C', w: 100, h: 100, favorite: false };
  const d = { id: 'd', label: 'D', w: 100, h: 100, favorite: true };

  it('appends the Custom sentinel at the end', () => {
    const list = buildDropdownList([a, b]);
    expect(list[list.length - 1]).toBe(CUSTOM_PRESET);
  });

  it('puts favorites first, in their original order', () => {
    const list = buildDropdownList([a, b, c, d]);
    // expected order: b, d (favorites in input order), a, c (rest), CUSTOM
    expect(list.slice(0, 4).map(p => p.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('handles all-favorited input', () => {
    const list = buildDropdownList([b, d]);
    expect(list.map(p => p.id)).toEqual(['b', 'd', 'custom']);
  });

  it('handles no-favorites input', () => {
    const list = buildDropdownList([a, c]);
    expect(list.map(p => p.id)).toEqual(['a', 'c', 'custom']);
  });

  it('handles empty input', () => {
    const list = buildDropdownList([]);
    expect(list).toEqual([CUSTOM_PRESET]);
  });
});

describe('loadPresets', () => {
  it('seeds defaults on first run when nothing is stored', () => {
    const presets = loadPresets();
    expect(presets.length).toBeGreaterThan(0);
    // The seed list contains the familiar five built-ins, all unfavorited.
    const labels = presets.map(p => p.label);
    expect(labels).toContain('3.00 × 2.00"');
    expect(labels).toContain('4.00 × 2.00"');
    for (const p of presets) {
      expect(p.favorite).toBe(false);
      expect(p.id).toBeTruthy();
    }
  });

  it('persists the seed write back to localStorage', () => {
    loadPresets();
    expect(localStorage.getItem('thermal_label_presets_v2')).toBeTruthy();
  });

  it('round-trips a saved list', () => {
    const original = [
      { id: 'a', label: 'A', w: 100, h: 50, favorite: true },
      { id: 'b', label: 'B', w: 200, h: 100, favorite: false },
    ];
    savePresets(original);
    const loaded = loadPresets();
    expect(loaded).toEqual(original);
  });

  it('drops malformed entries on load', () => {
    localStorage.setItem('thermal_label_presets_v2', JSON.stringify([
      { id: 'good', label: 'Good', w: 100, h: 50, favorite: false },
      { id: 'no-label', w: 100, h: 50 },                // missing label
      { id: 'bad-w', label: 'Bad', w: 'oops', h: 50 },  // non-finite w
      null,                                              // null
    ]));
    const loaded = loadPresets();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].label).toBe('Good');
  });

  it('falls back to seeds on JSON parse failure', () => {
    localStorage.setItem('thermal_label_presets_v2', '{not valid json');
    const loaded = loadPresets();
    expect(loaded.length).toBeGreaterThan(0);
    expect(loaded[0].label).toBe('3.00 × 2.00"');
  });

  it('migrates the v1 (legacy) thermal_label_presets key', () => {
    // v1 stored only USER-added presets — defaults were hardcoded.
    localStorage.setItem('thermal_label_presets', JSON.stringify([
      { label: 'My Label', w: 300, h: 200 },
    ]));
    const loaded = loadPresets();
    // Migration should keep the user preset alongside the seeded defaults.
    expect(loaded.find(p => p.label === 'My Label')).toBeTruthy();
    expect(loaded.find(p => p.label === '3.00 × 2.00"')).toBeTruthy();
    // And remove the legacy key.
    expect(localStorage.getItem('thermal_label_presets')).toBeNull();
  });
});

describe('savePresets', () => {
  it('writes JSON to the v2 key', () => {
    const presets = [{ id: 'x', label: 'X', w: 50, h: 50, favorite: false }];
    savePresets(presets);
    expect(JSON.parse(localStorage.getItem('thermal_label_presets_v2'))).toEqual(presets);
  });

  it('overwrites the previous list', () => {
    savePresets([{ id: 'a', label: 'A', w: 1, h: 1, favorite: false }]);
    savePresets([{ id: 'b', label: 'B', w: 2, h: 2, favorite: true }]);
    const stored = JSON.parse(localStorage.getItem('thermal_label_presets_v2'));
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('b');
  });
});
