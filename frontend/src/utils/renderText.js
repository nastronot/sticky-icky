import { applyFont, drawLine, measureLine } from './textFitting.js';
import { applyDither } from './dither.js';

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

/**
 * Render a free text layer onto its (already-sized) offscreen canvas. The
 * canvas is cleared, the text is drawn at `layer.x, layer.y` (top-left of
 * the bounding box) with rotation around the layer center, and the per-layer
 * dither (if any) is applied. Returns the measured dimensions so the caller
 * can correct stale `layer.width/height` if the font has loaded since the
 * last patch.
 */
export async function renderTextLayer(canvas, layer) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Wait for the font so glyph metrics are accurate.
  await document.fonts.load(fontSpec(layer));

  const m = measureTextLayer(layer);
  if (!layer.text) return { width: m.width, height: m.height };

  applyFont(ctx, layer.fontSize, layer.font, layer.bold, layer.italic);
  ctx.textBaseline = 'alphabetic';

  // Centered transform around the layer's center; we draw lines centered on
  // (0, 0) so flipH / flipV mirror about the bounding-box center.
  const cx = layer.x + m.width / 2;
  const cy = layer.y + m.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation * Math.PI) / 180);
  ctx.scale(layer.flipH ? -1 : 1, layer.flipV ? -1 : 1);

  // Invert mode: paint a black rectangle the size of the bounding box (in
  // local space, so it inherits the layer's rotation/flip) before drawing
  // text in white. The rectangle is the per-text-layer "background" — only
  // covers the layer's footprint, unlike Big Text which fills the canvas.
  if (layer.invert) {
    ctx.fillStyle = 'black';
    ctx.fillRect(-m.width / 2, -m.height / 2, m.width, m.height);
    ctx.fillStyle = 'white';
  } else {
    ctx.fillStyle = 'black';
  }

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

  ctx.restore();

  if (layer.ditherAlgo !== 'none' && layer.ditherAmount > 0) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyDither(imageData.data, canvas.width, canvas.height, layer.ditherAlgo, layer.ditherAmount);
    ctx.putImageData(imageData, 0, 0);
  }

  return { width: m.width, height: m.height };
}
