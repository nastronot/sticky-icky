import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CUSTOM_PRESET,
  buildDropdownList,
  makePreset,
} from './presets.js';

// The async load/save functions depend on IndexedDB (via storage.js) and are
// integration-tested via the app. Unit tests here cover the pure-logic helpers
// that don't touch storage.

beforeEach(() => {
  vi.restoreAllMocks();
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

  it('includes stock defaults', () => {
    const p = makePreset('test', 2, 1);
    expect(p.darkness).toBe(15);
    expect(p.speed).toBe(1);
    expect(p.xOffset).toBe(8);
    expect(p.yOffset).toBe(0);
    expect(p.calibrated).toBe(false);
    expect(p.calibratedAt).toBeNull();
  });
});

describe('CUSTOM_PRESET', () => {
  it('has null dimensions and stock defaults', () => {
    expect(CUSTOM_PRESET.id).toBe('custom');
    expect(CUSTOM_PRESET.w).toBeNull();
    expect(CUSTOM_PRESET.h).toBeNull();
    expect(CUSTOM_PRESET.darkness).toBe(15);
    expect(CUSTOM_PRESET.speed).toBe(1);
    expect(CUSTOM_PRESET.xOffset).toBe(8);
    expect(CUSTOM_PRESET.yOffset).toBe(0);
    expect(CUSTOM_PRESET.calibrated).toBe(false);
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
