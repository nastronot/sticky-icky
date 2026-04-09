import { forwardRef, useEffect, useRef, useState } from 'react';
import { renderBigTextLayer } from '../utils/renderBigText.js';
import { renderImageLayer, makeDitherCache, pruneDitherCache } from '../utils/renderImage.js';
import { renderTextLayer } from '../utils/renderText.js';
import { xorComposite } from '../utils/composite.js';

// Visual sizing for selection chrome (canvas pixel space — scaled with the
// rest of the canvas via displayScale).
const HANDLE_SIZE = 12;
const HANDLE_HIT_PAD = 4;
const ROTATION_LINE = 32;
const ROTATION_RADIUS = 8;

// True-size mode: maps each printer dot to its actual physical width on
// screen. The screen DPI ideally comes from a calibration step (the user
// holds a ruler against a known-pixel bar) — without one we fall back to
// the standard 96 CSS DPI assumption, which is wrong for most modern
// displays but at least produces a deterministic result.
const PRINTER_DPI = 203;
const FALLBACK_SCREEN_DPI = 96;
function computeTrueSizeScale(screenDPI) {
  const dpi = Number.isFinite(screenDPI) && screenDPI > 0 ? screenDPI : FALLBACK_SCREEN_DPI;
  return dpi / PRINTER_DPI;
}

/**
 * Composited preview of all visible layers + selection chrome + pointer
 * interaction (drag, resize, rotate) for image layers.
 */
