import { applyFont, drawLine } from './textFitting.js';
import { applyDither } from './dither.js';
import { createCanvasPattern } from './patterns.js';
import { parseCountryCode, getFlagImage } from './flags.js';

export const ADDRESS_MAX_LINES = 7;
export const ADDRESS_MIN_SIZE_SCALE = 0.25;

// Layout proportions — every dimension is a fraction of label height so the
// banner + address block scale together as a unit across stock sizes. The
// only fixed-pixel dimension is the address border, which the user wants as
// a hairline 1-dot stroke regardless of size.
const OUTER_PAD_FRACTION       = 0.04;  // padding between the unit and the label edge (top/bottom/left/right)
const ID_FONT_FRACTION         = 0.11;  // banner ID font size
const BANNER_INNER_PAD_FRACTION = 0.25; // banner padding (× ID font size)
const FLAG_GAP_FRACTION        = 0.3;   // gap between flag and ID text (× ID font size)
const ADDRESS_INNER_PAD_FRACTION = 0.04; // padding inside the address border (× label H)
const ADDRESS_BORDER = 1;                // 1-dot hairline border around the address block

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

/** Compute banner geometry. Returns null when no Postcrossing ID is set —
 *  the caller then renders only the bordered address block. The banner sits
 *  at the top-left of the unit, sized horizontally to its own content
 *  (flag + ID + padding); content scales with the ID length so longer IDs
 *  push the right edge further. The banner's right edge is capped at the
 *  inner-area width — for super-long IDs the font shrinks to fit. */
async function computeBanner(ctx, layer, innerW, H) {
  const idText = (layer.postcrossingId ?? '').trim();
  if (!idText) return null;

  const code = parseCountryCode(idText);
  const flag = await getFlagImage(code);

  const font = layer.font;
  const bold = !!layer.bold;
  const italic = !!layer.italic;

  let idFontSize = Math.max(10, Math.round(H * ID_FONT_FRACTION));

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
    const padX = Math.max(4, Math.round(idFontSize * BANNER_INNER_PAD_FRACTION));
    const padY = Math.max(3, Math.round(idFontSize * BANNER_INNER_PAD_FRACTION * 0.7));
    const gap = flag ? Math.max(4, Math.round(idFontSize * FLAG_GAP_FRACTION)) : 0;
    const flagH = flag ? idH : 0;
    const flagW = flag ? Math.round(flagAspect * flagH) : 0;
    const bannerW = padX * 2 + flagW + gap + measured.idTextW;
    const bannerH = padY * 2 + idH;
    return { padX, padY, gap, flagW, flagH, idH, bannerW, bannerH };
  };

  let measured = measure();
  let geom = layout(measured);

  // Fall-back: if the ID is so long that the banner would overflow the inner
  // width, shrink the ID font until it fits. Typical Postcrossing IDs are
  // bounded enough that this never trips on standard label stocks.
  if (geom.bannerW > innerW) {
    const ratio = innerW / geom.bannerW;
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
    w: Math.min(geom.bannerW, innerW),
    h: geom.bannerH,
    idText,
    idFontSize,
    font, bold, italic,
    idX, idBaseY,
    flag, flagX, flagY,
    flagW: geom.flagW, flagH: geom.flagH,
  };
}

/** Paint the banner at (originX, originY): solid black ground, inverted flag
 *  (black-on-white in the source SVG → white-on-black via canvas filter) and
 *  the ID in white. */
function drawBanner(ctx, banner, originX, originY) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = 'black';
  ctx.fillRect(originX, originY, banner.w, banner.h);

  if (banner.flag) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.filter = 'invert(1)';
    ctx.drawImage(
      banner.flag,
      originX + banner.flagX,
      originY + banner.flagY,
      banner.flagW,
      banner.flagH,
    );
    ctx.restore();
  }

  applyFont(ctx, banner.idFontSize, banner.font, banner.bold, banner.italic);
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'white';
  ctx.fillText(banner.idText, originX + banner.idX, originY + banner.idBaseY);
  ctx.restore();
}

/** 1-dot black hairline framing the address block. Drawn as four fillRect
 *  edges so it stays crisp at print resolution. */
function drawAddressBorder(ctx, x, y, w, h) {
  ctx.fillStyle = 'black';
  ctx.fillRect(x, y, w, ADDRESS_BORDER);                      // top
  ctx.fillRect(x, y + h - ADDRESS_BORDER, w, ADDRESS_BORDER); // bottom
  ctx.fillRect(x, y, ADDRESS_BORDER, h);                      // left
  ctx.fillRect(x + w - ADDRESS_BORDER, y, ADDRESS_BORDER, h); // right
}

