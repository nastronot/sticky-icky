import { PAD, applyFont, drawLine, measureLine, fitLines } from './textFitting.js';
import { applyDither } from './dither.js';
import { createCanvasPattern } from './patterns.js';

/** Evenly distribute words across numLines. */
function splitWords(words, numLines) {
  const result = [];
  const perLine = Math.ceil(words.length / numLines);
  for (let i = 0; i < words.length; i += perLine) {
    result.push(words.slice(i, i + perLine).join(' '));
  }
  return result;
}

/** Find the best font size + layout for the given text. */
function fitText(ctx, displayText, originalText, canvasW, canvasH, font, bold, italic, letterSpacing, smallCaps) {
  const maxW = canvasW - PAD * 2;
  const maxH = canvasH - PAD * 2;
  const words = displayText.trim().split(/\s+/);
  const origWords = originalText.trim().split(/\s+/);
  if (!words[0]) return null;

  let best = fitLines(ctx, [displayText.trim()], font, bold, italic, letterSpacing, maxW, maxH, smallCaps, [originalText.trim()]);

  if (words.length > 1) {
    for (let n = 2; n <= words.length; n++) {
      const lines = splitWords(words, n);
      const oLines = splitWords(origWords, n);
      const result = fitLines(ctx, lines, font, bold, italic, letterSpacing, maxW, maxH, smallCaps, oLines);
      if (result && (!best || result.coverage > best.coverage)) {
        best = result;
      }
    }
  }

  return best;
}

/** Draw text glyphs on ctx (no fill setup — caller sets fillStyle). */
function drawFittedGlyphs(ctx, fit, W, H, hAlign, letterSpacing, smallCaps) {
  const maxW = W - PAD * 2;
  const smallSize = Math.round(fit.size * 0.7);

  let startY;
  const vAlign = fit.vAlign ?? 'middle';
  if (vAlign === 'top') startY = PAD;
  else if (vAlign === 'bottom') startY = H - PAD - fit.totalH;
  else startY = (H - fit.totalH) / 2;

  for (let i = 0; i < fit.lines.length; i++) {
    const line = fit.lines[i];
    const origLine = fit.origLines[i];
    const scInfo = smallCaps ? { origLine, fullSize: fit.size, smallSize, font: fit.font ?? '', bold: fit.bold ?? false, italic: fit.italic ?? false } : null;
    const lineW = measureLine(ctx, line, letterSpacing, scInfo);
    let startX;
    let lineLetterSpacing = letterSpacing;

    if (hAlign === 'justify' && [...line].length > 1) {
      const naturalW = measureLine(ctx, line, 0, scInfo);
      lineLetterSpacing = (maxW - naturalW) / ([...line].length - 1);
      startX = PAD;
    } else if (hAlign === 'justify' || hAlign === 'left') {
      startX = PAD;
    } else if (hAlign === 'right') {
      startX = W - PAD - lineW;
    } else {
      startX = (W - lineW) / 2;
    }

    const y = startY + i * (fit.lineH + fit.gap) + fit.maxAscent;
    drawLine(ctx, line, startX, y, lineLetterSpacing, scInfo);
  }
}

/** Paint background + fitted text on canvas, with optional pattern fill. */
function drawText(canvas, displayText, originalText, font, bold, italic, smallCaps, hAlign, vAlign, letterSpacing, invert, fillPattern) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!displayText.trim()) {
    if (invert) {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, W, H);
    }
    return;
  }

  const fit = fitText(ctx, displayText, originalText, W, H, font, bold, italic, letterSpacing, smallCaps);
  if (!fit) return;

  // Stash font/style info on fit so drawFittedGlyphs can use it for small caps
  fit.font = font;
  fit.bold = bold;
  fit.italic = italic;
  fit.vAlign = vAlign;

  applyFont(ctx, fit.size, font, bold, italic);
  ctx.textBaseline = 'alphabetic';

  const patId = fillPattern ?? 'default-solid';
  const usePattern = patId !== 'solid' && patId !== 'default-solid';

  if (invert) {
    if (usePattern) {
      // Fill canvas with pattern, then cut out glyph shapes.
      ctx.fillStyle = createCanvasPattern(ctx, patId);
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'black';
      applyFont(ctx, fit.size, font, bold, italic);
      drawFittedGlyphs(ctx, fit, W, H, hAlign, letterSpacing, smallCaps);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = 'black';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'white';
      drawFittedGlyphs(ctx, fit, W, H, hAlign, letterSpacing, smallCaps);
    }
  } else {
    if (usePattern) {
      // Draw glyph shapes as solid mask, then fill with pattern.
      ctx.fillStyle = 'black';
      drawFittedGlyphs(ctx, fit, W, H, hAlign, letterSpacing, smallCaps);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = createCanvasPattern(ctx, patId);
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    } else {
      ctx.fillStyle = 'black';
      drawFittedGlyphs(ctx, fit, W, H, hAlign, letterSpacing, smallCaps);
    }
  }
}

/**
 * Render a Big Text layer onto a (sized) offscreen canvas: text + per-layer
 * dithering pass. Returns a Promise that resolves once the font has loaded.
 */
export async function renderBigTextLayer(canvas, layer) {
  const { text, font, bold, italic, smallCaps, allCaps, hAlign, vAlign, letterSpacing, invert, fillPattern, ditherAlgo, ditherAmount } = layer;
  const displayText = (allCaps || smallCaps) ? text.toUpperCase() : text;

  await document.fonts.load(`${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}40px "${font}"`);

  drawText(canvas, displayText, text, font, bold, italic, smallCaps, hAlign, vAlign, letterSpacing, invert, fillPattern);

  if (ditherAlgo !== 'none' && ditherAmount > 0) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyDither(imageData.data, canvas.width, canvas.height, ditherAlgo, ditherAmount);
    ctx.putImageData(imageData, 0, 0);
  }
}
