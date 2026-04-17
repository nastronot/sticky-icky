import { describe, it, expect } from 'vitest';

// After the v2 storage migration, calibration.js delegates entirely to
// IndexedDB via storage.js. The async load/save/clear functions are
// integration-tested through the app. This file verifies the module
// exports exist so import-time errors are caught early.

describe('calibration module', () => {
  it('exports the expected async functions', async () => {
    const mod = await import('./calibration.js');
    expect(typeof mod.loadScreenDPI).toBe('function');
    expect(typeof mod.saveScreenDPI).toBe('function');
    expect(typeof mod.clearScreenDPI).toBe('function');
  });
});
