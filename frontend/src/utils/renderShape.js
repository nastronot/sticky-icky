import { applyDither } from './dither.js';
import { createCanvasPattern } from './patterns.js';

// ── Geometry helpers ────────────────────────────────────────────────────────

/** Regular N-sided polygon inscribed in the given radii. Orientation: the
 *  first vertex sits at the top (-radiusY) so a 3-sided polygon points up. */
function polygonVertices(sides, radiusX, radiusY) {
  const pts = [];
  const step = (Math.PI * 2) / sides;
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + i * step;
    pts.push({ x: Math.cos(a) * radiusX, y: Math.sin(a) * radiusY });
  }
  return pts;
}

/** Regular N-pointed star. Alternates between outer points (on the ellipse
 *  defined by radiusX/radiusY) and inner points scaled by innerRadiusRatio. */
function starVertices(points, radiusX, radiusY, innerRadiusRatio) {
  const pts = [];
  const step = Math.PI / points; // half-step for alternating
  for (let i = 0; i < points * 2; i++) {
    const ratio = i % 2 === 0 ? 1 : innerRadiusRatio;
    const a = -Math.PI / 2 + i * step;
    pts.push({ x: Math.cos(a) * radiusX * ratio, y: Math.sin(a) * radiusY * ratio });
  }
  return pts;
}

/** Path builder for the four bounding-box-based shape kinds. Path is built
 *  in *local* coordinates (centered on origin, axis-aligned) — the caller
 *  is expected to set up translate + rotate before calling this. */
function buildBBoxPath(ctx, layer) {
  const rx = layer.width / 2;
  const ry = layer.height / 2;
  ctx.beginPath();
  switch (layer.shapeKind) {
    case 'rectangle':
      ctx.rect(-rx, -ry, layer.width, layer.height);
      break;
    case 'ellipse':
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      break;
    case 'polygon': {
      const sides = Math.max(3, Math.min(12, layer.sides ?? 6));
      const pts = polygonVertices(sides, rx, ry);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      break;
    }
    case 'star': {
      const points = Math.max(3, Math.min(12, layer.points ?? 5));
      const inner = Math.max(0.05, Math.min(0.95, layer.innerRadiusRatio ?? 0.4));
      const pts = starVertices(points, rx, ry, inner);
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      break;
    }
  }
}

/** Compute the four corners of the rect formed by a line between two
 *  endpoints with a given perpendicular thickness. Returned in order
 *  suitable for a closed canvas path (CW). */
export function lineCornerPoints(x1, y1, x2, y2, thickness) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len < 0.0001) return null;
  const px = -dy / len;
  const py =  dx / len;
  const t = Math.max(1, thickness) / 2;
  return [
    { x: x1 + px * t, y: y1 + py * t },
    { x: x2 + px * t, y: y2 + py * t },
    { x: x2 - px * t, y: y2 - py * t },
    { x: x1 - px * t, y: y1 - py * t },
  ];
}

// ── Renderer ────────────────────────────────────────────────────────────────

/** Render any shape layer (rectangle / ellipse / polygon / star / line)
 *  onto its (already-sized) offscreen canvas. Pattern fill tiles in world
 *  space through the translated+rotated context — same tiling behavior as
 *  the legacy Fill layer. Dithering runs last, matching the other layer
 *  types. */
export function renderShapeLayer(canvas, layer) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const patId = layer.fillPattern ?? 'default-solid';
  const fillStyle = (patId === 'default-solid' || patId === 'solid')
    ? 'black'
    : createCanvasPattern(ctx, patId);

  if (layer.shapeKind === 'line') {
    const corners = lineCornerPoints(layer.x1, layer.y1, layer.x2, layer.y2, layer.thickness ?? 2);
    if (corners) {
      ctx.save();
      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.moveTo(corners[0].x, corners[0].y);
      for (let i = 1; i < corners.length; i++) ctx.lineTo(corners[i].x, corners[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  } else {
    const cx = layer.x + layer.width / 2;
    const cy = layer.y + layer.height / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((layer.rotation * Math.PI) / 180);
    ctx.fillStyle = fillStyle;
    buildBBoxPath(ctx, layer);
    ctx.fill();
    ctx.restore();
  }

  if (layer.invert) {
    const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] <= 128) continue;
      const v = d[i] < 128 ? 255 : 0;
      d[i]     = v;
      d[i + 1] = v;
      d[i + 2] = v;
    }
    ctx.putImageData(id, 0, 0);
  }

  if (layer.ditherAlgo !== 'none' && layer.ditherAmount > 0) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyDither(imageData.data, canvas.width, canvas.height, layer.ditherAlgo, layer.ditherAmount);
    ctx.putImageData(imageData, 0, 0);
  }
}
