import { applyDither } from './dither.js';

// Off-DOM canvas reused for synchronous text measurement (used by App when
// constructing a layer and by anything else that needs dimensions before the
// next render).
const MEASURE_CANVAS = typeof document !== 'undefined' ? document.createElement('canvas') : null;

function fontSpec(layer, sizeOverride) {
  const size = sizeOverride ?? layer.fontSize;
  return `${layer.italic ? 'italic ' : ''}${layer.bold ? 'bold ' : ''}${size}px "${layer.font}"`;
}

function applyLayerFont(ctx, layer) {
  ctx.font = fontSpec(layer);
}

/**
 * Measure a free text layer's bounding box and per-line metrics. Returns
 * integer width/height (so layer state stays integer-aligned), the line
 * ascent/descent, line height, vertical gap, and the split lines.
 *
 * Measurement happens via the shared off-DOM canvas — fonts may not yet be
 * loaded the first time this is called for a new font, in which case the
 * dimensions will refine on the next render once `document.fonts.load`
 * resolves and CanvasPreview re-measures.
 */
export function measureTextLayer(layer) {
  if (!MEASURE_CANVAS) return { width: 1, height: 1, ascent: 0, descent: 0, lineH: 0, gap: 0, lines: [''] };
  const ctx = MEASURE_CANVAS.getContext('2d');
  applyLayerFont(ctx, layer);
  ctx.textBaseline = 'alphabetic';

  const lines = (layer.text ?? '').length ? layer.text.split('\n') : [''];
  let maxAscent = 0;
  let maxDescent = 0;
  let maxWidth = 0;
  for (const line of lines) {
    const m = ctx.measureText(line || 'M');
    maxAscent = Math.max(maxAscent, m.actualBoundingBoxAscent);
    maxDescent = Math.max(maxDescent, m.actualBoundingBoxDescent);
    maxWidth = Math.max(maxWidth, m.width);
  }
  const lineH = maxAscent + maxDescent;
  const gap = layer.fontSize * 0.15;
  const totalH = lines.length * lineH + Math.max(0, lines.length - 1) * gap;
  return {
    width: Math.max(1, Math.ceil(maxWidth)),
    height: Math.max(1, Math.ceil(totalH)),
    ascent: maxAscent,
    descent: maxDescent,
    lineH,
    gap,
    lines,
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

  applyLayerFont(ctx, layer);
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
  for (let i = 0; i < m.lines.length; i++) {
    const line = m.lines[i];
    const lineWidth = ctx.measureText(line).width;
    const x = -lineWidth / 2;
    const y = startY + i * (m.lineH + m.gap) + m.ascent;
    ctx.fillText(line, x, y);
  }

  ctx.restore();

  if (layer.ditherAlgo !== 'none' && layer.ditherAmount > 0) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyDither(imageData.data, canvas.width, canvas.height, layer.ditherAlgo, layer.ditherAmount);
    ctx.putImageData(imageData, 0, 0);
  }

  return { width: m.width, height: m.height };
}
