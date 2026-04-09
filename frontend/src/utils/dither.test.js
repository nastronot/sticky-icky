import { describe, it, expect } from 'vitest';
import {
  floydSteinberg,
  atkinson,
  applyBayerDither,
  applyErrorDiffusion,
  applyDither,
  BAYER_4,
  BAYER_8,
  FLOYD_KERNEL,
  ATKINSON_KERNEL,
} from './dither.js';

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

// ── Sidebar dither pipeline (in-place ImageData buffer mutation) ─────────────

describe('BAYER matrices', () => {
  it('BAYER_4 has 16 entries in [0, 15]', () => {
    expect(BAYER_4).toHaveLength(16);
    for (const v of BAYER_4) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(15);
    }
    // every value 0..15 appears exactly once
    expect(new Set(BAYER_4).size).toBe(16);
  });

  it('BAYER_8 has 64 entries in [0, 63]', () => {
    expect(BAYER_8).toHaveLength(64);
    for (const v of BAYER_8) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(63);
    }
    expect(new Set(BAYER_8).size).toBe(64);
  });

  it('FLOYD_KERNEL weights sum to 1', () => {
    const sum = FLOYD_KERNEL.reduce((s, [, , w]) => s + w, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it('ATKINSON_KERNEL distributes 6/8 of the error', () => {
    const sum = ATKINSON_KERNEL.reduce((s, [, , w]) => s + w, 0);
    expect(sum).toBeCloseTo(6 / 8, 10);
  });
});

describe('applyBayerDither', () => {
  it('amount=0 is a no-op on solid black', () => {
    const data = makeRGBA(Array(64).fill(BLACK));
    const before = new Uint8ClampedArray(data);
    applyBayerDither(data, 8, 8, BAYER_8, 8, 0);
    expect(data).toEqual(before);
  });

  it('amount=1 flips every black pixel to white', () => {
    const data = makeRGBA(Array(64).fill(BLACK));
    applyBayerDither(data, 8, 8, BAYER_8, 8, 1);
    for (let i = 0; i < 64; i++) {
      expect(pixelAt(data, i)).toEqual(WHITE);
    }
  });

  it('leaves white pixels untouched', () => {
    const data = makeRGBA(Array(16).fill(WHITE));
    applyBayerDither(data, 4, 4, BAYER_4, 4, 1);
    for (let i = 0; i < 16; i++) {
      expect(pixelAt(data, i)).toEqual(WHITE);
    }
  });

  it('amount=0.5 flips roughly half the black pixels', () => {
    const data = makeRGBA(Array(256).fill(BLACK));
    applyBayerDither(data, 16, 16, BAYER_8, 8, 0.5);
    const flipped = Array.from({ length: 256 }, (_, i) => pixelAt(data, i)[0])
      .filter(v => v === 255).length;
    expect(flipped).toBeGreaterThan(96);
    expect(flipped).toBeLessThan(160);
  });

  it('preserves alpha when flipping', () => {
    const data = makeRGBA([[0, 0, 0, 200]]);
    applyBayerDither(data, 1, 1, BAYER_4, 4, 1);
    expect(data[3]).toBe(200);
  });
});

describe('applyErrorDiffusion', () => {
  it('amount=0 is a no-op on solid black', () => {
    const data = makeRGBA(Array(64).fill(BLACK));
    const before = new Uint8ClampedArray(data);
    applyErrorDiffusion(data, 8, 8, FLOYD_KERNEL, 0);
    expect(data).toEqual(before);
  });

  it('amount=1 produces a non-empty mix on solid black', () => {
    const data = makeRGBA(Array(256).fill(BLACK));
    applyErrorDiffusion(data, 16, 16, FLOYD_KERNEL, 1);
    const whites = Array.from({ length: 256 }, (_, i) => pixelAt(data, i)[0])
      .filter(v => v === 255).length;
    // Solid-black input lifted to ~mid-gray then dithered should be roughly
    // 50% white. Wide tolerance.
    expect(whites).toBeGreaterThan(64);
    expect(whites).toBeLessThan(192);
  });

  it('leaves white pixels alone', () => {
    const data = makeRGBA(Array(64).fill(WHITE));
    applyErrorDiffusion(data, 8, 8, ATKINSON_KERNEL, 1);
    for (let i = 0; i < 64; i++) {
      expect(pixelAt(data, i)).toEqual(WHITE);
    }
  });
});

describe('applyDither dispatcher', () => {
  it('algo "none" is a no-op', () => {
    const data = makeRGBA(Array(64).fill(BLACK));
    const before = new Uint8ClampedArray(data);
    applyDither(data, 8, 8, 'none', 100);
    expect(data).toEqual(before);
  });

  it('amount=0 is a no-op for any algo', () => {
    const algos = ['bayer4', 'bayer8', 'floyd', 'atkinson'];
    for (const algo of algos) {
      const data = makeRGBA(Array(64).fill(BLACK));
      const before = new Uint8ClampedArray(data);
      applyDither(data, 8, 8, algo, 0);
      expect(data).toEqual(before);
    }
  });

  it('unknown algo is a no-op', () => {
    const data = makeRGBA(Array(64).fill(BLACK));
    const before = new Uint8ClampedArray(data);
    applyDither(data, 8, 8, 'nonsense', 50);
    expect(data).toEqual(before);
  });

  it('bayer4 / bayer8 paths produce non-zero white at amount=100', () => {
    for (const algo of ['bayer4', 'bayer8']) {
      const data = makeRGBA(Array(64).fill(BLACK));
      applyDither(data, 8, 8, algo, 100);
      const whites = Array.from({ length: 64 }, (_, i) => pixelAt(data, i)[0])
        .filter(v => v === 255).length;
      expect(whites).toBe(64); // amount=100 flips them all
    }
  });

  it('floyd / atkinson paths produce a mix at amount=100', () => {
    for (const algo of ['floyd', 'atkinson']) {
      const data = makeRGBA(Array(256).fill(BLACK));
      applyDither(data, 16, 16, algo, 100);
      const whites = Array.from({ length: 256 }, (_, i) => pixelAt(data, i)[0])
        .filter(v => v === 255).length;
      expect(whites).toBeGreaterThan(0);
      expect(whites).toBeLessThan(256);
    }
  });
});
