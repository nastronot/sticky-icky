import { useRef, useEffect } from 'react';
import { PATTERNS, getPattern } from '../utils/patterns.js';

const SWATCH_SIZE = 36;

/** Render a single pattern swatch onto a canvas at enlarged scale. */
function renderSwatch(canvas, patternId) {
  const pat = getPattern(patternId);
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // White background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  // Draw the pattern tiled at 1:1 pixel scale
  ctx.fillStyle = '#000';
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const tx = px % pat.width;
      const ty = py % pat.height;
      if (pat.data[ty * pat.width + tx]) {
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
}

function Swatch({ patternId, selected, onClick }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    renderSwatch(canvas, patternId);
  }, [patternId]);

  const pat = getPattern(patternId);

  return (
    <button
      type="button"
      className={`pattern-swatch ${selected ? 'selected' : ''}`}
      onClick={onClick}
      title={pat.label}
      aria-label={pat.label}
    >
      <canvas
        ref={canvasRef}
        width={SWATCH_SIZE}
        height={SWATCH_SIZE}
        style={{ width: SWATCH_SIZE, height: SWATCH_SIZE, imageRendering: 'pixelated' }}
      />
    </button>
  );
}

/**
 * Pattern picker — a 4×3 grid of swatches showing all built-in patterns.
 * The currently-selected pattern is highlighted.
 */
export default function PatternPicker({ value, onChange }) {
  return (
    <div className="control-group">
      <span>Fill pattern</span>
      <div className="pattern-grid">
        {PATTERNS.map(p => (
          <Swatch
            key={p.id}
            patternId={p.id}
            selected={p.id === (value ?? 'solid')}
            onClick={() => onChange(p.id)}
          />
        ))}
      </div>
    </div>
  );
}
