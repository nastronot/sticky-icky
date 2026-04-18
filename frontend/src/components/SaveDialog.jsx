import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const MAX_NAME_LEN = 100;

/**
 * Modal dialog for saving a design. Captures name + demoSafe flag and runs a
 * case-insensitive overwrite check against the existing designs list.
 *
 * Props:
 *   initialName, initialDemoSafe — pre-populate values (loaded design re-save)
 *   loadedDesignId               — the id being re-saved (null for fresh save)
 *   existingDesigns              — all designs currently in IndexedDB
 *   onCancel()                   — user dismissed the dialog
 *   onSave({ id, name, demoSafe }) — user confirmed; id is either the loaded
 *                                    design's id, the overwrite target's id,
 *                                    or null for a fresh record
 */
export default function SaveDialog({
  initialName = '',
  initialDemoSafe = false,
  loadedDesignId = null,
  existingDesigns = [],
  onCancel,
  onSave,
}) {
  const [name, setName] = useState(initialName);
  const [demoSafe, setDemoSafe] = useState(initialDemoSafe);
  const [overwrite, setOverwrite] = useState(null); // null | { id, name }
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
    if (initialName) inputRef.current?.select();
  }, [initialName]);

  const findConflict = () => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const lower = trimmed.toLowerCase();
    return existingDesigns.find(
      d => (d.name ?? '').trim().toLowerCase() === lower && d.id !== loadedDesignId,
    ) ?? null;
  };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const conflict = findConflict();
    if (conflict) {
      setOverwrite({ id: conflict.id, name: conflict.name });
      return;
    }
    onSave({ id: loadedDesignId, name: trimmed, demoSafe });
  };

  const confirmOverwrite = () => {
    onSave({ id: overwrite.id, name: name.trim(), demoSafe });
  };

  const cancelOverwrite = () => {
    setOverwrite(null);
    // Re-focus the name field so the user can immediately rename.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (overwrite) cancelOverwrite(); else onCancel();
    } else if (e.key === 'Enter') {
      // Ignore enter inside checkboxes etc.; only submit from the text field.
      if (e.target.tagName === 'INPUT' && e.target.type === 'text') {
        e.preventDefault();
        submit();
      }
    }
  };

  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) onCancel();
  };

  if (overwrite) {
    return (
      <div className="cal-backdrop" onClick={onBackdropClick} onKeyDown={onKeyDown}>
        <div className="cal-panel save-dialog">
          <div className="cal-header">
            <h2>Overwrite design?</h2>
            <button type="button" className="cal-close" onClick={onCancel} aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="settings-body">
            <p className="settings-section-hint">
              A design named <strong>"{overwrite.name}"</strong> already exists.
              Overwrite it, or cancel to choose a different name?
            </p>
          </div>
          <div className="cal-actions">
            <button type="button" className="cal-btn" onClick={cancelOverwrite}>Cancel</button>
            <button type="button" className="cal-btn primary" onClick={confirmOverwrite}>Overwrite</button>
          </div>
        </div>
      </div>
    );
  }

  const canSave = name.trim().length > 0;

  return (
    <div className="cal-backdrop" onClick={onBackdropClick} onKeyDown={onKeyDown}>
      <div className="cal-panel save-dialog">
        <div className="cal-header">
          <h2>Save design</h2>
          <button type="button" className="cal-close" onClick={onCancel} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        <div className="settings-body">
          <label className="settings-field save-dialog-field">
            <span className="settings-label">Name</span>
            <input
              ref={inputRef}
              type="text"
              maxLength={MAX_NAME_LEN}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Design name"
            />
          </label>
          <label className="save-dialog-checkbox">
            <input
              type="checkbox"
              checked={demoSafe}
              onChange={e => setDemoSafe(e.target.checked)}
            />
            <span>Demo Safe</span>
          </label>
        </div>
        <div className="cal-actions">
          <button type="button" className="cal-btn" onClick={onCancel}>Cancel</button>
          <button
            type="button"
            className="cal-btn primary"
            onClick={submit}
            disabled={!canSave}
          >Save</button>
        </div>
      </div>
    </div>
  );
}
