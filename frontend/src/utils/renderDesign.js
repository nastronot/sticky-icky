import { deserializeDesign } from './storage.js';
import { renderAddressLayer } from './renderAddress.js';
import { renderBigTextLayer } from './renderBigText.js';
import { renderImageLayer, makeDitherCache } from './renderImage.js';
import { renderTextLayer } from './renderText.js';
import { renderFillLayer } from './renderFill.js';
import { renderShapeLayer } from './renderShape.js';
import { xorComposite } from './composite.js';

// Fallback dimensions when an exported design predates the labelW/labelH
// fields being stored explicitly. Match the default PRESETS list.
const FALLBACK_PRESETS = [
  { w: 570, h: 406 },
  { w: 832, h: 406 },
  { w: 832, h: 609 },
  { w: 457, h: 406 },
  { w: 457, h: 254 },
];

function deriveLabelDims(design) {
  if (Number.isFinite(design.labelW) && Number.isFinite(design.labelH)) {
    return { labelW: design.labelW, labelH: design.labelH };
  }
  const idx = design.presetIdx ?? 0;
  const fallback = FALLBACK_PRESETS[idx];
  if (fallback) return { labelW: fallback.w, labelH: fallback.h };
  // Custom preset: derive from inches × printer DPI.
  const w = Math.round((design.customW ?? 4.0) * 203);
  const h = Math.round((design.customH ?? 2.0) * 203);
  return { labelW: w, labelH: h };
}

/**
 * Render a serialized design (gallery format) to a fresh HTMLCanvasElement
 * at full label resolution. The canvas is sized labelW × labelH so the
 * pixel buffer matches what the print pipeline would produce — caller can
 * then `toDataURL('image/png')` for export.
 *
 * Mirrors CanvasPreview's render dispatch but is one-shot, free of caching
 * lifecycles, and doesn't touch any DOM other than the offscreen canvases
 * it creates.
 */
export async function renderDesignToCanvas(design) {
  const { layers } = await deserializeDesign(design);
  const { labelW, labelH } = deriveLabelDims(design);

  const offscreenMap = new Map();
  const ditherCache = makeDitherCache();

  for (const layer of layers) {
    if (!layer.visible) continue;
    const off = document.createElement('canvas');
    off.width = labelW;
    off.height = labelH;
    if (layer.type === 'bigtext') {
      await renderBigTextLayer(off, layer);
    } else if (layer.type === 'address') {
      await renderAddressLayer(off, layer);
    } else if (layer.type === 'image') {
      renderImageLayer(off, layer, ditherCache);
    } else if (layer.type === 'fill') {
      renderFillLayer(off, layer);
    } else if (layer.type === 'shape') {
      renderShapeLayer(off, layer);
    } else if (layer.type === 'text') {
      await renderTextLayer(off, layer);
    }
    offscreenMap.set(layer.id, off);
  }

  const final = document.createElement('canvas');
  final.width = labelW;
  final.height = labelH;
  xorComposite(final.getContext('2d'), labelW, labelH, layers, offscreenMap);
  return final;
}
