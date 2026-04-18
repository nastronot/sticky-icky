// EPX (Eric's Pixel Expansion) upscaler — the pixel-art 2× rule that makes
// crisp enlargements without blurring. 4× is 2× applied twice.
//
// Rule, for each source pixel P with four cardinal neighbours:
//
//       A
//     C P B
//       D
//
// Output quadrant (2×2 block replacing P):
//
//     1 | 2
//     -----
//     3 | 4
//
//   1 = P; if C == A && A != B && C != D → 1 = A
//   2 = P; if A == B && A != C && B != D → 2 = B
//   3 = P; if D == C && C != A && D != B → 3 = C
//   4 = P; if B == D && B != A && D != C → 4 = D
//
// Comparisons use the packed RGBA of each pixel (32-bit equality), so colour
// and alpha both have to match to trigger a corner replacement.

function isEdge(x, y, w, h) {
  return x === 0 || y === 0 || x === w - 1 || y === h - 1;
}

/** EPX 2× upscale. `src` is an ImageData; returns a fresh ImageData of size
 *  (2 * src.width, 2 * src.height). */
export function epxUpscale2x(src) {
  const { width: w, height: h } = src;
  const inU32 = new Uint32Array(src.data.buffer);
  const outW = w * 2;
  const outH = h * 2;
  const outArr = new Uint8ClampedArray(outW * outH * 4);
  const outU32 = new Uint32Array(outArr.buffer);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = inU32[y * w + x];
      let p1 = p, p2 = p, p3 = p, p4 = p;
      if (!isEdge(x, y, w, h)) {
        const a = inU32[(y - 1) * w + x];     // north
        const b = inU32[y * w + (x + 1)];     // east
        const c = inU32[y * w + (x - 1)];     // west
        const d = inU32[(y + 1) * w + x];     // south
        if (c === a && a !== b && c !== d) p1 = a;
        if (a === b && a !== c && b !== d) p2 = b;
        if (d === c && c !== a && d !== b) p3 = c;
        if (b === d && b !== a && d !== c) p4 = d;
      }
      const ox = x * 2;
      const oy = y * 2;
      outU32[oy * outW + ox]         = p1;
      outU32[oy * outW + ox + 1]     = p2;
      outU32[(oy + 1) * outW + ox]     = p3;
      outU32[(oy + 1) * outW + ox + 1] = p4;
    }
  }

  return new ImageData(outArr, outW, outH);
}

/** Upscale by an integer factor. Factor 2 runs EPX once; factor 4 runs it
 *  twice. Any other factor is a no-op (returns the input ImageData).
 *  Factor 1 bypasses processing entirely. */
export function epxUpscale(src, factor) {
  if (factor === 2) return epxUpscale2x(src);
  if (factor === 4) return epxUpscale2x(epxUpscale2x(src));
  return src;
}
