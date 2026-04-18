import { useEffect, useMemo, useRef } from 'react';
import { X, Star, Plus, Trash2, Pencil, RotateCcw } from 'lucide-react';
import { PATTERN_SIZE } from '../utils/patterns.js';

const SWATCH_DISPLAY = 48; // shown size; rendered at PATTERN_SIZE × PATTERN_SIZE

function renderSwatch(canvas, pattern) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, PATTERN_SIZE, PATTERN_SIZE);
  ctx.fillStyle = '#000';
  for (let y = 0; y < PATTERN_SIZE; y++) {
    for (let x = 0; x < PATTERN_SIZE; x++) {
      if (pattern.data[y * PATTERN_SIZE + x]) ctx.fillRect(x, y, 1, 1);
    }
  }
}

function PatternRow({ pattern, onEdit, onDelete, onToggleFavorite }) {
  const ref = useRef(null);
  useEffect(() => { renderSwatch(ref.current, pattern); }, [pattern]);
  return (
    <div className="pattern-row">
      <button
        type="button"
        className={`preset-fav ${pattern.favorite ? 'on' : ''}`}
        onClick={() => onToggleFavorite(pattern.id)}
        aria-label={pattern.favorite ? 'Unfavorite' : 'Favorite'}
        title={pattern.favorite ? 'Unfavorite' : 'Favorite'}
      >
        <Star size={14} fill={pattern.favorite ? 'currentColor' : 'none'} />
      </button>
      <canvas
        ref={ref}
        width={PATTERN_SIZE}
        height={PATTERN_SIZE}
        className="pattern-row-swatch"
        style={{ width: SWATCH_DISPLAY, height: SWATCH_DISPLAY }}
      />
      <span className="pattern-row-name">{pattern.label}</span>
      {pattern.isDefault && <span className="pattern-row-tag">default</span>}
      <span className="pattern-row-actions">
        <button
          type="button"
          onClick={() => onEdit(pattern)}
          aria-label={`Edit ${pattern.label}`}
          title="Edit"
        ><Pencil size={14} /></button>
        <button
          type="button"
          onClick={() => onDelete(pattern)}
          aria-label={`Delete ${pattern.label}`}
          title="Delete"
        ><Trash2 size={14} /></button>
      </span>
    </div>
  );
}

/**
 * Pattern management modal. Lists every pattern in the registry with
 * favourite / edit / delete actions, a "New pattern" entry, and a
 * "Restore defaults" action for re-adding deleted defaults.
 *
 * Sort: favourites first, then isDefault, then by label alphabetically.
 */
export default function PatternManager({
  patterns,
  onNew,
  onEdit,
  onDelete,
  onToggleFavorite,
  onRestoreDefaults,
  onClose,
}) {
  const sorted = useMemo(() => {
    const copy = patterns.slice();
    copy.sort((a, b) => {
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
      if (!!a.isDefault !== !!b.isDefault) return a.isDefault ? -1 : 1;
      return (a.label ?? '').localeCompare(b.label ?? '');
    });
    return copy;
  }, [patterns]);

  const onBackdropClick = (e) => { if (e.target === e.currentTarget) onClose(); };

  return (
    <div className="cal-backdrop" onClick={onBackdropClick}>
      <div className="cal-panel pattern-manager-panel">
        <div className="cal-header">
          <h2>Manage Patterns</h2>
          <button type="button" className="cal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="pattern-manager-list">
          {sorted.length === 0 && (
            <p className="preset-empty">No patterns. Create one below.</p>
          )}
          {sorted.map(p => (
            <PatternRow
              key={p.id}
              pattern={p}
              onEdit={onEdit}
              onDelete={onDelete}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
        </div>

        <div className="pattern-manager-footer">
          <button
            type="button"
            className="cal-btn"
            onClick={onRestoreDefaults}
            title="Re-add any deleted built-in patterns"
          >
            <RotateCcw size={14} />
            <span>Restore defaults</span>
          </button>
          <button
            type="button"
            className="cal-btn primary"
            onClick={onNew}
          >
            <Plus size={14} />
            <span>New pattern</span>
          </button>
        </div>
      </div>
    </div>
  );
}
