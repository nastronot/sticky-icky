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
