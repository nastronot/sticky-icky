import { applyFont, drawLine } from './textFitting.js';
import { applyDither } from './dither.js';
import { createCanvasPattern } from './patterns.js';

export const ADDRESS_MAX_LINES = 7;
export const ADDRESS_MIN_SIZE_SCALE = 0.25;

// Shared off-DOM canvas for measuring outside a render pass (used by the
// controls panel to display the current auto-fit size next to the slider).
const MEASURE_CANVAS = typeof document !== 'undefined' ? document.createElement('canvas') : null;

/** Split user text into at most ADDRESS_MAX_LINES lines, preserving blanks. */
export function splitAddressLines(text) {
  if (!text) return [''];
  return text.split('\n').slice(0, ADDRESS_MAX_LINES);
}

/** Binary-search the largest font size where every line fits within maxW and
 *  the whole block fits within maxH. Returns null if bounds are degenerate. */
function fitAddress(ctx, lines, font, bold, italic, maxW, maxH) {
  if (maxW <= 0 || maxH <= 0) return null;
  let lo = 4;
  let hi = 2000;
  let best = null;
  while (lo <= hi) {
    const size = Math.floor((lo + hi) / 2);
    applyFont(ctx, size, font, bold, italic);
    ctx.textBaseline = 'alphabetic';
    let maxAscent = 0;
    let maxDescent = 0;
    let widest = 0;
    for (const line of lines) {
      const m = ctx.measureText(line || 'M');
      maxAscent = Math.max(maxAscent, m.actualBoundingBoxAscent);
      maxDescent = Math.max(maxDescent, m.actualBoundingBoxDescent);
      const w = ctx.measureText(line).width;
      if (w > widest) widest = w;
    }
    const lineH = maxAscent + maxDescent;
    const gap = size * 0.15;
    const totalH = lineH * lines.length + gap * Math.max(0, lines.length - 1);
    if (widest <= maxW && totalH <= maxH) {
      best = { size, lineH, gap, maxAscent, totalH, widest };
      lo = size + 1;
    } else {
      hi = size - 1;
    }
  }
  return best;
}

/** Synchronous measurement for the controls sidebar — returns the auto-fit
 *  font size for the current bounds + text, or null if unavailable. */
export function measureAddressFit(layer) {
  if (!MEASURE_CANVAS) return null;
  const ctx = MEASURE_CANVAS.getContext('2d');
  const lines = splitAddressLines(layer.text);
  return fitAddress(ctx, lines, layer.font, !!layer.bold, !!layer.italic, layer.width, layer.height);
}

/** Render an Address layer into the given (sized) offscreen canvas. Auto-fits
 *  the largest font size that fits the layer bounds, then scales by
 *  layer.sizeScale. Each line is left-aligned within a block whose width is
 *  the widest line; the block is centered horizontally and vertically within
 *  the layer bounds. */
export async function renderAddressLayer(canvas, layer) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const { text, font, bold, italic, sizeScale, fillPattern, invert, ditherAlgo, ditherAmount } = layer;
  const { x, y, width: W, height: H, rotation } = layer;
  if (W <= 0 || H <= 0) return;

  await document.fonts.load(`${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}40px "${font}"`);

  const lines = splitAddressLines(text);
  const hasText = lines.some(l => l.length > 0);

  const cx = x + W / 2;
  const cy = y + H / 2;
  const patId = fillPattern ?? 'default-solid';
  const usePattern = patId !== 'solid' && patId !== 'default-solid';

  // Empty text: only relevant if invert is on (fill bounds with black/pattern).
  if (!hasText) {
    if (invert) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.fillStyle = usePattern ? createCanvasPattern(ctx, patId) : 'black';
      ctx.fillRect(-W / 2, -H / 2, W, H);
      ctx.restore();
    }
    if (ditherAlgo !== 'none' && ditherAmount > 0) {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      applyDither(imageData.data, canvas.width, canvas.height, ditherAlgo, ditherAmount);
      ctx.putImageData(imageData, 0, 0);
    }
    return;
  }

  const fit = fitAddress(ctx, lines, font, !!bold, !!italic, W, H);
  if (!fit) return;

  const scale = Math.max(ADDRESS_MIN_SIZE_SCALE, Math.min(1, sizeScale ?? 1));
  const size = Math.max(4, Math.round(fit.size * scale));

  // Re-measure at the final (post-slider) size so the widest-line metric is
  // accurate for block centering.
  applyFont(ctx, size, font, !!bold, !!italic);
  ctx.textBaseline = 'alphabetic';
  let maxAscent = 0;
  let maxDescent = 0;
  const lineWidths = [];
  for (const line of lines) {
    const m = ctx.measureText(line || 'M');
    maxAscent = Math.max(maxAscent, m.actualBoundingBoxAscent);
    maxDescent = Math.max(maxDescent, m.actualBoundingBoxDescent);
    lineWidths.push(ctx.measureText(line).width);
  }
  const lineH = maxAscent + maxDescent;
  const gap = size * 0.15;
  const totalH = lineH * lines.length + gap * Math.max(0, lines.length - 1);
  const blockW = Math.max(0, ...lineWidths);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);

  const drawText = () => {
    applyFont(ctx, size, font, !!bold, !!italic);
    ctx.textBaseline = 'alphabetic';
    const blockStartX = -blockW / 2;
    const startY = -totalH / 2;
    for (let i = 0; i < lines.length; i++) {
      const yy = startY + i * (lineH + gap) + maxAscent;
      drawLine(ctx, lines[i], blockStartX, yy, 0, null);
    }
  };

  if (invert) {
    if (usePattern) {
      ctx.fillStyle = createCanvasPattern(ctx, patId);
      ctx.fillRect(-W / 2, -H / 2, W, H);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'black';
      drawText();
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = 'black';
      ctx.fillRect(-W / 2, -H / 2, W, H);
      ctx.fillStyle = 'white';
      drawText();
    }
  } else {
    if (usePattern) {
      ctx.fillStyle = 'black';
      drawText();
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = createCanvasPattern(ctx, patId);
      ctx.fillRect(-W / 2, -H / 2, W, H);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = 'black';
      drawText();
    }
  }

  ctx.restore();

  if (ditherAlgo !== 'none' && ditherAmount > 0) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyDither(imageData.data, canvas.width, canvas.height, ditherAlgo, ditherAmount);
    ctx.putImageData(imageData, 0, 0);
  }
}
