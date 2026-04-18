import { applyFont, drawLine, measureLine } from './textFitting.js';
import { applyDither } from './dither.js';
import { createCanvasPattern } from './patterns.js';

// Off-DOM canvas reused for synchronous text measurement (used by App when
// constructing a layer and by anything else that needs dimensions before the
// next render).
const MEASURE_CANVAS = typeof document !== 'undefined' ? document.createElement('canvas') : null;

function fontSpec(layer, sizeOverride) {
  const size = sizeOverride ?? layer.fontSize;
  return `${layer.italic ? 'italic ' : ''}${layer.bold ? 'bold ' : ''}${size}px "${layer.font}"`;
}

function buildLines(layer) {
  const useUpper = layer.allCaps || layer.smallCaps;
  const origLines = (layer.text ?? '').length ? layer.text.split('\n') : [''];
  const displayLines = useUpper ? origLines.map(l => l.toUpperCase()) : origLines;
  return { origLines, displayLines };
}

function buildScInfo(layer, smallSize) {
  if (!layer.smallCaps) return null;
  return {
    fullSize: layer.fontSize,
    smallSize,
    font: layer.font,
    bold: layer.bold,
    italic: layer.italic,
  };
}

/**
 * Measure a free text layer's bounding box and per-line metrics. Returns
 * integer width/height (so layer state stays integer-aligned), the line
 * ascent/descent, line height, vertical gap, the split display/origin lines,
 * the small-caps reduced size, and the layer's letter spacing — everything
 * the renderer needs without re-deriving it.
 */
export function measureTextLayer(layer) {
  const fallback = {
    width: 1, height: 1, ascent: 0, descent: 0, lineH: 0, gap: 0,
    lines: [''], origLines: [''], smallSize: 0, letterSpacing: 0,
  };
  if (!MEASURE_CANVAS) return fallback;
  const ctx = MEASURE_CANVAS.getContext('2d');
  applyFont(ctx, layer.fontSize, layer.font, layer.bold, layer.italic);
  ctx.textBaseline = 'alphabetic';

  const { origLines, displayLines } = buildLines(layer);
  const smallSize = Math.max(1, Math.round(layer.fontSize * 0.7));
  const letterSpacing = layer.letterSpacing ?? 0;

  let maxAscent = 0;
  let maxDescent = 0;
  let maxWidth = 0;
  for (let i = 0; i < displayLines.length; i++) {
    const line = displayLines[i];
    const m = ctx.measureText(line || 'M');
    maxAscent = Math.max(maxAscent, m.actualBoundingBoxAscent);
    maxDescent = Math.max(maxDescent, m.actualBoundingBoxDescent);
    const sc = layer.smallCaps
      ? { ...buildScInfo(layer, smallSize), origLine: origLines[i] }
      : null;
    const w = measureLine(ctx, line, letterSpacing, sc);
    if (w > maxWidth) maxWidth = w;
  }
  const lineH = maxAscent + maxDescent;
  const gap = layer.fontSize * 0.15;
  const totalH = displayLines.length * lineH + Math.max(0, displayLines.length - 1) * gap;
  return {
    width: Math.max(1, Math.ceil(maxWidth)),
    height: Math.max(1, Math.ceil(totalH)),
    ascent: maxAscent,
    descent: maxDescent,
    lineH,
    gap,
    lines: displayLines,
    origLines,
    smallSize,
    letterSpacing,
  };
}

/** Draw the text glyphs onto ctx in its current transform. */
function drawGlyphs(ctx, m, layer) {
  const startY = -m.height / 2;
  const hAlign = layer.hAlign ?? 'left';
  const scBase = buildScInfo(layer, m.smallSize);

  for (let i = 0; i < m.lines.length; i++) {
    const line = m.lines[i];
    const sc = scBase ? { ...scBase, origLine: m.origLines[i] } : null;
    const lineWidth = measureLine(ctx, line, m.letterSpacing, sc);

    let startX;
    if (hAlign === 'right')       startX =  m.width / 2 - lineWidth;
    else if (hAlign === 'center') startX = -lineWidth / 2;
    else                          startX = -m.width / 2;

    const y = startY + i * (m.lineH + m.gap) + m.ascent;
    drawLine(ctx, line, startX, y, m.letterSpacing, sc);
  }
}

/**
 * Render a free text layer onto its (already-sized) offscreen canvas. When
 * fillPattern is set (and not 'solid'), the pattern tiles across the layer's
 * bounding box and is masked by the glyph shapes. Returns the measured
 * dimensions so the caller can correct stale layer.width/height.
 */
export async function renderTextLayer(canvas, layer) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  await document.fonts.load(fontSpec(layer));

  const m = measureTextLayer(layer);
  if (!layer.text) return { width: m.width, height: m.height };

  applyFont(ctx, layer.fontSize, layer.font, layer.bold, layer.italic);
  ctx.textBaseline = 'alphabetic';

  const cx = layer.x + m.width / 2;
  const cy = layer.y + m.height / 2;
  const patId = layer.fillPattern ?? 'default-solid';
  const usePattern = patId !== 'solid' && patId !== 'default-solid';

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);

  if (layer.invert) {
    // Invert mode: paint the bounding box, then draw text as cutout.
    if (usePattern) {
      // Fill bounding box with pattern, then cut out glyph shapes.
      ctx.fillStyle = createCanvasPattern(ctx, patId);
      ctx.fillRect(-m.width / 2, -m.height / 2, m.width, m.height);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'black';
      drawGlyphs(ctx, m, layer);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = 'black';
      ctx.fillRect(-m.width / 2, -m.height / 2, m.width, m.height);
      ctx.fillStyle = 'white';
      drawGlyphs(ctx, m, layer);
    }
  } else {
    if (usePattern) {
      // Draw glyph shapes as solid black mask, then fill with pattern.
      ctx.fillStyle = 'black';
      drawGlyphs(ctx, m, layer);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = createCanvasPattern(ctx, patId);
      ctx.fillRect(-m.width / 2, -m.height / 2, m.width, m.height);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = 'black';
      drawGlyphs(ctx, m, layer);
    }
  }

  ctx.restore();

  if (layer.ditherAlgo !== 'none' && layer.ditherAmount > 0) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyDither(imageData.data, canvas.width, canvas.height, layer.ditherAlgo, layer.ditherAmount);
    ctx.putImageData(imageData, 0, 0);
  }

  return { width: m.width, height: m.height };
}
