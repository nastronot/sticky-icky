import { describe, it, expect, beforeEach } from 'vitest';
import { loadScreenDPI, saveScreenDPI, clearScreenDPI } from './calibration.js';

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
}

beforeEach(() => {
  installLocalStorage();
});

describe('loadScreenDPI', () => {
  it('returns null when no DPI is stored', () => {
    expect(loadScreenDPI()).toBeNull();
  });

  it('returns the stored DPI as a number', () => {
    saveScreenDPI(110);
    expect(loadScreenDPI()).toBe(110);
  });

  it('round-trips floating point DPI', () => {
    saveScreenDPI(96.5);
    expect(loadScreenDPI()).toBe(96.5);
  });

  it('returns null for non-finite stored values', () => {
    localStorage.setItem('thermal_screen_dpi', 'not-a-number');
    expect(loadScreenDPI()).toBeNull();
  });

  it('returns null for zero or negative stored DPI', () => {
    localStorage.setItem('thermal_screen_dpi', '0');
    expect(loadScreenDPI()).toBeNull();
    localStorage.setItem('thermal_screen_dpi', '-50');
    expect(loadScreenDPI()).toBeNull();
  });
});

describe('saveScreenDPI', () => {
  it('persists the DPI under the expected key', () => {
    saveScreenDPI(120);
    expect(localStorage.getItem('thermal_screen_dpi')).toBe('120');
  });

  it('overwrites the previous value', () => {
    saveScreenDPI(96);
    saveScreenDPI(144);
    expect(loadScreenDPI()).toBe(144);
  });
});

describe('clearScreenDPI', () => {
  it('removes a stored value', () => {
    saveScreenDPI(96);
    clearScreenDPI();
    expect(loadScreenDPI()).toBeNull();
  });

  it('is a no-op when nothing is stored', () => {
    expect(() => clearScreenDPI()).not.toThrow();
    expect(loadScreenDPI()).toBeNull();
  });
});
