import { PAD, applyFont, drawLine, measureLine, fitLines } from './textFitting.js';
import { applyDither } from './dither.js';

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

/** Paint the (transparent or solid-black) background and the fitted text on
 *  `canvas`. When `invert` is true the canvas is filled solid black and the
 *  text is drawn in white — Big Text fills the whole label, so the entire
 *  canvas serves as the inverted layer's bounding box. */
function drawText(canvas, displayText, originalText, font, bold, italic, smallCaps, hAlign, vAlign, letterSpacing, invert) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;

  if (invert) {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, W, H);
  } else {
    ctx.clearRect(0, 0, W, H);
  }

  if (!displayText.trim()) return;

  const fit = fitText(ctx, displayText, originalText, W, H, font, bold, italic, letterSpacing, smallCaps);
  if (!fit) return;

  applyFont(ctx, fit.size, font, bold, italic);
  ctx.fillStyle = invert ? 'white' : 'black';
  ctx.textBaseline = 'alphabetic';

  const maxW = W - PAD * 2;
  const smallSize = Math.round(fit.size * 0.7);

  let startY;
  if (vAlign === 'top') startY = PAD;
  else if (vAlign === 'bottom') startY = H - PAD - fit.totalH;
  else startY = (H - fit.totalH) / 2;

  for (let i = 0; i < fit.lines.length; i++) {
    const line = fit.lines[i];
    const origLine = fit.origLines[i];
    const scInfo = smallCaps ? { origLine, fullSize: fit.size, smallSize, font, bold, italic } : null;
    const lineW = measureLine(ctx, line, letterSpacing, scInfo);
    let startX;
    let lineLetterSpacing = letterSpacing;
    let lineScInfo = scInfo;

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
    drawLine(ctx, line, startX, y, lineLetterSpacing, lineScInfo);
  }
}

/**
 * Render a Big Text layer onto a (sized) offscreen canvas: text + per-layer
 * dithering pass. The caller is responsible for ensuring the canvas dimensions
 * match the current label size before calling.
 *
 * Returns a Promise that resolves once any required font has loaded so the
 * caller can composite after rendering completes.
 */
export async function renderBigTextLayer(canvas, layer) {
  const { text, font, bold, italic, smallCaps, allCaps, hAlign, vAlign, letterSpacing, invert, ditherAlgo, ditherAmount } = layer;
  const displayText = (allCaps || smallCaps) ? text.toUpperCase() : text;

  // Await font load before measuring/drawing to avoid stale glyph metrics.
  const fontSpec = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}40px "${font}"`;
  await document.fonts.load(fontSpec);

  drawText(canvas, displayText, text, font, bold, italic, smallCaps, hAlign, vAlign, letterSpacing, invert);

  if (ditherAlgo !== 'none' && ditherAmount > 0) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyDither(imageData.data, canvas.width, canvas.height, ditherAlgo, ditherAmount);
    ctx.putImageData(imageData, 0, 0);
  }
}
