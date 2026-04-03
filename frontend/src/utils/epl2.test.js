import { describe, it, expect } from 'vitest';
import { encodeGW } from './epl2.js';

function makeRGBA(pixels) {
  // pixels: array of [r, g, b, a]
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b, a], i) => {
    data[i * 4 + 0] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  });
  return data;
}

function parseHeader(result) {
  const text = new TextDecoder().decode(result);
  const headerEnd = text.indexOf('\r\n');
  const header = text.slice(0, headerEnd);
  const bitmapOffset = headerEnd + 2;
  return { header, bitmapOffset };
}

describe('encodeGW', () => {
  it('8×1 all-black: width_bytes=1, bitmap=0xFF', () => {
    const pixels = Array(8).fill([0, 0, 0, 255]);
    const imageData = makeRGBA(pixels);
    const result = encodeGW(imageData, 8, 1);
    const { header, bitmapOffset } = parseHeader(result);

    expect(header).toBe('GW0,0,1,1');
    expect(result[bitmapOffset]).toBe(0xff);
    expect(result.length).toBe(bitmapOffset + 1);
  });

  it('8×1 all-white: bitmap=0x00', () => {
    const pixels = Array(8).fill([255, 255, 255, 255]);
    const imageData = makeRGBA(pixels);
    const result = encodeGW(imageData, 8, 1);
    const { header, bitmapOffset } = parseHeader(result);

    expect(header).toBe('GW0,0,1,1');
    expect(result[bitmapOffset]).toBe(0x00);
  });

  it('16×1 already-aligned: width_bytes=2, no extra padding', () => {
    const pixels = Array(16).fill([0, 0, 0, 255]);
    const imageData = makeRGBA(pixels);
    const result = encodeGW(imageData, 16, 1);
    const { header, bitmapOffset } = parseHeader(result);

    expect(header).toBe('GW0,0,2,1');
    expect(result[bitmapOffset]).toBe(0xff);
    expect(result[bitmapOffset + 1]).toBe(0xff);
    expect(result.length).toBe(bitmapOffset + 2);
  });

  it('9×1 unaligned: padded to 16 bits, width_bytes=2', () => {
    // 9 black pixels → first byte 0xFF, second byte MSB set (0x80), rest 0
    const pixels = Array(9).fill([0, 0, 0, 255]);
    const imageData = makeRGBA(pixels);
    const result = encodeGW(imageData, 9, 1);
    const { header, bitmapOffset } = parseHeader(result);

    expect(header).toBe('GW0,0,2,1');
    expect(result[bitmapOffset]).toBe(0xff);
    expect(result[bitmapOffset + 1]).toBe(0x80);
    expect(result.length).toBe(bitmapOffset + 2);
  });
});
