// Sobel edge detection.
//
// Takes an ImageData, convolves it with the Sobel kernels, and emits a
// grayscale ImageData where edge-heavy pixels are dark on a white
// background (dark = ink, matches the rest of the thermal print pipeline).
//
// `strength` (0–100) controls suppression: 0 shows every edge response,
// 100 shows only the strongest edges. Implementation: subtract a
// strength-scaled floor from the normalized magnitude before inverting.

const SOBEL_X = [
  -1, 0, 1,
  -2, 0, 2,
  -1, 0, 1,
];
const SOBEL_Y = [
  -1, -2, -1,
   0,  0,  0,
   1,  2,  1,
];

function toGrayscale(src) {
  const { width: w, height: h } = src;
  const buf = src.data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    gray[i] = 0.299 * buf[i * 4] + 0.587 * buf[i * 4 + 1] + 0.114 * buf[i * 4 + 2];
  }
  return gray;
}

/**
 * Run Sobel edge detection on the given ImageData.
 *
 * @param {ImageData} src
 * @param {number} strength — 0..100, higher = stricter (only strong edges survive)
 * @returns {ImageData} — grayscale RGBA, alpha copied from the source
 */
export function sobelEdges(src, strength = 50) {
  const { width: w, height: h } = src;
  const gray = toGrayscale(src);
  const outArr = new Uint8ClampedArray(w * h * 4);

  // Sobel magnitude can run up to ~1442 (= sqrt(1020² + 1020²)); in practice
  // most pixels are far below that. Dividing by 4 gives a reasonable 0..255
  // band for normal inputs; the clamp at the end catches spikes.
  const SCALE = 1 / 4;
  // Strength is a 0..100 knob; map linearly to a 0..255 magnitude floor.
  const floor = Math.max(0, Math.min(255, strength * 2.55));

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      // Edge pixels: no neighbourhood to convolve, emit white.
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        outArr[i * 4]     = 255;
        outArr[i * 4 + 1] = 255;
        outArr[i * 4 + 2] = 255;
        outArr[i * 4 + 3] = src.data[i * 4 + 3];
        continue;
      }

      let gx = 0;
      let gy = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const v = gray[(y + ky) * w + (x + kx)];
          gx += v * SOBEL_X[k];
          gy += v * SOBEL_Y[k];
          k++;
        }
      }
      const mag = Math.sqrt(gx * gx + gy * gy) * SCALE;
      const normalized = Math.min(255, mag);
      // Subtract the strength floor so weak responses vanish, then invert
      // (edges dark on white).
      const above = Math.max(0, normalized - floor);
      // Optional gentle gain so what remains pops — without this, even
      // strong edges look washed out after the floor subtract.
      const boosted = Math.min(255, above * 2);
      const out = 255 - boosted;

      outArr[i * 4]     = out;
      outArr[i * 4 + 1] = out;
      outArr[i * 4 + 2] = out;
      outArr[i * 4 + 3] = src.data[i * 4 + 3];
    }
  }
  return new ImageData(outArr, w, h);
}
