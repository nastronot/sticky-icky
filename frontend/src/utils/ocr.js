// Thin wrapper around Tesseract.js for the Address layer's OCR feature.
// All assets (worker, wasm core, English language data) are served
// same-origin from /tesseract/ — populated by scripts/setup-tesseract.mjs at
// install time. The Tesseract worker is created lazily on first call and
// cached afterward; subsequent OCR requests reuse the warm worker so only
// the very first run pays the wasm-load + traineddata-decompress cost.

let workerPromise = null;

/** Lazily import tesseract.js and create a worker pinned to local assets. */
async function getWorker(onProgress) {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const Tesseract = await import('tesseract.js');
    const worker = await Tesseract.createWorker('eng', 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/',
      langPath: '/tesseract/',
      // gzip is the default suffix for the cached language data we ship.
      gzip: true,
      logger: onProgress
        ? (m) => onProgress(m)
        : undefined,
    });
    return worker;
  })();
  // Reset the cache on failure so a retry can rebuild it.
  workerPromise.catch(() => { workerPromise = null; });
  return workerPromise;
}

/** Run OCR on an image source (File / Blob / data URL / HTMLImageElement /
 *  HTMLCanvasElement / ImageData / etc. — anything Tesseract.js accepts).
 *  Returns the array of non-empty trimmed lines extracted from the image,
 *  capped at maxLines. The progress callback receives raw Tesseract logger
 *  messages — UI code can translate them into a status string. */
export async function recognizeAddress(source, { maxLines = 7, onProgress } = {}) {
  const worker = await getWorker(onProgress);
  const { data } = await worker.recognize(source);
  const lines = (data.text ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, maxLines);
  return lines;
}
