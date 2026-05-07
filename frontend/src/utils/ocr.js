// Thin wrapper around Tesseract.js for the Address layer's OCR feature.
// All assets (worker, wasm core, traineddata for every supported language)
// are served same-origin from /tesseract/ — populated by
// scripts/setup-tesseract.mjs at install time. The Tesseract worker is
// created lazily on first call and cached afterward; subsequent OCR
// requests reuse the warm worker so only the very first run pays the
// wasm-load + traineddata-decompress cost.

// Languages bundled and loaded into every worker. Postcrossing covers the
// world, so we load English + Chinese (Simplified + Traditional) +
// Japanese + Russian concurrently — Tesseract recognizes the union of
// scripts in a single pass. Keep this in sync with LANGS in
// scripts/setup-tesseract.mjs.
const LANGS = ['eng', 'chi_sim', 'chi_tra', 'jpn', 'rus'];

let workerPromise = null;

/** Lazily import tesseract.js and create a worker pinned to local assets. */
async function getWorker(onProgress) {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const Tesseract = await import('tesseract.js');
    const worker = await Tesseract.createWorker(LANGS, 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract/',
      langPath: '/tesseract/',
      // The traineddata files we ship are gzipped — Tesseract knows to
      // decompress them on load.
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
