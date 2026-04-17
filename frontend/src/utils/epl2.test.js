import { describe, it, expect } from 'vitest';
import { encodePrintPayload } from './epl2.js';

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

function bitmapBytes(payload) {
  const bin = atob(payload.bitmap);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const BLACK = [0, 0, 0, 255];
const WHITE = [255, 255, 255, 255];

describe('encodePrintPayload', () => {
  it('8×1 all-black: width_bytes=1, bitmap=0xFF', () => {
    const data = makeRGBA(Array(8).fill(BLACK));
    const payload = encodePrintPayload(data, 8, 1, 100, 50);
    const bytes = bitmapBytes(payload);
    expect(bytes.length).toBe(1);
    expect(bytes[0]).toBe(0xff);
    expect(payload.width).toBe(8);
    expect(payload.height).toBe(1);
    expect(payload.labelW).toBe(100);
    expect(payload.labelH).toBe(50);
  });

  it('8×1 all-white: bitmap=0x00', () => {
    const data = makeRGBA(Array(8).fill(WHITE));
    const payload = encodePrintPayload(data, 8, 1, 100, 50);
    const bytes = bitmapBytes(payload);
    expect(bytes.length).toBe(1);
    expect(bytes[0]).toBe(0x00);
  });

  it('16×1 already-aligned all-black: width_bytes=2', () => {
    const data = makeRGBA(Array(16).fill(BLACK));
    const payload = encodePrintPayload(data, 16, 1, 100, 50);
    const bytes = bitmapBytes(payload);
    expect(bytes.length).toBe(2);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xff);
    expect(payload.width).toBe(16);
  });

  it('9×1 unaligned all-black: padded to 16 bits, second byte has only MSB set', () => {
    const data = makeRGBA(Array(9).fill(BLACK));
    const payload = encodePrintPayload(data, 9, 1, 100, 50);
    const bytes = bitmapBytes(payload);
    expect(bytes.length).toBe(2);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0x80); // bit 8 set, bits 9..15 are padding (white)
    expect(payload.width).toBe(16); // padded width
  });

  it('mixed pattern: black-white-black-white...0xAA', () => {
    const pixels = [];
    for (let i = 0; i < 8; i++) pixels.push(i % 2 === 0 ? BLACK : WHITE);
    const data = makeRGBA(pixels);
    const payload = encodePrintPayload(data, 8, 1, 100, 50);
    const bytes = bitmapBytes(payload);
    expect(bytes[0]).toBe(0xaa); // 10101010
  });

  it('darkness, speed, xOffset, yOffset default correctly', () => {
    const data = makeRGBA(Array(8).fill(WHITE));
    const payload = encodePrintPayload(data, 8, 1, 100, 50);
    expect(payload.darkness).toBe(12);
    expect(payload.speed).toBe(1);
    expect(payload.xOffset).toBe(10);
    expect(payload.yOffset).toBe(0);
  });

  it('darkness, speed, xOffset, yOffset pass through when explicitly set', () => {
    const data = makeRGBA(Array(8).fill(WHITE));
    const payload = encodePrintPayload(data, 8, 1, 100, 50, 15, 3, 2, 10, 5);
    expect(payload.darkness).toBe(15);
    expect(payload.speed).toBe(3);
    expect(payload.copies).toBe(2);
    expect(payload.xOffset).toBe(10);
    expect(payload.yOffset).toBe(5);
  });

  it('multi-row 8×2: each row contributes one byte', () => {
    // Row 0: all black, row 1: all white
    const data = makeRGBA([...Array(8).fill(BLACK), ...Array(8).fill(WHITE)]);
    const payload = encodePrintPayload(data, 8, 2, 100, 50);
    const bytes = bitmapBytes(payload);
    expect(bytes.length).toBe(2);
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0x00);
  });
});