/** Render an Address layer. Layout (with ID set):
 *
 *   ┌──────────────────────────────────┐  ← label
 *   │     ↕ OUTER_PAD                  │
 *   │  ┌──────────┐                    │
 *   │  │ FLAG  ID │ (banner: black)    │
 *   │  ├──────────┴─────────────────┐  │
 *   │  │ ↕ INNER_PAD                │  │
 *   │  │   address text             │  │  (1-dot border)
 *   │  │                            │  │
 *   │  └────────────────────────────┘  │
 *   │     ↕ OUTER_PAD                  │
 *   └──────────────────────────────────┘
 *
 *  Without an ID the banner is omitted and the address block fills the
 *  inner area on its own. Everything is proportional to label height so
 *  the entire unit scales together. The layer occupies the full canvas —
 *  no x/y/width/height/rotation — exactly like Big Text. */
export async function renderAddressLayer(canvas, layer) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (W <= 0 || H <= 0) return;

  const { font, bold, italic, sizeScale, fillPattern, invert, ditherAlgo, ditherAmount } = layer;

  await document.fonts.load(`${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}40px "${font}"`);

  const outerPad = Math.max(8, Math.round(H * OUTER_PAD_FRACTION));
  const innerX = outerPad;
  const innerY = outerPad;
  const innerW = W - 2 * outerPad;
  const innerH = H - 2 * outerPad;
  if (innerW <= ADDRESS_BORDER * 2 || innerH <= ADDRESS_BORDER * 2) return;

  const banner = await computeBanner(ctx, layer, innerW, H);

  // Address block fills the inner area below the banner (or the whole inner
  // area when no banner is present). Banner's bottom edge is flush with the
  // address block's top — the next row down is the address top border.
  const addressX = innerX;
  const addressY = innerY + (banner ? banner.h : 0);
  const addressW = innerW;
  const addressH = innerH - (banner ? banner.h : 0);
  if (addressW <= ADDRESS_BORDER * 2 || addressH <= ADDRESS_BORDER * 2) return;

  // Text fits inside the border, then inside an additional padding ring.
  const innerTextPad = Math.max(6, Math.round(H * ADDRESS_INNER_PAD_FRACTION));
  const textX = addressX + ADDRESS_BORDER + innerTextPad;
  const textY = addressY + ADDRESS_BORDER + innerTextPad;
  const textW = addressW - 2 * (ADDRESS_BORDER + innerTextPad);
  const textH = addressH - 2 * (ADDRESS_BORDER + innerTextPad);

  const lines = splitAddressLines(layer.text);
  const hasText = lines.some(l => l.length > 0);

  const patId = fillPattern ?? 'default-solid';
  const usePattern = patId !== 'solid' && patId !== 'default-solid';

  // Address-block interior (the rect bounded by the 1px border, where fill
  // and text live).
  const interiorX = addressX + ADDRESS_BORDER;
  const interiorY = addressY + ADDRESS_BORDER;
  const interiorW = addressW - 2 * ADDRESS_BORDER;
  const interiorH = addressH - 2 * ADDRESS_BORDER;

  // ── Address text + fill ────────────────────────────────────────────────
  if (!hasText) {
    if (invert && interiorW > 0 && interiorH > 0) {
      ctx.fillStyle = usePattern ? createCanvasPattern(ctx, patId) : 'black';
      ctx.fillRect(interiorX, interiorY, interiorW, interiorH);
    }
  } else if (textW > 0 && textH > 0) {
    const fit = fitAddress(ctx, lines, font, !!bold, !!italic, textW, textH);
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
        const blockStartX = textX + (textW - blockW) / 2;
        const startY = textY + (textH - totalH) / 2;
        for (let i = 0; i < lines.length; i++) {
          const yy = startY + i * (lineH + gap) + maxAscent;
          drawLine(ctx, lines[i], blockStartX, yy, 0, null);
        }
      };

      if (invert) {
        if (usePattern) {
          ctx.fillStyle = createCanvasPattern(ctx, patId);
          ctx.fillRect(interiorX, interiorY, interiorW, interiorH);
          ctx.globalCompositeOperation = 'destination-out';
          ctx.fillStyle = 'black';
          drawText();
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.fillStyle = 'black';
          ctx.fillRect(interiorX, interiorY, interiorW, interiorH);
          ctx.fillStyle = 'white';
          drawText();
        }
      } else {
        if (usePattern) {
          ctx.fillStyle = 'black';
          drawText();
          ctx.globalCompositeOperation = 'source-in';
          ctx.fillStyle = createCanvasPattern(ctx, patId);
          ctx.fillRect(interiorX, interiorY, interiorW, interiorH);
          ctx.globalCompositeOperation = 'source-over';
        } else {
          ctx.fillStyle = 'black';
          drawText();
        }
      }
    }
  }

  // ── Address border (1-dot frame) ───────────────────────────────────────
  drawAddressBorder(ctx, addressX, addressY, addressW, addressH);

  // ── Banner (drawn last so it can overlap the address top border) ──────
  if (banner) drawBanner(ctx, banner, innerX, innerY);

  if (ditherAlgo !== 'none' && ditherAmount > 0) {
    const imageData = ctx.getImageData(0, 0, W, H);
    applyDither(imageData.data, W, H, ditherAlgo, ditherAmount);
    ctx.putImageData(imageData, 0, 0);
  }
}
