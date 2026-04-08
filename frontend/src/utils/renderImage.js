import { ditherImage } from './dither.js';

/**
 * Cache for the dithered ImageData of image layers, keyed by layer id. Stored
 * as `{ algo, amount, threshold, originalImage, imageData, source }` so we can
 * cheaply detect when only the transform (x/y/rotation/etc) changed and skip
 * re-dithering. `source` is a small offscreen canvas containing the dithered
 * pixels — kept around so the layer's display canvas can drawImage it directly
 * with whatever transform the user picks.
 */
export function makeDitherCache() {
  return new Map();
}

function getDithered(cache, layer) {
  const cached = cache.get(layer.id);
  if (
    cached &&
    cached.originalImage === layer.originalImage &&
    cached.algo === layer.ditherAlgo &&
    cached.amount === layer.ditherAmount &&
    cached.threshold === layer.threshold
  ) {
    return cached;
  }

  const imageData = ditherImage(
    layer.originalImage,
    layer.ditherAlgo,
    layer.ditherAmount,
    layer.threshold,
  );
  const source = document.createElement('canvas');
  source.width = imageData.width;
  source.height = imageData.height;
  source.getContext('2d').putImageData(imageData, 0, 0);

  const entry = {
    originalImage: layer.originalImage,
    algo: layer.ditherAlgo,
    amount: layer.ditherAmount,
    threshold: layer.threshold,
    imageData,
    source,
  };
  cache.set(layer.id, entry);
  return entry;
}

/**
 * Render an image layer to its (already-sized) offscreen canvas. The canvas
 * is cleared, then the dithered source is drawn with the layer's transform
 * (translate to center, rotate, flip, scale to width/height).
 *
 * `cache` is the dither cache from `makeDitherCache()`.
 */
export function renderImageLayer(canvas, layer, cache) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!layer.originalImage) return;

  const { source } = getDithered(cache, layer);

  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);
  // imageSmoothingEnabled false keeps dithered pixels crisp under scaling
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.restore();
}

/** Drop any cache entries whose layer ids are no longer in `liveIds`. */
export function pruneDitherCache(cache, liveIds) {
  const live = new Set(liveIds);
  for (const id of cache.keys()) {
    if (!live.has(id)) cache.delete(id);
  }
}
