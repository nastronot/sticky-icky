/** Padding (in canvas pixels) reserved on every side of the label when fitting
 *  text. Shared by the fitter and the renderer so they agree on the safe area. */
export const PAD = 20;

export function applyFont(ctx, size, font, bold, italic) {
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px "${font}"`;
}

export function measureLine(ctx, text, letterSpacing, scInfo) {
  if (!text) return 0;
  const chars = [...text];
  let width = 0;
  if (scInfo) {
    const origChars = [...scInfo.origLine];
    for (let i = 0; i < chars.length; i++) {
      const origCh = origChars[i] ?? chars[i];
      const isLower = origCh !== origCh.toUpperCase();
      applyFont(ctx, isLower ? scInfo.smallSize : scInfo.fullSize, scInfo.font, scInfo.bold, scInfo.italic);
      width += ctx.measureText(chars[i]).width + letterSpacing;
    }
    applyFont(ctx, scInfo.fullSize, scInfo.font, scInfo.bold, scInfo.italic);
  } else {
    for (const ch of chars) {
      width += ctx.measureText(ch).width + letterSpacing;
    }
  }
  return width - letterSpacing;
}

export function drawLine(ctx, text, x, y, letterSpacing, scInfo) {
  const chars = [...text];
  let cx = x;
  if (scInfo) {
    const origChars = [...scInfo.origLine];
    for (let i = 0; i < chars.length; i++) {
      const origCh = origChars[i] ?? chars[i];
      const isLower = origCh !== origCh.toUpperCase();
      applyFont(ctx, isLower ? scInfo.smallSize : scInfo.fullSize, scInfo.font, scInfo.bold, scInfo.italic);
      ctx.fillText(chars[i], cx, y);
      cx += ctx.measureText(chars[i]).width + letterSpacing;
    }
    applyFont(ctx, scInfo.fullSize, scInfo.font, scInfo.bold, scInfo.italic);
  } else {
    for (const ch of chars) {
      ctx.fillText(ch, cx, y);
      cx += ctx.measureText(ch).width + letterSpacing;
    }
  }
}

/** Binary-search the largest font size where all lines fit within maxW × maxH. */
export function fitLines(ctx, lines, font, bold, italic, letterSpacing, maxW, maxH, smallCaps, origLines) {
  let lo = 4;
  let hi = 2000;
  let best = null;

  while (lo <= hi) {
    const size = Math.floor((lo + hi) / 2);
    applyFont(ctx, size, font, bold, italic);
    ctx.textBaseline = 'alphabetic';

    // Measure true painted height from actualBoundingBox metrics (use full size — capitals set the line height)
    let maxAscent = 0;
    let maxDescent = 0;
    for (const line of lines) {
      const m = ctx.measureText(line || 'M');
      maxAscent = Math.max(maxAscent, m.actualBoundingBoxAscent);
      maxDescent = Math.max(maxDescent, m.actualBoundingBoxDescent);
    }
    const lineH = maxAscent + maxDescent;
    const gap = size * 0.15;
    const totalH = lineH * lines.length + gap * (lines.length - 1);

    const smallSize = Math.round(size * 0.7);
    const maxLineW = Math.max(...lines.map((l, i) => {
      const scInfo = smallCaps ? { origLine: origLines[i], fullSize: size, smallSize, font, bold, italic } : null;
      return measureLine(ctx, l, letterSpacing, scInfo);
    }));

    if (maxLineW <= maxW && totalH <= maxH) {
      best = { size, lines, origLines, coverage: maxLineW * totalH, totalH, maxLineW, lineH, gap, maxAscent };
      lo = size + 1;
    } else {
      hi = size - 1;
    }
  }

  return best;
}
