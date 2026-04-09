/**
 * Composite all visible layers onto `ctx` using black-pixel XOR semantics:
 * each layer's opaque-and-dark pixel flips the destination pixel between
 * black and white. Transparent or light source pixels are skipped, so a
 * single layer paints normally; two overlapping layers cut a hole; three
 * paint again; and so on.
 *
 * Reads/writes ImageData once for the destination and once per layer. Uses
 * a Uint32Array view on the destination for the flip itself so the inner
 * loop is a single 32-bit store rather than three byte stores.
 *
 * `offscreenMap` is a Map<layer.id, HTMLCanvasElement> of pre-rendered
 * per-layer offscreens, all sized labelW × labelH. Layers without an entry
 * in the map are skipped.
 */
export function xorComposite(ctx, labelW, labelH, layers, offscreenMap) {
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, labelW, labelH);

  const visibleLayers = layers.filter(l => l.visible && offscreenMap.get(l.id));
  if (visibleLayers.length === 0) return;

  const result = ctx.getImageData(0, 0, labelW, labelH);
  const resultData = result.data;
  const resultU32 = new Uint32Array(resultData.buffer);
  // Premultiplied byte order in a Uint32Array on little-endian systems is
  // ABGR; both targets here are RGBA grayscale (R==G==B), so the literal
  // value is the same regardless of endian: 0xFF000000 + 0x00RRGGBB.
  const WHITE_U32 = (255 << 24) | (255 << 16) | (255 << 8) | 255;
  const BLACK_U32 = (255 << 24) |   (0 << 16) |   (0 << 8) |   0;

  for (const layer of visibleLayers) {
    const off = offscreenMap.get(layer.id);
    const offCtx = off.getContext('2d');
    const src = offCtx.getImageData(0, 0, labelW, labelH);
    const srcData = src.data;
    const len = srcData.length;
    if (layer.xor === false) {
      // Overwrite mode: opaque-dark source pixels paint solid black on the
      // destination, no flipping. Layer order matters — a top overwrite
      // layer covers whatever is beneath it.
      for (let i = 0; i < len; i += 4) {
        if (srcData[i + 3] <= 128) continue;
        if (srcData[i] >= 128) continue;
        resultU32[i >> 2] = BLACK_U32;
      }
    } else {
      // XOR mode (default): each opaque-dark source pixel flips the
      // destination between black and white.
      for (let i = 0; i < len; i += 4) {
        if (srcData[i + 3] <= 128) continue;
        if (srcData[i] >= 128) continue;
        const j = i >> 2;
        resultU32[j] = (resultData[i] < 128) ? WHITE_U32 : BLACK_U32;
      }
    }
  }

  ctx.putImageData(result, 0, 0);
}
