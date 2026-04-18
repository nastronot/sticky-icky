import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { PATTERN_SIZE } from '../utils/patterns.js';

const GRID_SIZE = PATTERN_SIZE;      // 32 cells per side
const CELL_PX = 14;                  // rendered size of each cell on screen
const GRID_PX = GRID_SIZE * CELL_PX; // 448px grid
const PREVIEW_PX = 128;              // live tile preview canvas size
const MAX_NAME_LEN = 50;

function emptyData() {
  return new Array(GRID_SIZE * GRID_SIZE).fill(0);
}

/**
 * Pattern editor modal. Creates or edits a single 32×32 pattern.
 *
 * Props:
 *   initial            — { id, label, data } when editing, null/undefined for a new pattern
 *   existingPatterns   — full registry list used for the case-insensitive
 *                        name collision check (the current pattern's own
 *                        id is excluded from the check)
 *   onCancel()
 *   onSave({ id, label, data })
 */
export default function PatternEditor({ initial, existingPatterns = [], onCancel, onSave }) {
  const isEdit = Boolean(initial?.id);
  const [name, setName] = useState(initial?.label ?? '');
  const [data, setData] = useState(() => (
    initial?.data ? initial.data.slice() : emptyData()
  ));
  const [collision, setCollision] = useState(null); // null | conflictingName
  const gridCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const nameRef = useRef(null);

  // Painting state for click-and-drag: once the first cell is toggled we lock
  // in the target value and paint every cell we drag over into that state.
  const paintRef = useRef({ active: false, value: 1, seen: new Set() });

  useEffect(() => {
    nameRef.current?.focus();
    if (initial?.label) nameRef.current?.select();
  }, [initial?.label]);

  // Draw the grid onto its canvas. Re-runs whenever the cell data changes.
  useEffect(() => {
    const c = gridCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, GRID_PX, GRID_PX);
    ctx.fillStyle = '#000';
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (data[y * GRID_SIZE + x]) {
          ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
        }
      }
    }
    // Light grid overlay so empty cells are visually distinguishable.
    ctx.strokeStyle = 'rgba(127, 127, 127, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < GRID_SIZE; i++) {
      const v = i * CELL_PX + 0.5;
      ctx.moveTo(v, 0); ctx.lineTo(v, GRID_PX);
      ctx.moveTo(0, v); ctx.lineTo(GRID_PX, v);
    }
    ctx.stroke();
  }, [data]);

  // Draw the tiled preview (repeats the pattern across PREVIEW_PX × PREVIEW_PX
  // at 1:1 pixel scale — so 4 full tiles fit in the 128px preview).
  useEffect(() => {
    const c = previewCanvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const img = ctx.createImageData(PREVIEW_PX, PREVIEW_PX);
    for (let y = 0; y < PREVIEW_PX; y++) {
      for (let x = 0; x < PREVIEW_PX; x++) {
        const on = data[(y % GRID_SIZE) * GRID_SIZE + (x % GRID_SIZE)];
        const idx = (y * PREVIEW_PX + x) * 4;
        const v = on ? 0 : 255;
        img.data[idx] = v;
        img.data[idx + 1] = v;
        img.data[idx + 2] = v;
        img.data[idx + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [data]);

  const cellAtEvent = (e) => {
    const rect = gridCanvasRef.current.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * GRID_SIZE);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * GRID_SIZE);
    if (x < 0 || x >= GRID_SIZE || y < 0 || y >= GRID_SIZE) return null;
    return y * GRID_SIZE + x;
  };

  const onPointerDown = (e) => {
    const idx = cellAtEvent(e);
    if (idx === null) return;
    e.preventDefault();
    const next = data[idx] ? 0 : 1;
    paintRef.current = { active: true, value: next, seen: new Set([idx]) };
    setData(d => {
      const copy = d.slice();
      copy[idx] = next;
      return copy;
    });
    gridCanvasRef.current.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!paintRef.current.active) return;
    const idx = cellAtEvent(e);
    if (idx === null) return;
    const paint = paintRef.current;
    if (paint.seen.has(idx)) return;
    paint.seen.add(idx);
    setData(d => {
      if (d[idx] === paint.value) return d;
      const copy = d.slice();
      copy[idx] = paint.value;
      return copy;
    });
  };

  const onPointerUp = (e) => {
    paintRef.current.active = false;
    gridCanvasRef.current?.releasePointerCapture?.(e.pointerId);
  };

  const handleClear = () => setData(emptyData());
  const handleFill = () => setData(new Array(GRID_SIZE * GRID_SIZE).fill(1));
  const handleInvert = () => setData(d => d.map(v => (v ? 0 : 1)));

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();
    const conflict = existingPatterns.find(
      p => (p.label ?? '').trim().toLowerCase() === lower && p.id !== initial?.id,
    );
    if (conflict) {
      setCollision(conflict.label);
      return;
    }
    onSave({
      id: initial?.id,
      label: trimmed,
      data,
    });
  };

  const title = useMemo(() => (
    isEdit ? `Edit Pattern: ${initial?.label ?? ''}` : 'New Pattern'
  ), [isEdit, initial?.label]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    if (e.key === 'Enter' && e.target === nameRef.current) {
      e.preventDefault();
      submit();
    }
  };

  const onBackdropClick = (e) => { if (e.target === e.currentTarget) onCancel(); };

  return (
    <div className="cal-backdrop" onClick={onBackdropClick} onKeyDown={onKeyDown}>
      <div className="cal-panel pattern-editor-panel">
        <div className="cal-header">
          <h2>{title}</h2>
          <button type="button" className="cal-close" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="pattern-editor-body">
          <label className="settings-field save-dialog-field">
            <span className="settings-label">Name</span>
            <input
              ref={nameRef}
              type="text"
              maxLength={MAX_NAME_LEN}
              value={name}
              onChange={e => { setName(e.target.value); setCollision(null); }}
              onKeyDown={onKeyDown}
              placeholder="Pattern name"
            />
            {collision && (
              <span className="status error" style={{ textAlign: 'left' }}>
                A pattern named "{collision}" already exists.
              </span>
            )}
          </label>

          <div className="pattern-editor-workspace">
            <canvas
              ref={gridCanvasRef}
              className="pattern-editor-grid"
              width={GRID_PX}
              height={GRID_PX}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            />
            <div className="pattern-editor-side">
              <div className="pattern-editor-preview-label">Tiled preview</div>
              <canvas
                ref={previewCanvasRef}
                className="pattern-editor-preview"
                width={PREVIEW_PX}
                height={PREVIEW_PX}
              />
              <div className="pattern-editor-tools">
                <button type="button" className="cal-btn" onClick={handleClear}>Clear</button>
                <button type="button" className="cal-btn" onClick={handleFill}>Fill</button>
                <button type="button" className="cal-btn" onClick={handleInvert}>Invert</button>
              </div>
            </div>
          </div>
        </div>

        <div className="cal-actions">
          <button type="button" className="cal-btn" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="cal-btn primary"
            onClick={submit}
            disabled={!name.trim()}
          >Save</button>
        </div>
      </div>
    </div>
  );
}
