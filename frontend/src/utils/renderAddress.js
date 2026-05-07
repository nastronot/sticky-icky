import { PAD, applyFont, drawLine } from './textFitting.js';
import { applyDither } from './dither.js';
import { createCanvasPattern } from './patterns.js';
import { parseCountryCode, getFlagImage } from './flags.js';

export const ADDRESS_MAX_LINES = 7;
export const ADDRESS_MIN_SIZE_SCALE = 0.25;

// Outer perimeter stroke. Constant rather than label-relative so the line
// always reads as a hairline at print resolution regardless of stock size.
const BORDER_THICKNESS = 3;

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

/** Compute banner geometry for a layer with a Postcrossing ID, including the
 *  resolved flag image (or null when the country code is unknown). Returns
 *  null when no ID is set — the caller then renders the address across the
 *  full label. The banner sits in the top-left, sized to its own content
 *  (flag + ID) with padding scaled to the ID font; if it would overflow the
 *  label width, the ID font shrinks to fit. */
async function computeBanner(ctx, layer, W, H) {
  const idText = (layer.postcrossingId ?? '').trim();
  if (!idText) return null;

  const code = parseCountryCode(idText);
  const flag = await getFlagImage(code);

  const font = layer.font;
  const bold = !!layer.bold;
  const italic = !!layer.italic;

  // ID font is a fraction of label height — gives the banner a consistent
  // visual weight across stock sizes without needing per-stock tuning.
  let idFontSize = Math.max(12, Math.round(H * 0.13));

  const measure = () => {
    applyFont(ctx, idFontSize, font, bold, italic);
    ctx.textBaseline = 'alphabetic';
    const m = ctx.measureText(idText);
    return {
      idTextW: m.width,
      idAscent: m.actualBoundingBoxAscent,
      idDescent: m.actualBoundingBoxDescent,
    };
  };

  const flagAspect = flag ? flag.naturalWidth / flag.naturalHeight : 0;

  const layout = (measured) => {
    const idH = measured.idAscent + measured.idDescent;
    const padX = Math.max(8, Math.round(idFontSize * 0.25));
    const padY = Math.max(6, Math.round(idFontSize * 0.18));
    const gap = flag ? Math.max(8, Math.round(idFontSize * 0.3)) : 0;
    const flagH = flag ? idH : 0;
    const flagW = flag ? Math.round(flagAspect * flagH) : 0;
    const bannerW = padX * 2 + flagW + gap + measured.idTextW;
    const bannerH = padY * 2 + idH;
    return { padX, padY, gap, flagW, flagH, idH, bannerW, bannerH };
  };

  let measured = measure();
  let geom = layout(measured);

  // Shrink the ID font if the banner would otherwise overflow the label.
  if (geom.bannerW > W) {
    const ratio = W / geom.bannerW;
    idFontSize = Math.max(8, Math.floor(idFontSize * ratio));
    measured = measure();
    geom = layout(measured);
  }

  let cursorX = geom.padX;
  let flagX = 0;
  let flagY = 0;
  if (flag) {
    flagX = cursorX;
    flagY = geom.padY;
    cursorX += geom.flagW + geom.gap;
  }
  const idX = cursorX;
  const idBaseY = geom.padY + measured.idAscent;

  return {
    w: Math.min(geom.bannerW, W),
    h: geom.bannerH,
    idText,
    idFontSize,
    font, bold, italic,
    idX, idBaseY,
    flag, flagX, flagY,
    flagW: geom.flagW, flagH: geom.flagH,
  };
}

/** Paint the banner: solid black ground, inverted flag (black-on-white in the
 *  source SVG → white-on-black on the banner via canvas filter), and the ID
 *  text in white. Drawn after the address so the banner area always wins. */
function drawBanner(ctx, banner) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, banner.w, banner.h);

  if (banner.flag) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.filter = 'invert(1)';
    ctx.drawImage(banner.flag, banner.flagX, banner.flagY, banner.flagW, banner.flagH);
    ctx.restore();
  }

  applyFont(ctx, banner.idFontSize, banner.font, banner.bold, banner.italic);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'white';
  ctx.fillText(banner.idText, banner.idX, banner.idBaseY);
  ctx.restore();
}

/** Thin black perimeter stroke. fillRect on each edge keeps it crisp at
 *  printer resolution — strokeRect anti-aliases at fractional positions. */
