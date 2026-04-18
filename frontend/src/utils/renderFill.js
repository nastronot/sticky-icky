import { applyDither } from './dither.js';
import { createCanvasPattern } from './patterns.js';

/**
 * Render a fill layer onto its (already-sized) offscreen canvas. When the
 * layer's fillPattern is 'solid' the fill is a plain black rectangle; for
 * any other pattern the fill is tiled from the 1-bit pattern data at 1:1
 * pixel resolution. Invert post-processes opaque pixels (black↔white).
 * Dithering, if any, runs last.
 */
export function renderFillLayer(canvas, layer) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);

  const patId = layer.fillPattern ?? 'default-solid';
  if (patId === 'default-solid' || patId === 'solid') {
    ctx.fillStyle = 'black';
  } else {
    ctx.fillStyle = createCanvasPattern(ctx, patId);
  }
  ctx.fillRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.restore();

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

  if (layer.ditherAlgo !== 'none' && layer.ditherAmount > 0) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyDither(imageData.data, canvas.width, canvas.height, layer.ditherAlgo, layer.ditherAmount);
    ctx.putImageData(imageData, 0, 0);
  }
}