const CanvasPreview = forwardRef(function CanvasPreview(
  { layers, labelW, labelH, viewportRotation = 0, trueSize = false, screenDPI = null, selectedLayerId, onSelectLayer, onPatchLayer, onRequestFocusText },
  ref,
) {
  const isRotated = viewportRotation === 90;
  const containerRef = useRef(null);
  const overlayRef = useRef(null);                      // chrome-only canvas, sits on top of the main one
  const offscreenMapRef = useRef(new Map());            // id → HTMLCanvasElement
  const ditherCacheRef = useRef(makeDitherCache());     // id → dither cache entry
  const lastRenderedRef = useRef(new Map());            // id → last layer object reference (for skipping unchanged big-text renders)
  const interactionRef = useRef(null);                  // active pointer interaction
  const [displayScale, setDisplayScale] = useState(0);

  const layersRef = useRef(layers);
  const selectedRef = useRef(selectedLayerId);
  const scaleRef = useRef(displayScale);
  const rotationRef = useRef(viewportRotation);
  const labelWRef = useRef(labelW);
  const labelHRef = useRef(labelH);
  layersRef.current = layers;
  selectedRef.current = selectedLayerId;
  scaleRef.current = displayScale;
  rotationRef.current = viewportRotation;
  labelWRef.current = labelW;
  labelHRef.current = labelH;

  // ── Display scaling ────────────────────────────────────────────────────────
  // Two modes:
  //   - Fit to viewport: scale fills the available container area (the
  //     existing behavior). When viewport rotation is on, the rotated
  //     bounding box swaps width/height so the fit math swaps which axis
  //     bounds which.
  //   - True size: a fixed scale that maps each printer dot to its actual
  //     physical width on screen via 96 CSS DPI / 203 printer DPI.
  useEffect(() => {
    if (trueSize) {
      setDisplayScale(computeTrueSizeScale(screenDPI));
      return;
    }
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      const fitW = isRotated ? labelH : labelW;
      const fitH = isRotated ? labelW : labelH;
      setDisplayScale(Math.min(width / fitW, height / fitH));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [labelW, labelH, isRotated, trueSize, screenDPI]);

  // ── Garbage-collect offscreen canvases / dither cache for removed layers ──
  useEffect(() => {
    const map = offscreenMapRef.current;
    const lastMap = lastRenderedRef.current;
    const live = new Set(layers.map(l => l.id));
    for (const id of map.keys()) if (!live.has(id)) map.delete(id);
    for (const id of lastMap.keys()) if (!live.has(id)) lastMap.delete(id);
    pruneDitherCache(ditherCacheRef.current, layers.map(l => l.id));
  }, [layers]);

  // ── Re-render layers + recomposite + redraw selection chrome ──────────────
  useEffect(() => {
    const visible = ref?.current;
    const container = containerRef.current;
    if (!visible || !container) return;

    visible.width = labelW;
    visible.height = labelH;

    if (trueSize) {
      setDisplayScale(computeTrueSizeScale(screenDPI));
    } else {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const availW = Math.max(rect.width - 48, 1);
        const availH = Math.max(rect.height - 48, 1);
        const fitW = isRotated ? labelH : labelW;
        const fitH = isRotated ? labelW : labelH;
        setDisplayScale(Math.min(availW / fitW, availH / fitH));
      }
    }

    let cancelled = false;
    (async () => {
      const map = offscreenMapRef.current;
      const lastMap = lastRenderedRef.current;
      const ditherCache = ditherCacheRef.current;

      for (const layer of layers) {
        if (!layer.visible) continue;
        let off = map.get(layer.id);
        if (!off) {
          off = document.createElement('canvas');
          map.set(layer.id, off);
        }
        const sizeChanged = off.width !== labelW || off.height !== labelH;
        if (sizeChanged) {
          off.width = labelW;
          off.height = labelH;
        }
        // Skip re-render if the layer object itself is unchanged AND the
        // offscreen size is still correct. React preserves layer object
        // identity when only siblings are patched.
        if (!sizeChanged && lastMap.get(layer.id) === layer) continue;

        if (layer.type === 'bigtext') {
          await renderBigTextLayer(off, layer);
        } else if (layer.type === 'image') {
          renderImageLayer(off, layer, ditherCache);
        } else if (layer.type === 'text') {
          const measured = await renderTextLayer(off, layer);
          if (cancelled) return;
          // Self-correct stale bounding-box dims after fonts load. Stable
          // after one extra render: next pass measures the same dims and
          // skips the patch.
          if (measured.width !== layer.width || measured.height !== layer.height) {
            onPatchLayer(layer.id, { width: measured.width, height: measured.height });
          }
        }
        lastMap.set(layer.id, layer);
      }
      if (cancelled) return;

      // XOR-composite onto the visible (print) canvas. Stays free of UI chrome
      // so the print pipeline can read pixels straight from this canvas.
      xorComposite(visible.getContext('2d'), labelW, labelH, layers, map);

      // Draw selection chrome onto the overlay canvas. Sits on top via CSS;
      // never sampled by the print pipeline.
      const overlay = overlayRef.current;
      if (overlay) {
        if (overlay.width !== labelW) overlay.width = labelW;
        if (overlay.height !== labelH) overlay.height = labelH;
        const octx = overlay.getContext('2d');
        octx.clearRect(0, 0, overlay.width, overlay.height);
        const sel = layers.find(l => l.id === selectedLayerId);
        if ((sel?.type === 'image' || sel?.type === 'text') && sel.visible) drawSelectionChrome(octx, sel);
      }
    })();

    return () => { cancelled = true; };
  }, [layers, labelW, labelH, ref, selectedLayerId, isRotated, trueSize, screenDPI]);

  // ── Pointer interaction ───────────────────────────────────────────────────
  // We attach handlers once, reading current state through refs to avoid
  // tearing the canvases down on every interaction.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;

    const screenToCanvas = (e) => {
      // The overlay's getBoundingClientRect returns the axis-aligned rect of
      // the (possibly CSS-rotated) element. (sx, sy) are the click position
      // inside that rect, in canvas-pixel units.
      const rect = overlay.getBoundingClientRect();
      const scale = scaleRef.current || 1;
      const sx = (e.clientX - rect.left) / scale;
      const sy = (e.clientY - rect.top) / scale;
      if (rotationRef.current === 90) {
        // 90° CW rotation maps original (x, y) → screen (H - y, x). Inverse:
        // x = sy (screen Y), y = labelH - sx (labelH minus screen X). Verify
        // by sanity-checking corners: rotated TL screen (0,0) should resolve
        // to original BL (0, labelH). screenX=0, screenY=0 → x=0, y=labelH ✓.
        return { x: sy, y: labelHRef.current - sx };
      }
      return { x: sx, y: sy };
    };

    const onPointerDown = (e) => {
      const pt = screenToCanvas(e);
      const ls = layersRef.current;
      const selectedId = selectedRef.current;

      // 1. If a handle on the currently-selected image/text layer was hit,
      //    start that interaction immediately (handles often poke outside
      //    the body).
      const selected = ls.find(l => l.id === selectedId);
      if ((selected?.type === 'image' || selected?.type === 'text') && selected.visible) {
        const handle = hitHandle(pt, selected);
        if (handle === 'rotate') {
          beginInteraction(overlay, e, { mode: 'rotate', layer: selected, start: pt });
          return;
        }
        if (handle) {
          beginInteraction(overlay, e, { mode: 'resize', layer: selected, start: pt, handle });
          return;
        }
      }

      // 2. Hit-test all visible image and text layers top-to-bottom for a
      //    body click.
      for (let i = ls.length - 1; i >= 0; i--) {
        const layer = ls[i];
        if (!layer.visible) continue;
        if (layer.type !== 'image' && layer.type !== 'text') continue;
        if (hitBody(pt, layer)) {
          if (layer.id !== selectedId) onSelectLayer(layer.id);
          beginInteraction(overlay, e, { mode: 'move', layer, start: pt });
          return;
        }
      }

      // 3. Empty space click → no-op (don't deselect; deselecting on empty
      //    click would be annoying when missing a small image).
    };

    const beginInteraction = (canvas, e, ix) => {
      interactionRef.current = ix;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not all events have pointerId */ }
    };

    const onPointerMove = (e) => {
      const ix = interactionRef.current;
      if (!ix) return;
      const pt = screenToCanvas(e);
      const dx = pt.x - ix.start.x;
      const dy = pt.y - ix.start.y;
      const layer = ix.layer;

      if (ix.mode === 'move') {
        onPatchLayer(layer.id, { x: layer.x + dx, y: layer.y + dy });
      } else if (ix.mode === 'resize') {
        // Shift inverts the current aspect lock for the duration of the drag:
        // free + shift = constrained, locked + shift = free. The layer
        // reference frozen at drag start is fine — flipping the sidebar
        // toggle mid-drag is not a real workflow.
        const locked = !!layer.lockAspect;
        const constrain = e.shiftKey ? !locked : locked;
        const next = computeResize(layer, ix.handle, dx, dy, constrain);
        if (!next) return;

        if (layer.type === 'text') {
          // Text layers don't stretch — they scale fontSize. Use whichever
          // axis the user dragged more proportionally so edge handles still
          // do something useful. Width/height self-correct from the next
          // render once measureTextLayer runs against the new font size.
          const scaleW = layer.width  > 0 ? next.width  / layer.width  : 1;
          const scaleH = layer.height > 0 ? next.height / layer.height : 1;
          const scale = Math.abs(scaleW - 1) >= Math.abs(scaleH - 1) ? scaleW : scaleH;
          const newFontSize = Math.max(4, layer.fontSize * scale);
          onPatchLayer(layer.id, { fontSize: newFontSize, x: next.x, y: next.y });
        } else {
          onPatchLayer(layer.id, next);
        }
      } else if (ix.mode === 'rotate') {
        const cx = layer.x + layer.width / 2;
        const cy = layer.y + layer.height / 2;
        const ang = (Math.atan2(pt.y - cy, pt.x - cx) * 180) / Math.PI + 90;
        let norm = ((Math.round(ang) % 360) + 360) % 360;
        // Shift snaps to 45° increments (0, 45, 90, 135, 180, 225, 270, 315).
        if (e.shiftKey) {
          norm = (Math.round(norm / 45) * 45) % 360;
        }
        onPatchLayer(layer.id, { rotation: norm });
      }
    };

    const onPointerUp = () => {
      interactionRef.current = null;
    };

    const onDblClick = (e) => {
      const pt = screenToCanvas(e);
      const ls = layersRef.current;

      // Hit-test image/text layers top-down (same as pointerdown).
      for (let i = ls.length - 1; i >= 0; i--) {
        const layer = ls[i];
        if (!layer.visible) continue;
        if (layer.type !== 'image' && layer.type !== 'text') continue;
        if (hitBody(pt, layer)) {
          onSelectLayer(layer.id);
          if (layer.type === 'text') onRequestFocusText?.();
          return;
        }
      }
      // No image/text hit — fall back to the topmost visible Big Text. This
      // makes Big Text "double-click anywhere to edit" since it doesn't
      // participate in pointer hit-testing.
      for (let i = ls.length - 1; i >= 0; i--) {
        const layer = ls[i];
        if (layer.visible && layer.type === 'bigtext') {
          onSelectLayer(layer.id);
          onRequestFocusText?.();
          return;
        }
      }
    };

    overlay.addEventListener('pointerdown', onPointerDown);
    overlay.addEventListener('dblclick', onDblClick);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      overlay.removeEventListener('pointerdown', onPointerDown);
      overlay.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [onSelectLayer, onPatchLayer, onRequestFocusText]);

  // The stack itself is always sized to the unrotated label dimensions in
  // CSS pixels — that's the underlying canvas's display size. The host
  // wraps the stack and is sized to whichever bounding box it occupies on
  // screen (swapped axes when rotated). The stack inside is absolutely
  // centered and rotated via CSS transform; the canvas bitmap buffers and
  // their pixel-level coordinates stay completely unchanged.
  const stackStyle = {
    width: labelW * displayScale,
    height: labelH * displayScale,
  };
  const hostStyle = isRotated
    ? { width: labelH * displayScale, height: labelW * displayScale }
    : stackStyle;

  return (
    <div className="canvas-wrap" ref={containerRef}>
      <div
        className={`canvas-rotation-host ${isRotated ? 'rotated' : ''}`}
        style={hostStyle}
      >
        <div className="canvas-stack" style={stackStyle}>
          <canvas
            ref={ref}
            className="canvas-print"
            width={labelW}
            height={labelH}
            style={stackStyle}
          />
          <canvas
            ref={overlayRef}
            className="canvas-overlay"
            width={labelW}
            height={labelH}
            style={{ ...stackStyle, touchAction: 'none' }}
          />
        </div>
      </div>
    </div>
  );
});

