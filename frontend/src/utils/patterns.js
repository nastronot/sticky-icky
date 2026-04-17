// Built-in 1-bit tileable fill patterns. Each pattern is a small bitmap
// (typically 8×8 or smaller) that tiles across a layer's bounding box.
// Data is row-major: 1 = on (prints black), 0 = off (transparent).
//
// Pattern pixel data references r1b (github.com/LingDong-/r1b) for several
// entries, adapted to consistent 8×8 or power-of-2 sizes.

/** @typedef {{ id: string, label: string, width: number, height: number, data: number[] }} Pattern */

/** @type {Pattern[]} */
export const PATTERNS = [
  {
    id: 'solid',
    label: 'Solid',
    width: 1, height: 1,
    data: [1],
  },
  {
    id: 'gray-fine',
    label: 'Gray (fine)',
    width: 4, height: 4,
    // 25% density — dot every other pixel in a staggered grid
    data: [
      1,0,0,0,
      0,0,0,0,
      0,0,1,0,
      0,0,0,0,
    ],
  },
  {
    id: 'gray-mid',
    label: 'Gray (50%)',
    width: 2, height: 2,
    // 50% checkerboard
    data: [
      1,0,
      0,1,
    ],
  },
  {
    id: 'gray-coarse',
    label: 'Gray (coarse)',
    width: 4, height: 4,
    // 12.5% density — one dot per 4×4 block (top-left)
    // Same as r1b DOTS2 at 4×4
    data: [
      1,0,0,0,
      0,0,0,0,
      0,0,0,0,
      0,0,0,0,
    ],
  },
  {
    id: 'horizontal-lines',
    label: 'Horizontal lines',
    width: 1, height: 2,
    data: [
      1,
      0,
    ],
  },
  {
    id: 'vertical-lines',
    label: 'Vertical lines',
    width: 2, height: 1,
    data: [1, 0],
  },
  {
    id: 'diagonal-lines',
    label: 'Diagonal lines',
    width: 4, height: 4,
    data: [
      1,0,0,0,
      0,1,0,0,
      0,0,1,0,
      0,0,0,1,
    ],
  },
  {
    id: 'grid',
    label: 'Grid',
    width: 4, height: 4,
    // Thin cross-hatched grid — bottom row and right column are on
    data: [
      0,0,0,1,
      0,0,0,1,
      0,0,0,1,
      1,1,1,1,
    ],
  },
  {
    id: 'cross',
    label: 'Cross',
    width: 8, height: 8,
    // Plus-sign cross pattern
    data: [
      0,0,0,1,0,0,0,0,
      0,0,0,1,0,0,0,0,
      0,0,0,1,0,0,0,0,
      1,1,1,1,1,1,1,0,
      0,0,0,1,0,0,0,0,
      0,0,0,1,0,0,0,0,
      0,0,0,1,0,0,0,0,
      0,0,0,0,0,0,0,0,
    ],
  },
  {
    id: 'brick',
    label: 'Brick',
    width: 8, height: 8,
    // Offset brick / wall pattern
    data: [
      1,1,1,1,1,1,1,1,
      1,0,0,0,1,0,0,0,
      1,0,0,0,1,0,0,0,
      1,0,0,0,1,0,0,0,
      1,1,1,1,1,1,1,1,
      0,0,0,1,0,0,0,1,
      0,0,0,1,0,0,0,1,
      0,0,0,1,0,0,0,1,
    ],
  },
  {
    id: 'waves',
    label: 'Waves',
    width: 8, height: 8,
    // Sinusoidal horizontal wavy lines
    data: [
      0,0,1,1,0,0,0,0,
      0,1,0,0,1,0,0,0,
      1,0,0,0,0,1,0,0,
      0,0,0,0,0,0,1,1,
      0,0,0,0,0,0,1,1,
      1,0,0,0,0,1,0,0,
      0,1,0,0,1,0,0,0,
      0,0,1,1,0,0,0,0,
    ],
  },
  {
    id: 'diamonds',
    label: 'Diamonds',
    width: 8, height: 8,
    // Diamond tile pattern
    data: [
      0,0,0,1,0,0,0,0,
      0,0,1,0,1,0,0,0,
      0,1,0,0,0,1,0,0,
      1,0,0,0,0,0,1,0,
      0,1,0,0,0,1,0,0,
      0,0,1,0,1,0,0,0,
      0,0,0,1,0,0,0,0,
      0,0,0,0,0,0,0,0,
    ],
  },
];

/** Look up a pattern by id. Returns the solid pattern as fallback. */
export function getPattern(id) {
  return PATTERNS.find(p => p.id === id) ?? PATTERNS[0];
}

// ── Canvas pattern cache ─────────────────────────────────────────────────────
// createCanvasPattern() builds a tiny ImageData from the 1-bit data and wraps
// it in a CanvasPattern via ctx.createPattern('repeat'). Cached per pattern id
// so we don't rebuild on every render.

const patternCanvasCache = new Map();

/**
 * Return a CanvasPattern for the given pattern id, suitable for use as
 * ctx.fillStyle. The pattern tiles at 1:1 pixel resolution.
 * @param {CanvasRenderingContext2D} ctx - any 2d context (used only to create the pattern)
 * @param {string} patternId
 * @returns {CanvasPattern}
 */
export function createCanvasPattern(ctx, patternId) {
  if (patternCanvasCache.has(patternId)) return patternCanvasCache.get(patternId);

  const pat = getPattern(patternId);
  const tile = document.createElement('canvas');
  tile.width = pat.width;
  tile.height = pat.height;
  const tCtx = tile.getContext('2d');
  const img = tCtx.createImageData(pat.width, pat.height);
  for (let i = 0; i < pat.data.length; i++) {
    const px = i * 4;
    if (pat.data[i]) {
      img.data[px]     = 0;   // R
      img.data[px + 1] = 0;   // G
      img.data[px + 2] = 0;   // B
      img.data[px + 3] = 255; // A — opaque black
    } else {
      img.data[px + 3] = 0;   // fully transparent
    }
  }
  tCtx.putImageData(img, 0, 0);

  const canvasPat = ctx.createPattern(tile, 'repeat');
  patternCanvasCache.set(patternId, canvasPat);
  return canvasPat;
}
