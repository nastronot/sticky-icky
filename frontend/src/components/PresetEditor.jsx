import { useState } from 'react';
import { X, Trash2, Plus, Star, ChevronDown, ChevronRight } from 'lucide-react';

const PRINTER_DPI = 203;

/**
 * Modal for managing label-stock presets. Every preset is editable: each
 * row has a favorite-star toggle, expandable print settings (D/S/offsets),
 * and a delete button. The delete button disables on the last remaining
 * preset so the dropdown can't end up empty. The Add row at the bottom
 * takes a nickname plus width / height in inches.
 */
export default function PresetEditor({ presets, onAdd, onDelete, onToggleFavorite, onUpdate, onClose }) {
  const [name, setName] = useState('');
  const [w, setW] = useState(2.0);
  const [h, setH] = useState(1.0);
  const [expandedId, setExpandedId] = useState(null);

  const handleAdd = (e) => {
    e?.preventDefault();
    const trimmed = name.trim() || `${w.toFixed(2)} \u00d7 ${h.toFixed(2)}"`;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    onAdd(trimmed, w, h);
    setName('');
  };

  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  const lastRemaining = presets.length <= 1;

  const toggleExpand = (id) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="cal-backdrop" onClick={onBackdropClick}>
      <div className="cal-panel preset-panel">
        <div className="cal-header">
          <h2>Label stocks</h2>
          <button type="button" className="cal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="preset-list">
          {presets.length === 0 && (
            <p className="preset-empty">No presets. Add one below.</p>
          )}
          {presets.map((p) => (
            <div key={p.id} className="preset-item">
              <div className="preset-row">
                <button
                  type="button"
                  className={`preset-fav ${p.favorite ? 'on' : ''}`}
                  onClick={() => onToggleFavorite(p.id)}
                  aria-label={p.favorite ? 'Unfavorite' : 'Favorite'}
                  title={p.favorite ? 'Unfavorite' : 'Favorite'}
                >
                  <Star size={14} fill={p.favorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  type="button"
                  className="preset-expand"
                  onClick={() => toggleExpand(p.id)}
                  aria-label={expandedId === p.id ? 'Collapse settings' : 'Expand settings'}
                  title="Print settings"
                >
                  {expandedId === p.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <span className="preset-name">{p.label}</span>
                <span className="preset-dims">
                  {p.w} \u00d7 {p.h} dots ({(p.w / PRINTER_DPI).toFixed(2)} \u00d7 {(p.h / PRINTER_DPI).toFixed(2)}")
                </span>
                <span className="preset-actions">
                  <button
                    type="button"
                    onClick={() => onDelete(p.id)}
                    disabled={lastRemaining}
                    aria-label={`Delete ${p.label}`}
                    title={lastRemaining ? 'At least one preset must remain' : 'Delete preset'}
                  ><Trash2 size={14} /></button>
                </span>
              </div>

              {expandedId === p.id && (
                <div className="preset-settings">
                  <label>
                    <span>Darkness (0–15)</span>
                    <input
                      type="number"
                      min={0}
                      max={15}
                      step={1}
                      value={p.darkness ?? 15}
                      onChange={e => onUpdate(p.id, { darkness: Math.max(0, Math.min(15, Number(e.target.value) || 0)) })}
                    />
                  </label>
                  <label>
                    <span>Speed (1–4)</span>
                    <input
                      type="number"
                      min={1}
                      max={4}
                      step={1}
                      value={p.speed ?? 1}
                      onChange={e => onUpdate(p.id, { speed: Math.max(1, Math.min(4, Number(e.target.value) || 1)) })}
                    />
                  </label>
                  <label>
                    <span>X offset (bytes)</span>
                    <input
                      type="number"
                      min={0}
                      max={512}
                      step={1}
                      value={p.xOffset ?? 8}
                      onChange={e => onUpdate(p.id, { xOffset: Math.max(0, Math.min(512, Number(e.target.value) || 0)) })}
                    />
                  </label>
                  <label>
                    <span>Y offset (dots)</span>
                    <input
                      type="number"
                      min={0}
                      max={4096}
                      step={1}
                      value={p.yOffset ?? 0}
                      onChange={e => onUpdate(p.id, { yOffset: Math.max(0, Math.min(4096, Number(e.target.value) || 0)) })}
                    />
                  </label>
                </div>
              )}
            </div>
          ))}
        </div>

        <form className="preset-add" onSubmit={handleAdd}>
          <div className="preset-add-fields">
            <label>
              <span>Nickname</span>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="My label"
              />
            </label>
            <label>
              <span>W (in)</span>
              <input
                type="number"
                min={0.5}
                max={4.09}
                step={0.01}
                value={w}
                onChange={e => setW(Number(e.target.value))}
              />
            </label>
            <label>
              <span>H (in)</span>
              <input
                type="number"
                min={0.5}
                max={11.8}
                step={0.01}
                value={h}
                onChange={e => setH(Number(e.target.value))}
              />
            </label>
          </div>
          <button type="submit" className="cal-btn primary">
            <Plus size={14} /> Add stock
          </button>
        </form>
      </div>
    </div>
  );
}
