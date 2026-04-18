// Binary threshold (auto or manual). When this op runs, the existing dither
// step is skipped entirely — the result is pure 1-bit black/white.

function toGrayscale(src) {
  const { width: w, height: h } = src;
  const buf = src.data;
  const gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    // Rec. 601 luma, rounded to integer so it feeds directly into Otsu's
    // 256-bin histogram.
    gray[i] = Math.round(0.299 * buf[i * 4] + 0.587 * buf[i * 4 + 1] + 0.114 * buf[i * 4 + 2]);
  }
  return gray;
}

/**
 * Otsu's method — pick the threshold that maximises between-class variance
 * of the grayscale histogram. Returns an integer in [0, 255].
 */
export function otsuThreshold(src) {
  const gray = toGrayscale(src);
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
 */
export function applyThreshold(src, cutoff) {
  const { width: w, height: h } = src;
  const gray = toGrayscale(src);
  const outArr = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = gray[i] < cutoff ? 0 : 255;
    outArr[i * 4]     = v;
    outArr[i * 4 + 1] = v;
    outArr[i * 4 + 2] = v;
    outArr[i * 4 + 3] = src.data[i * 4 + 3];
  }
  return new ImageData(outArr, w, h);
}
