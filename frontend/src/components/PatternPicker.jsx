import { useRef, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { PATTERNS, getPattern } from '../utils/patterns.js';

const SWATCH_SIZE = 28;

/** Render a pattern swatch onto a canvas at 1:1 pixel scale. */
function renderSwatch(canvas, patternId) {
  const pat = getPattern(patternId);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (pat.data[(py % pat.height) * pat.width + (px % pat.width)]) {
        ctx.fillRect(px, py, 1, 1);
      }
    }
  }
}

function Swatch({ patternId, size }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (canvasRef.current) renderSwatch(canvasRef.current, patternId);
  }, [patternId]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className="pattern-swatch-canvas"
    />
  );
}

/**
 * Pattern picker — custom dropdown with swatch previews.
 * Closed: shows selected pattern swatch + label + chevron.
 * Open: lists all 12 patterns with swatch + label per row.
 */
export default function PatternPicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const current = getPattern(value ?? 'solid');

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onClick);
    return () => document.removeEventListener('pointerdown', onClick);
  }, [open]);

  return (
    <div className="control-group">
      <span>Fill pattern</span>
      <div className="pattern-dropdown" ref={wrapRef}>
        <button
          type="button"
          className="pattern-trigger"
          onClick={() => setOpen(o => !o)}
        >
          <Swatch patternId={current.id} size={SWATCH_SIZE} />
          <span className="pattern-trigger-label">{current.label}</span>
          <ChevronDown size={14} className="pattern-trigger-chevron" />
        </button>

        {open && (
          <div className="pattern-menu">
            {PATTERNS.map(pat => (
              <button
                key={pat.id}
                type="button"
                className={`pattern-option ${pat.id === current.id ? 'selected' : ''}`}
                onClick={() => { onChange(pat.id); setOpen(false); }}
              >
                <Swatch patternId={pat.id} size={SWATCH_SIZE} />
                <span>{pat.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