export default CanvasPreview;

// ── Geometry helpers ────────────────────────────────────────────────────────

/** Convert a canvas-space point into the layer's local (un-rotated, centered)
 *  coordinate system. */
function toLocal(pt, layer) {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const dx = pt.x - cx;
  const dy = pt.y - cy;
  const rad = (-layer.rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function hitBody(pt, layer) {
  const lp = toLocal(pt, layer);
  return Math.abs(lp.x) <= layer.width / 2 && Math.abs(lp.y) <= layer.height / 2;
}

/** Handle layout in local coordinates. */
function handleLocalPoints(layer) {
  const w = layer.width / 2;
  const h = layer.height / 2;
  return {
    nw: { x: -w, y: -h },
    n:  { x:  0, y: -h },
    ne: { x:  w, y: -h },
    e:  { x:  w, y:  0 },
    se: { x:  w, y:  h },
    s:  { x:  0, y:  h },
    sw: { x: -w, y:  h },
    w:  { x: -w, y:  0 },
    rotate: { x: 0, y: -h - ROTATION_LINE },
  };
}

function hitHandle(pt, layer) {
  const lp = toLocal(pt, layer);
  const handles = handleLocalPoints(layer);
  const r = HANDLE_SIZE / 2 + HANDLE_HIT_PAD;
  for (const [name, p] of Object.entries(handles)) {
    if (Math.abs(lp.x - p.x) <= r && Math.abs(lp.y - p.y) <= r) return name;
  }
  return null;
}

/** Translate a (dx, dy) drag of the given handle into a layer patch.
 *  Resize is computed in local space so rotated boxes still feel right.
 *  If `constrain` is true (shift held), the new dimensions are forced to
 *  preserve the layer's original aspect ratio — driven by whichever axis
 *  changed more. Default is free / per-axis resize. */
function computeResize(layer, handle, dx, dy, constrain) {
  // Convert the world-space delta into local space (rotate by -theta).
  const rad = (-layer.rotation * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;

  let w = layer.width;
  let h = layer.height;
  // Anchor in local space (opposite handle).
  const anchorX = handle.includes('w') ? w / 2 : handle.includes('e') ? -w / 2 : 0;
  const anchorY = handle.includes('n') ? h / 2 : handle.includes('s') ? -h / 2 : 0;

  if (handle.includes('e')) w += lx;
  if (handle.includes('w')) w -= lx;
  if (handle.includes('s')) h += ly;
  if (handle.includes('n')) h -= ly;
  w = Math.max(4, w);
  h = Math.max(4, h);

  if (constrain && layer.width > 0 && layer.height > 0) {
    const aspect = layer.width / layer.height;
    const dwRatio = Math.abs(w - layer.width) / layer.width;
    const dhRatio = Math.abs(h - layer.height) / layer.height;
    if (dwRatio >= dhRatio) {
      h = w / aspect;
    } else {
      w = h * aspect;
    }
    w = Math.max(4, w);
    h = Math.max(4, h);
  }

  // Re-center so the anchor edge stays put in world space.
  const newAnchorX = handle.includes('w') ? w / 2 : handle.includes('e') ? -w / 2 : 0;
  const newAnchorY = handle.includes('n') ? h / 2 : handle.includes('s') ? -h / 2 : 0;
  const shiftLX = anchorX - newAnchorX;
  const shiftLY = anchorY - newAnchorY;
  // Convert local shift back to world space (rotate by +theta).
  const cw = Math.cos(-rad);
  const sw = Math.sin(-rad);
  const shiftWX = shiftLX * cw - shiftLY * sw;
  const shiftWY = shiftLX * sw + shiftLY * cw;

  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;
  const newCx = cx + shiftWX;
  const newCy = cy + shiftWY;

  return {
    width: w,
    height: h,
    x: newCx - w / 2,
    y: newCy - h / 2,
  };
}

// ── Selection chrome ────────────────────────────────────────────────────────

function drawSelectionChrome(ctx, layer) {
  const cx = layer.x + layer.width / 2;
  const cy = layer.y + layer.height / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((layer.rotation * Math.PI) / 180);

  // Bounding box outline.
  ctx.strokeStyle = '#3aa0ff';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.strokeRect(-layer.width / 2, -layer.height / 2, layer.width, layer.height);
  ctx.setLineDash([]);

  // Rotation arm.
  ctx.beginPath();
  ctx.moveTo(0, -layer.height / 2);
  ctx.lineTo(0, -layer.height / 2 - ROTATION_LINE);
  ctx.stroke();

  // Resize handles.
  const handles = handleLocalPoints(layer);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#3aa0ff';
  for (const [name, p] of Object.entries(handles)) {
    if (name === 'rotate') continue;
    ctx.beginPath();
    ctx.rect(p.x - HANDLE_SIZE / 2, p.y - HANDLE_SIZE / 2, HANDLE_SIZE, HANDLE_SIZE);
    ctx.fill();
    ctx.stroke();
  }

  // Rotation handle (circle).
  ctx.beginPath();
  ctx.arc(0, -layer.height / 2 - ROTATION_LINE, ROTATION_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}
