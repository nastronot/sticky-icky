import { useState } from 'react';
import { X, Trash2, Plus } from 'lucide-react';

const PRINTER_DPI = 203;

/**
 * Modal for managing user-defined label-size presets. Built-in presets are
 * listed in read-only form; user-added presets get a delete button. The
 * Add row at the bottom takes a nickname plus width / height in inches.
 */
export default function PresetEditor({ defaults, userPresets, onAdd, onDelete, onClose }) {
  const [name, setName] = useState('');
  const [w, setW] = useState(2.0);
  const [h, setH] = useState(1.0);

  const handleAdd = (e) => {
    e?.preventDefault();
    const trimmed = name.trim() || `${w.toFixed(2)} × ${h.toFixed(2)}"`;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return;
    onAdd(trimmed, w, h);
    setName('');
  };

  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="cal-backdrop" onClick={onBackdropClick}>
      <div className="cal-panel preset-panel">
        <div className="cal-header">
          <h2>Label sizes</h2>
          <button type="button" className="cal-close" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="preset-list">
          {defaults.map((p, i) => (
            <div key={`d-${i}`} className="preset-row builtin">
              <span className="preset-name">{p.label}</span>
              <span className="preset-dims">{p.w} × {p.h} dots</span>
              <span className="preset-actions">built-in</span>
            </div>
          ))}
          {userPresets.length === 0 && (
            <p className="preset-empty">No custom presets yet. Add one below.</p>
          )}
          {userPresets.map((p) => (
            <div key={p.id} className="preset-row">
              <span className="preset-name">{p.label}</span>
              <span className="preset-dims">{p.w} × {p.h} dots ({(p.w / PRINTER_DPI).toFixed(2)} × {(p.h / PRINTER_DPI).toFixed(2)}")</span>
              <span className="preset-actions">
                <button
                  type="button"
                  onClick={() => onDelete(p.id)}
                  aria-label={`Delete ${p.label}`}
                  title="Delete preset"
                ><Trash2 size={14} /></button>
              </span>
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
            <Plus size={14} /> Add preset
          </button>
        </form>
      </div>
    </div>
  );
}
