import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Plus, Settings2 } from 'lucide-react';
import { getPattern, PATTERN_SIZE } from '../utils/patterns.js';
import { PatternContext } from './patternContext.js';

const SWATCH_SIZE = 28;

function renderSwatch(canvas, pattern) {
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000';
  const pw = pattern.width ?? PATTERN_SIZE;
  const ph = pattern.height ?? PATTERN_SIZE;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (pattern.data[(py % ph) * pw + (px % pw)]) ctx.fillRect(px, py, 1, 1);
    }
  }
}

function Swatch({ pattern, size }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (canvasRef.current && pattern) renderSwatch(canvasRef.current, pattern);
  }, [pattern]);
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
 * Fill-pattern picker. Reads the live registry from PatternContext so that
 * user-created patterns appear immediately. The dropdown body lists every
 * pattern (favourites first, then defaults, then custom), followed by two
 * action entries: "Create new pattern" and "Manage patterns…".
 */
export default function PatternPicker({ value, onChange }) {
  const { patterns, onCreatePattern, onManagePatterns } = useContext(PatternContext);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const sorted = useMemo(() => {
    const copy = patterns.slice();
    copy.sort((a, b) => {
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
      if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
      return (a.label ?? '').localeCompare(b.label ?? '');
    });
    return copy;
  }, [patterns]);

  const current = getPattern(value ?? 'default-solid');

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onClick);
    return () => document.removeEventListener('pointerdown', onClick);
  }, [open]);

  const handleCreate = () => {
    setOpen(false);
    onCreatePattern();
  };
  const handleManage = () => {
    setOpen(false);
    onManagePatterns();
  };

  return (
    <div className="control-group">
      <span>Fill pattern</span>
      <div className="pattern-dropdown" ref={wrapRef}>
        <button
          type="button"
          className="pattern-trigger"
          onClick={() => setOpen(o => !o)}
        >
          <Swatch pattern={current} size={SWATCH_SIZE} />
          <span className="pattern-trigger-label">{current.label}</span>
          <ChevronDown size={14} className="pattern-trigger-chevron" />
        </button>

        {open && (
          <div className="pattern-menu">
            {sorted.map(pat => (
              <button
                key={pat.id}
                type="button"
                className={`pattern-option ${pat.id === current.id ? 'selected' : ''}`}
                onClick={() => { onChange(pat.id); setOpen(false); }}
              >
                <Swatch pattern={pat} size={SWATCH_SIZE} />
                <span>{pat.label}</span>
              </button>
            ))}
            <div className="pattern-menu-divider" />
            <button
              type="button"
              className="pattern-option pattern-option-action"
              onClick={handleCreate}
            >
              <Plus size={14} />
              <span>Create new pattern</span>
            </button>
            <button
              type="button"
              className="pattern-option pattern-option-action"
              onClick={handleManage}
            >
              <Settings2 size={14} />
              <span>Manage patterns</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
