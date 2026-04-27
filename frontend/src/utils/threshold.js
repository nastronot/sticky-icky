// Binary threshold (auto or manual). When this op runs, the existing dither
// step is skipped entirely — the result is pure 1-bit black/white.
//
// Gamma flag: when true, route the per-channel sRGB bytes through the
// linear LUT before computing luma so the histogram and cutoff comparison
// happen in linear-light space. The 0..255 byte range and the
// `cutoff` parameter scale are preserved (the cutoff itself is also
// linearised before the comparison so the user-facing slider keeps the
// same perceptual meaning).

import { SRGB_TO_LINEAR_LUT } from './gamma.js';

function toGrayscale(src, gamma = false) {
  const { width: w, height: h } = src;
  const buf = src.data;
  const gray = new Uint8Array(w * h);
  if (gamma) {
    const L = SRGB_TO_LINEAR_LUT;
    for (let i = 0; i < w * h; i++) {
      gray[i] = Math.round(
        0.299 * L[buf[i * 4]] +
        0.587 * L[buf[i * 4 + 1]] +
        0.114 * L[buf[i * 4 + 2]],
      );
    }
  } else {
    for (let i = 0; i < w * h; i++) {
      // Rec. 601 luma, rounded to integer so it feeds directly into Otsu's
      // 256-bin histogram.
      gray[i] = Math.round(0.299 * buf[i * 4] + 0.587 * buf[i * 4 + 1] + 0.114 * buf[i * 4 + 2]);
    }
  }
  return gray;
}

/**
 * Otsu's method — pick the threshold that maximises between-class variance
 * of the grayscale histogram. Returns an integer in [0, 255].
 */
export function otsuThreshold(src, gamma = false) {
  const gray = toGrayscale(src, gamma);
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;

  const total = gray.length;
  let sumTotal = 0;
  for (let i = 0; i < 256; i++) sumTotal += i * hist[i];

  let sumBg = 0;
  let weightBg = 0;
  let maxVar = -1;
  let best = 128;
  for (let t = 0; t < 256; t++) {
    weightBg += hist[t];
    if (weightBg === 0) continue;
    const weightFg = total - weightBg;
    if (weightFg === 0) break;
    sumBg += t * hist[t];
    const meanBg = sumBg / weightBg;
    const meanFg = (sumTotal - sumBg) / weightFg;
    const between = weightBg * weightFg * (meanBg - meanFg) * (meanBg - meanFg);
    if (between > maxVar) {
      maxVar = between;
      best = t;
    }
  }
  return best;
}

/**
 * Apply a binary threshold to the given ImageData. Output is grayscale RGBA
 * (R==G==B set to 0 or 255), alpha preserved.
 *
 * @param {ImageData} src
 * @param {number} cutoff — grayscale value in [0, 255]; pixels < cutoff go black
 * @param {boolean} gamma — linearise grayscale + cutoff before comparing
 */
export function applyThreshold(src, cutoff, gamma = false) {
  const { width: w, height: h } = src;
  const gray = toGrayscale(src, gamma);
  // The cutoff is a user-facing sRGB byte even when gamma is on, so map it
  // through the same LUT as the gray buffer to keep the comparison in one
  // colour space. Note: pure threshold without dither is a monotonic
  // operation, so for manual cutoffs the gamma mapping cancels out on both
  // sides — Otsu's auto threshold is the only path where gamma actually
  // changes the chosen cut.
  const linCutoff = gamma ? SRGB_TO_LINEAR_LUT[Math.max(0, Math.min(255, cutoff | 0))] : cutoff;
  const outArr = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = gray[i] < linCutoff ? 0 : 255;
    outArr[i * 4]     = v;
    outArr[i * 4 + 1] = v;
    outArr[i * 4 + 2] = v;
    outArr[i * 4 + 3] = src.data[i * 4 + 3];
  }
  return new ImageData(outArr, w, h);
}
