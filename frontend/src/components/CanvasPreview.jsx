import { forwardRef, useEffect, useRef, useState } from 'react';
import { renderBigTextLayer } from '../utils/renderBigText.js';

/**
 * Composited preview of all visible layers. Owns:
 *  - the visible canvas (via forwarded ref so the parent can read pixels for printing),
 *  - one offscreen canvas per layer (kept in a ref-stored Map across renders),
 *  - display scaling against the available wrap area.
 */
const CanvasPreview = forwardRef(function CanvasPreview({ layers, labelW, labelH }, ref) {
  const containerRef = useRef(null);
  const offscreenMapRef = useRef(new Map()); // id → HTMLCanvasElement
  const [displayScale, setDisplayScale] = useState(0);

  // ── Display scaling ────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      setDisplayScale(Math.min(width / labelW, height / labelH));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [labelW, labelH]);

  // ── Garbage-collect offscreen canvases for removed layers ─────────────────
  useEffect(() => {
    const map = offscreenMapRef.current;
    const live = new Set(layers.map(l => l.id));
    for (const id of map.keys()) {
      if (!live.has(id)) map.delete(id);
    }
  }, [layers]);

  // ── Re-render layers + recomposite whenever anything that affects the
  //    pixels of the visible canvas changes ────────────────────────────────
  useEffect(() => {
    const visible = ref?.current;
    const container = containerRef.current;
    if (!visible || !container) return;

    visible.width = labelW;
    visible.height = labelH;

    // Compute display scale synchronously so it matches the new label size
    // immediately. getBoundingClientRect() is border-box, subtract 48px (24px
    // padding × 2). Guard: if layout hasn't run yet, rect is zero — skip and
    // let the ResizeObserver handle the first paint.
    const rect = container.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      const availW = Math.max(rect.width - 48, 1);
      const availH = Math.max(rect.height - 48, 1);
      setDisplayScale(Math.min(availW / labelW, availH / labelH));
    }

    let cancelled = false;
    (async () => {
      // Render every visible layer onto its own offscreen canvas.
      const map = offscreenMapRef.current;
      for (const layer of layers) {
        if (!layer.visible) continue;
        let off = map.get(layer.id);
        if (!off) {
          off = document.createElement('canvas');
          map.set(layer.id, off);
        }
        if (off.width !== labelW || off.height !== labelH) {
          off.width = labelW;
          off.height = labelH;
        }
        if (layer.type === 'bigtext') {
          await renderBigTextLayer(off, layer);
        }
      }
      if (cancelled) return;

      // Composite onto the visible canvas. White background first, then layers
      // in order with simple drawImage. Phase 4 will swap this for an XOR-style
      // composite — keeping it dumb for now.
      const ctx = visible.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, visible.width, visible.height);
      for (const layer of layers) {
        if (!layer.visible) continue;
        const off = map.get(layer.id);
        if (off) ctx.drawImage(off, 0, 0);
      }
    })();

    return () => { cancelled = true; };
  }, [layers, labelW, labelH, ref]);

  return (
    <div className="canvas-wrap" ref={containerRef}>
      <canvas
        ref={ref}
        width={labelW}
        height={labelH}
        style={{
          width: labelW * displayScale,
          height: labelH * displayScale,
        }}
      />
    </div>
  );
});

export default CanvasPreview;
