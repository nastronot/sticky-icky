import { useRef, useState } from 'react';
import {
  Eye, EyeOff, Copy, Trash2, Plus,
  RotateCw, RotateCcw, FilePlus, Save, FolderOpen, Printer,
} from 'lucide-react';

export const PRESETS = [
  { label: '3.00 × 2.00"', w: 570, h: 406 },
  { label: '4.00 × 2.00"', w: 832, h: 406 },
  { label: '4.00 × 3.00"', w: 832, h: 609 },
  { label: '2.25 × 2.00"', w: 457, h: 406 },
  { label: '2.25 × 1.25"', w: 457, h: 254 },
  { label: 'Custom', w: null, h: null },
];

/** Right-sidebar layer list and global controls. The top section hosts the
 *  label / save / load / print / rotate-view controls; the middle hosts the
 *  layer list (drag-reorderable); the bottom hosts the Add Layer block. */
export default function LayerPanel({
  layers,
  selectedLayerId,
  onSelect,
  onAddBigText,
  onAddText,
  onAddImage,
  onToggleVisibility,
  onDelete,
  onDuplicate,
  onMoveLayerTo,
  // Global controls (moved here from LayerControls):
  presetIdx,
  onPresetIdxChange,
  customW,
  onCustomWChange,
  customH,
  onCustomHChange,
  viewportRotation,
  onToggleViewportRotation,
  onNew,
  onSave,
  saveStatus,
  onOpenGallery,
  onPrint,
  printStatus,
  copies,
  onCopiesChange,
}) {
  const fileInputRef = useRef(null);
  const handleAddImageClick = () => fileInputRef.current?.click();
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onAddImage(file);
    e.target.value = ''; // allow re-selecting the same file
  };

  // Drag-reorder state. `dragId` is the layer being dragged; `insertIdx` is
  // the proposed insertion index in the live layers array (0..layers.length).
  const [dragId, setDragId] = useState(null);
  const [insertIdx, setInsertIdx] = useState(null);

  const onRowDragStart = (e, layer) => {
    setDragId(layer.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', layer.id);
  };

  const onRowDragOver = (e, idx) => {
    if (!dragId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    setInsertIdx(before ? idx : idx + 1);
  };

  // Drop on the empty area below the last row → insert at end.
  const onListDragOver = (e) => {
    if (!dragId) return;
    e.preventDefault();
    if (e.target === e.currentTarget) setInsertIdx(layers.length);
  };

  const onDrop = (e) => {
    e.preventDefault();
    if (dragId !== null && insertIdx !== null) {
      onMoveLayerTo(dragId, insertIdx);
    }
    setDragId(null);
    setInsertIdx(null);
  };

  const onDragEnd = () => {
    setDragId(null);
    setInsertIdx(null);
  };

  const preset = PRESETS[presetIdx];

  return (
    <aside className="layer-panel">
      <div className="layer-panel-globals">
        <label className="control-group">
          <span>Label size</span>
          <select value={presetIdx} onChange={e => onPresetIdxChange(Number(e.target.value))}>
            {PRESETS.map((p, i) => (
              <option key={p.label} value={i}>{p.label}</option>
            ))}
          </select>
        </label>

        {preset.w === null && (
          <div className="control-group custom-size">
            <label>
              <span>W (in)</span>
              <input
                type="number"
                min={0.5}
                max={4.09}
                step={0.01}
                value={customW}
                onChange={e => onCustomWChange(Number(e.target.value))}
              />
            </label>
            <label>
              <span>H (in)</span>
              <input
                type="number"
                min={0.5}
                max={11.8}
                step={0.01}
                value={customH}
                onChange={e => onCustomHChange(Number(e.target.value))}
              />
            </label>
          </div>
        )}

        <div className="control-group">
          <span>Rotate view</span>
          <div className="btn-group">
            <button
              type="button"
              className={viewportRotation ? 'active' : ''}
              onClick={onToggleViewportRotation}
              title={viewportRotation ? 'Rotate back to landscape' : 'Rotate view 90°'}
              aria-label="Rotate view"
            >
              {viewportRotation ? <RotateCcw size={16} /> : <RotateCw size={16} />}
            </button>
          </div>
        </div>

        <div className="btn-group">
          <button type="button" className="secondary-btn" onClick={onNew} title="New" aria-label="New">
            <FilePlus size={16} />
          </button>
          <button type="button" className="secondary-btn" onClick={onSave} title="Save" aria-label="Save">
            <Save size={16} />
          </button>
          <button type="button" className="secondary-btn" onClick={onOpenGallery} title="Load" aria-label="Load">
            <FolderOpen size={16} />
          </button>
        </div>
        {saveStatus === 'saved' && <p className="status ok">Saved.</p>}
        {saveStatus && typeof saveStatus === 'object' && (
          <p className="status error">Save failed: {saveStatus.error}</p>
        )}

        <div className="print-row">
          <button className="print-btn" onClick={onPrint} disabled={printStatus === 'printing'}>
            <Printer size={16} />
            <span>
              {printStatus === 'printing'
                ? (copies > 1 ? `Printing ${copies} copies…` : 'Printing…')
                : 'Print'}
            </span>
          </button>
          <input
            type="number"
            className="copies-input"
            min={1}
            max={99}
            step={1}
            value={copies}
            onChange={e => onCopiesChange(Math.max(1, Math.min(99, Math.floor(Number(e.target.value)) || 1)))}
            title="Number of copies"
            aria-label="Copies"
          />
        </div>
        {printStatus === 'ok' && <p className="status ok">Sent to printer.</p>}
        {printStatus && typeof printStatus === 'object' && (
          <p className="status error">Error: {printStatus.error}</p>
        )}
      </div>

      <div className="layer-panel-header">
        <span>Layers</span>
      </div>

      <ul
        className="layer-list"
        onDragOver={onListDragOver}
        onDrop={onDrop}
      >
        {layers.map((layer, idx) => {
          const selected = layer.id === selectedLayerId;
          const dragging = layer.id === dragId;
          return (
            <li key={layer.id} className="layer-row-wrap">
              {insertIdx === idx && <div className="layer-insert-bar" />}
              <div
                className={`layer-row ${selected ? 'selected' : ''} ${dragging ? 'dragging' : ''}`}
                onClick={() => onSelect(layer.id)}
                draggable
                onDragStart={e => onRowDragStart(e, layer)}
                onDragOver={e => onRowDragOver(e, idx)}
                onDrop={onDrop}
                onDragEnd={onDragEnd}
              >
                <button
                  type="button"
                  className="layer-vis"
                  aria-label={layer.visible ? 'Hide layer' : 'Show layer'}
                  onClick={e => { e.stopPropagation(); onToggleVisibility(layer.id); }}
                >
                  {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <span className="layer-name" title={layer.name}>{layer.name}</span>
                <div className="layer-row-actions">
                  <button
                    type="button"
                    aria-label="Duplicate layer"
                    title="Duplicate"
                    onClick={e => { e.stopPropagation(); onDuplicate(layer.id); }}
                  ><Copy size={14} /></button>
                  <button
                    type="button"
                    aria-label="Delete layer"
                    title="Delete"
                    disabled={layers.length === 1}
                    onClick={e => { e.stopPropagation(); onDelete(layer.id); }}
                  ><Trash2 size={14} /></button>
                </div>
              </div>
            </li>
          );
        })}
        {insertIdx === layers.length && <div className="layer-insert-bar" />}
      </ul>

      <div className="layer-add">
        <span className="layer-add-label">Add layer</span>
        <div className="btn-group btn-group-vert">
          <button type="button" onClick={onAddBigText}><Plus size={14} /> Big Text</button>
          <button type="button" onClick={onAddText}><Plus size={14} /> Text</button>
          <button type="button" onClick={handleAddImageClick}><Plus size={14} /> Image</button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </aside>
  );
}
