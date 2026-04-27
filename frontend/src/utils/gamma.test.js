import { describe, it, expect } from 'vitest';
import { SRGB_TO_LINEAR_LUT, gammaLUT } from './gamma.js';

describe('SRGB_TO_LINEAR_LUT', () => {
  it('has 256 entries', () => {
    expect(SRGB_TO_LINEAR_LUT.length).toBe(256);
  });

  it('endpoints are exact (0 → 0, 255 → 255)', () => {
    expect(SRGB_TO_LINEAR_LUT[0]).toBe(0);
    expect(SRGB_TO_LINEAR_LUT[255]).toBe(255);
  });

  it('is monotonic non-decreasing', () => {
    for (let i = 1; i < 256; i++) {
      expect(SRGB_TO_LINEAR_LUT[i]).toBeGreaterThanOrEqual(SRGB_TO_LINEAR_LUT[i - 1]);
    }
  });

  it('sRGB 128 maps to roughly 22% linear (≈55)', () => {
    // sRGB midtone is 21.6% linear luminance. Allow ±2 bytes of rounding.
    expect(SRGB_TO_LINEAR_LUT[128]).toBeGreaterThanOrEqual(53);
    expect(SRGB_TO_LINEAR_LUT[128]).toBeLessThanOrEqual(57);
  });

  it('gammaLUT(true) returns the LUT, gammaLUT(false) returns null', () => {
    expect(gammaLUT(true)).toBe(SRGB_TO_LINEAR_LUT);
    expect(gammaLUT(false)).toBe(null);
  });
});