function drawOuterBorder(ctx, W, H) {
  ctx.fillStyle = 'black';
  ctx.fillRect(0, 0, W, BORDER_THICKNESS);
  ctx.fillRect(0, H - BORDER_THICKNESS, W, BORDER_THICKNESS);
  ctx.fillRect(0, 0, BORDER_THICKNESS, H);
  ctx.fillRect(W - BORDER_THICKNESS, 0, BORDER_THICKNESS, H);
}

/** Render an Address layer into the given (already-sized) offscreen canvas.
 *  Layout:
 *    1. Top-left banner (when postcrossingId is set) — black bar with the
 *       inverted country flag and ID in white. Banner is sized to its
 *       content; the country code prefix picks the flag from the registry.
 *    2. Address block — auto-fitted into the area below the banner (or the
 *       whole label, when no banner). Same rules as before: up to 7 lines,
 *       left-justified within a block centered horizontally and vertically.
 *    3. Outer border — thin black perimeter stroke, drawn last on top of
 *       both regions.
 *  Like Big Text, the layer occupies the full canvas — no x/y/width/height/
 *  rotation, and stored bounds on legacy records are ignored. */
export async function renderAddressLayer(canvas, layer) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (W <= 0 || H <= 0) return;

  const { font, bold, italic, sizeScale, fillPattern, invert, ditherAlgo, ditherAmount } = layer;

  await document.fonts.load(`${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}40px "${font}"`);

  const banner = await computeBanner(ctx, layer, W, H);

  // Address occupies the area below the banner (or the full label when no
  // banner is present). Note: the address text is left untouched — the ID is
  // no longer suffixed onto the address text block.
  const addressArea = banner
    ? { x: 0, y: banner.h, w: W, h: H - banner.h }
    : { x: 0, y: 0, w: W, h: H };

  const lines = splitAddressLines(layer.text);
  const hasText = lines.some(l => l.length > 0);

  const patId = fillPattern ?? 'default-solid';
  const usePattern = patId !== 'solid' && patId !== 'default-solid';

  // Address block render — must run while the canvas is still empty
  // elsewhere so source-in / destination-out only see address pixels.
  if (!hasText) {
    if (invert && addressArea.w > 0 && addressArea.h > 0) {
      ctx.fillStyle = usePattern ? createCanvasPattern(ctx, patId) : 'black';
      ctx.fillRect(addressArea.x, addressArea.y, addressArea.w, addressArea.h);
    }
  } else {
    const maxW = addressArea.w - PAD * 2;
    const maxH = addressArea.h - PAD * 2;
    const fit = fitAddress(ctx, lines, font, !!bold, !!italic, maxW, maxH);
    if (fit) {
      const scale = Math.max(ADDRESS_MIN_SIZE_SCALE, Math.min(1, sizeScale ?? 1));
      const size = Math.max(4, Math.round(fit.size * scale));

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

      const drawText = () => {
        applyFont(ctx, size, font, !!bold, !!italic);
        ctx.textBaseline = 'alphabetic';
        const blockStartX = addressArea.x + (addressArea.w - blockW) / 2;
        const startY = addressArea.y + (addressArea.h - totalH) / 2;
        for (let i = 0; i < lines.length; i++) {
          const yy = startY + i * (lineH + gap) + maxAscent;
          drawLine(ctx, lines[i], blockStartX, yy, 0, null);
        }
      };

      if (invert) {
        if (usePattern) {
          ctx.fillStyle = createCanvasPattern(ctx, patId);
          ctx.fillRect(addressArea.x, addressArea.y, addressArea.w, addressArea.h);
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = 'black';
          drawText();
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.fillStyle = 'black';
          ctx.fillRect(addressArea.x, addressArea.y, addressArea.w, addressArea.h);
          ctx.fillStyle = 'white';
          drawText();
        }
      } else {
        if (usePattern) {
          ctx.fillStyle = 'black';
          drawText();
          ctx.globalCompositeOperation = 'source-in';
          ctx.fillStyle = createCanvasPattern(ctx, patId);
          ctx.fillRect(addressArea.x, addressArea.y, addressArea.w, addressArea.h);
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.fillStyle = 'black';
          drawText();
        }
      }
    }
  }

  if (banner) drawBanner(ctx, banner);
  drawOuterBorder(ctx, W, H);

  if (ditherAlgo !== 'none' && ditherAmount > 0) {
    const imageData = ctx.getImageData(0, 0, W, H);
    applyDither(imageData.data, W, H, ditherAlgo, ditherAmount);
    ctx.putImageData(imageData, 0, 0);
  }
}
