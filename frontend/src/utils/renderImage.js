import { ditherImage } from './dither.js';
import { epxUpscale } from './upscale.js';
import { sobelEdges } from './edgeDetect.js';
import { otsuThreshold, applyThreshold } from './threshold.js';

/**
 * Cache for the processed ImageData of image layers, keyed by layer id. The
 * cache entry stores the full processing signature so we can cheaply detect
 * when only a transform (x/y/rotation/etc) changed and skip the expensive
 * pipeline rerun.
 *
 * `source` is a small offscreen canvas containing the processed pixels —
 * kept around so the layer's display canvas can drawImage it directly with
 * whatever transform the user picks.
 */
export function makeDitherCache() {
  return new Map();
}

// Processing order per spec: upscale → edge detect → threshold OR dither.
// Each step is a pure ImageData → ImageData transform. When the Threshold
// op is active the existing dither step is skipped (threshold already
// produces a clean 1-bit result).
function processImage(layer) {
  let current = layer.originalImage;

  // 1. EPX upscale (2× or 4×).
  const upscaleFactor = (layer.upscaleEnabled && (layer.upscaleFactor === 2 || layer.upscaleFactor === 4))
    ? layer.upscaleFactor
    : 1;
  if (upscaleFactor > 1) {
    current = epxUpscale(current, upscaleFactor);
  }

  // 2. Sobel edge detection.
  if (layer.edgeEnabled) {
    const strength = layer.edgeStrength ?? 50;
    current = sobelEdges(current, strength);
  }

  // 3. Threshold OR dither (mutually exclusive).
  const mode = layer.thresholdMode ?? 'off';
  if (mode === 'auto') {
    const t = otsuThreshold(current);
    current = applyThreshold(current, t);
  } else if (mode === 'manual') {
    const t = layer.thresholdValue ?? 128;
    current = applyThreshold(current, t);
  } else {
    // Existing dither path — uses the legacy `threshold` field as the
    // brightness cutoff.
    current = ditherImage(current, layer.ditherAlgo, layer.ditherAmount, layer.threshold);
  }

  return current;
}

function signatureOf(layer) {
  return {
    originalImage: layer.originalImage,
    upscaleEnabled: !!layer.upscaleEnabled,
    upscaleFactor: layer.upscaleFactor ?? 2,
    edgeEnabled: !!layer.edgeEnabled,
    edgeStrength: layer.edgeStrength ?? 50,
    thresholdMode: layer.thresholdMode ?? 'off',
    thresholdValue: layer.thresholdValue ?? 128,
    algo: layer.ditherAlgo,
    amount: layer.ditherAmount,
    threshold: layer.threshold,
  };
}

function sigEquals(a, b) {
  if (!a || !b) return false;
  return (
    a.originalImage === b.originalImage &&
    a.upscaleEnabled === b.upscaleEnabled &&
    a.upscaleFactor === b.upscaleFactor &&
    a.edgeEnabled === b.edgeEnabled &&
    a.edgeStrength === b.edgeStrength &&
    a.thresholdMode === b.thresholdMode &&
    a.thresholdValue === b.thresholdValue &&
    a.algo === b.algo &&
    a.amount === b.amount &&
    a.threshold === b.threshold
  );
}

function getProcessed(cache, layer) {
  const cached = cache.get(layer.id);
  const sig = signatureOf(layer);
  if (cached && sigEquals(cached.sig, sig)) return cached;

  const imageData = processImage(layer);
  const source = document.createElement('canvas');
  source.width = imageData.width;
  source.height = imageData.height;
  source.getContext('2d').putImageData(imageData, 0, 0);

  const entry = { sig, imageData, source };
  cache.set(layer.id, entry);
  return entry;
}

/**
 * Render an image layer to its (already-sized) offscreen canvas. The canvas
 * is cleared, then the processed source is drawn with the layer's transform
 * (translate to center, rotate, flip, scale to width/height).
 *
 * `cache` is from `makeDitherCache()`.
 */
export function renderImageLayer(canvas, layer, cache) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!layer.originalImage) return;

  const { source } = getProcessed(cache, layer);

  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
  // imageSmoothingEnabled false keeps processed pixels crisp under scaling —
  // critical for EPX + threshold output where every sub-pixel matters.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.restore();

  // Invert: swap black and white on the opaque pixels of the offscreen.
  // Transparent pixels stay transparent so the layer's footprint doesn't
  // grow into the unused canvas area.
  if (layer.invert) {
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 128) continue;
      const v = d[i] < 128 ? 255 : 0;
      d[i]     = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
    ctx.putImageData(id, 0, 0);
  }
}

/** Drop any cache entries whose layer ids are no longer in `liveIds`. */
export function pruneDitherCache(cache, liveIds) {
  const live = new Set(liveIds);
  for (const id of cache.keys()) {
    if (!live.has(id)) cache.delete(id);
  }
}
