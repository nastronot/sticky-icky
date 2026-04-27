import { describe, it, expect } from 'vitest';
import { riemersmaDither } from './riemersma.js';

describe('riemersmaDither', () => {
  it('all-white stays white', () => {
    const buf = new Float32Array(64).fill(255);
    riemersmaDither(buf, 8, 8, 128, 1);
    for (const v of buf) expect(v).toBe(255);
  });

  it('all-black stays black', () => {
    const buf = new Float32Array(64).fill(0);
    riemersmaDither(buf, 8, 8, 128, 1);
    for (const v of buf) expect(v).toBe(0);
  });

  it('mid-grey 128 produces roughly 50/50 black/white', () => {
    // 16×16 = 256 pixels at exactly 128. Expect a mix tilted toward black
    // because the cutoff comparison is `>= cutoff` for white. Wide
    // tolerance to accommodate the curve traversal start-up transient.
    const buf = new Float32Array(256).fill(128);
    riemersmaDither(buf, 16, 16, 128, 1);
    let whites = 0;
    for (const v of buf) if (v === 255) whites++;
    expect(whites).toBeGreaterThan(64);
    expect(whites).toBeLessThan(192);
  });

  it('output is purely binary (0 or 255)', () => {
    const buf = new Float32Array(64);
    for (let i = 0; i < 64; i++) buf[i] = (i * 4) % 256;
    riemersmaDither(buf, 8, 8, 128, 1);
    for (const v of buf) expect([0, 255]).toContain(v);
  });

  it('handles non-power-of-two dimensions', () => {
    // 7×5 with mid-grey input — vanilla Hilbert pads to 8×8 internally.
    // Just check the call returns binary output without error.
    const buf = new Float32Array(35).fill(128);
    expect(() => riemersmaDither(buf, 7, 5, 128, 1)).not.toThrow();
    for (const v of buf) expect([0, 255]).toContain(v);
  });

  it('amount=0 collapses to a hard threshold', () => {
    const buf = new Float32Array(8);
    buf[0] = 0;     // black
    buf[1] = 64;    // dark
    buf[2] = 127;   // just below cutoff
    buf[3] = 128;   // at cutoff (rounds up)
    buf[4] = 200;   // light
    buf[5] = 255;   // white
    buf[6] = 100;
    buf[7] = 150;
    const expected = [0, 0, 0, 255, 255, 255, 0, 255];
    riemersmaDither(buf, 8, 1, 128, 0);
    for (let i = 0; i < 8; i++) expect(buf[i]).toBe(expected[i]);
  });
});
