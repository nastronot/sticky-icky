import { describe, it, expect } from 'vitest';
import { floydSteinberg, atkinson } from './dither.js';

function makeRGBA(pixels) {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return data;
}

function pixelAt(result, i) {
  return [result[i * 4], result[i * 4 + 1], result[i * 4 + 2], result[i * 4 + 3]];
}

const BLACK = [0, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

const algorithms = [
  ['floydSteinberg', floydSteinberg],
  ['atkinson', atkinson],
];

for (const [name, dither] of algorithms) {
  describe(name, () => {
    it('2×1 all-white stays white', () => {
      const input = makeRGBA([[255, 255, 255, 255], [255, 255, 255, 255]]);
      const result = dither(input, 2, 1);
      expect(pixelAt(result, 0)).toEqual(WHITE);
      expect(pixelAt(result, 1)).toEqual(WHITE);
    });

    it('2×1 all-black stays black', () => {
      const input = makeRGBA([[0, 0, 0, 255], [0, 0, 0, 255]]);
      const result = dither(input, 2, 1);
      expect(pixelAt(result, 0)).toEqual(BLACK);
      expect(pixelAt(result, 1)).toEqual(BLACK);
    });

    it('2×1 mid-gray (128) produces one black and one white pixel', () => {
      const input = makeRGBA([[128, 128, 128, 255], [128, 128, 128, 255]]);
      const result = dither(input, 2, 1);
      const p0 = pixelAt(result, 0);
      const p1 = pixelAt(result, 1);
      const blacks = [p0, p1].filter(p => p[0] === 0).length;
      const whites = [p0, p1].filter(p => p[0] === 255).length;
      expect(blacks).toBeGreaterThanOrEqual(1);
      expect(whites).toBeGreaterThanOrEqual(1);
    });

    it('does not mutate the input array', () => {
      const input = makeRGBA([[128, 128, 128, 255], [128, 128, 128, 255]]);
      const copy = new Uint8ClampedArray(input);
      dither(input, 2, 1);
      expect(input).toEqual(copy);
    });
  });
}
