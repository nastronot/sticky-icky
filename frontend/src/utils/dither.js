// ── Sidebar dither pipeline ───────────────────────────────────────────────────
//
// The functions below operate in-place on a Canvas ImageData.data buffer and
// power BigText's "Dithering" sidebar control. They are intentionally distinct
// from the floydSteinberg / atkinson exports further down (which take RGBA in,
// return new RGBA out) — those are kept for the existing tests and for any
// future image-import dithering pipeline.

// Standard Bayer ordered-dither matrices, values 0..n²-1.
export const BAYER_4 = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

export const BAYER_8 = [
   0, 32,  8, 40,  2, 34, 10, 42,
  48, 16, 56, 24, 50, 18, 58, 26,
  12, 44,  4, 36, 14, 46,  6, 38,
  60, 28, 52, 20, 62, 30, 54, 22,
   3, 35, 11, 43,  1, 33,  9, 41,
  51, 19, 59, 27, 49, 17, 57, 25,
  15, 47,  7, 39, 13, 45,  5, 37,
  63, 31, 55, 23, 61, 29, 53, 21,
];

// Error-diffusion kernels: [dx, dy, weight] from the current pixel.
export const FLOYD_KERNEL = [
  [ 1, 0, 7 / 16],
  [-1, 1, 3 / 16],
  [ 0, 1, 5 / 16],
  [ 1, 1, 1 / 16],
];

export const ATKINSON_KERNEL = [
  [ 1, 0, 1 / 8],
  [ 2, 0, 1 / 8],
  [-1, 1, 1 / 8],
  [ 0, 1, 1 / 8],
  [ 1, 1, 1 / 8],
  [ 0, 2, 1 / 8],
];

/** Ordered Bayer dither, in-place. `amount` ∈ [0,1] scales the matrix threshold
 *  so that at 0 no black pixels flip and at 1 every black pixel flips. */
export function applyBayerDither(data, width, height, matrix, size, amount) {
  if (amount <= 0) return;
  const denom = size * size;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] >= 128) continue; // only act on currently-black pixels
      const t = (matrix[(y % size) * size + (x % size)] + 0.5) / denom;
      if (t < amount) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
      }
    }
  }
}

/** Error-diffusion dither (Floyd-Steinberg / Atkinson), in-place.
 *
 *  The canvas is rendered as near-binary text, so a "true" error diffusion would
 *  do nothing on solid black. To make `amount` meaningful we lift solid-black
 *  pixels toward mid-gray by `amount`: at 0 they stay 0 (no dither), at 1 they
 *  become 128 (~50% halftone). White pixels are left at 255. */
export function applyErrorDiffusion(data, width, height, kernel, amount) {
  if (amount <= 0) return;
  const liftedBlack = amount * 128;
  const buf = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    buf[i] = data[i * 4] < 128 ? liftedBlack : 255;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const old = buf[idx];
      const newVal = old < 128 ? 0 : 255;
      buf[idx] = newVal;
      const err = old - newVal;
      for (const [dx, dy, w] of kernel) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        buf[ny * width + nx] += err * w;
      }
    }
  }
  for (let i = 0; i < width * height; i++) {
    const v = buf[i] < 128 ? 0 : 255;
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
  }
}

/** Dispatch to the chosen algorithm. `amount` is 0..100. */
export function applyDither(data, width, height, algo, amount) {
  if (algo === 'none' || amount <= 0) return;
  const a = amount / 100;
  switch (algo) {
    case 'bayer4':   return applyBayerDither(data, width, height, BAYER_4, 4, a);
    case 'bayer8':   return applyBayerDither(data, width, height, BAYER_8, 8, a);
    case 'floyd':    return applyErrorDiffusion(data, width, height, FLOYD_KERNEL, a);
    case 'atkinson': return applyErrorDiffusion(data, width, height, ATKINSON_KERNEL, a);
    default: return;
  }
}

// ── Image-import dither helpers (RGBA in → RGBA out) ──────────────────────────

/**
 * Convert RGBA imageData to grayscale float array.
 * @param {Uint8ClampedArray} imageData
 * @param {number} width
 * @param {number} height
 * @returns {Float32Array} grayscale values [0, 255]
 */
function toGrayscale(imageData, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = imageData[i * 4];
    const g = imageData[i * 4 + 1];
    const b = imageData[i * 4 + 2];
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return gray;
}

/**
 * Build an RGBA Uint8ClampedArray from a 1-bit result array.
 * @param {Uint8Array} bits - 0 for black, 255 for white, per pixel
 * @returns {Uint8ClampedArray}
 */
function bitsToRGBA(bits) {
  const out = new Uint8ClampedArray(bits.length * 4);
  for (let i = 0; i < bits.length; i++) {
    const v = bits[i];
    out[i * 4] = v;
    out[i * 4 + 1] = v;
    out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/**
 * Floyd-Steinberg dithering.
 * Error distribution: right 7/16, down-left 3/16, down 5/16, down-right 1/16
 *
 * @param {Uint8ClampedArray} imageData
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray} dithered RGBA pixels (black or white only)
 */
export function floydSteinberg(imageData, width, height) {
  const gray = toGrayscale(imageData, width, height);
  const result = new Uint8Array(width * height);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      const oldVal = gray[idx];
      const newVal = oldVal < 128 ? 0 : 255;
      result[idx] = newVal;
      const err = oldVal - newVal;

      if (col + 1 < width) gray[idx + 1] += (err * 7) / 16;
      if (row + 1 < height) {
        if (col - 1 >= 0) gray[idx + width - 1] += (err * 3) / 16;
        gray[idx + width] += (err * 5) / 16;
        if (col + 1 < width) gray[idx + width + 1] += (err * 1) / 16;
      }
    }
  }

  return bitsToRGBA(result);
}

/**
 * Atkinson dithering.
 * Distributes 6/8 of error (1/8 each) to:
 *   right, right+1, down-left, down, down-right, down+2
 *
 * @param {Uint8ClampedArray} imageData
 * @param {number} width
 * @param {number} height
 * @returns {Uint8ClampedArray} dithered RGBA pixels (black or white only)
 */
export function atkinson(imageData, width, height) {
  const gray = toGrayscale(imageData, width, height);
  const result = new Uint8Array(width * height);

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const idx = row * width + col;
      const oldVal = gray[idx];
      const newVal = oldVal < 128 ? 0 : 255;
      result[idx] = newVal;
      const err = (oldVal - newVal) / 8;

      if (col + 1 < width) gray[idx + 1] += err;
      if (col + 2 < width) gray[idx + 2] += err;
      if (row + 1 < height) {
        if (col - 1 >= 0) gray[idx + width - 1] += err;
        gray[idx + width] += err;
        if (col + 1 < width) gray[idx + width + 1] += err;
      }
      if (row + 2 < height) gray[idx + width * 2] += err;
    }
  }

  return bitsToRGBA(result);
}
