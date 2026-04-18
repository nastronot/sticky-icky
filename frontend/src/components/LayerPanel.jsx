import { useRef, useState } from 'react';
import {
  Eye, EyeOff, Copy, Trash2, Plus,
  RotateCw, RotateCcw, FilePlus, Save, FolderOpen, Printer,
  Maximize2, Minimize2, Settings2, Square, Circle, Hexagon,
  Star, Minus, Pencil,
} from 'lucide-react';

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
  onAddShape,
  onToggleVisibility,
  onDelete,
  onDuplicate,
  onMoveLayerTo,
  // Global controls (moved here from LayerControls):
  presets,
  presetIdx,
  onPresetIdxChange,
  onEditPresets,
  customW,
  onCustomWChange,
  customH,
  onCustomHChange,
  viewportRotation,
  onToggleViewportRotation,
  trueSize,
  onToggleTrueSize,
  onOpenSettings,
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

  const preset = presets[presetIdx];

  return (
    <aside className="layer-panel">
      <div className="layer-panel-header">
        <span>Layers</span>
      </div>

      <div className="layer-stack-label top">Front</div>
      <ul
        className="layer-list"
        onDragOver={onListDragOver}
        onDrop={onDrop}
      >
        {/* Render in reverse so top-of-list = top-of-canvas-stack (front).
            The data model is unchanged: index 0 = back, last = front.
            Visual order: last layer first, first layer last. */}
        {[...layers].reverse().map((layer) => {
          const idx = layers.indexOf(layer);
          const selected = layer.id === selectedLayerId;
          const dragging = layer.id === dragId;
          return (
            <li key={layer.id} className="layer-row-wrap">
              {insertIdx === idx + 1 && <div className="layer-insert-bar" />}
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
        {insertIdx === 0 && <div className="layer-insert-bar" />}
      </ul>
      <div className="layer-stack-label bottom">Back</div>

      <div className="layer-add">
        <span className="layer-add-label">Add layer</span>
        <div className="btn-group btn-group-vert">
          <button type="button" onClick={onAddBigText}><Plus size={14} /> Big Text</button>
          <button type="button" onClick={onAddText}><Plus size={14} /> Text</button>
          <button type="button" onClick={handleAddImageClick}><Plus size={14} /> Image</button>
        </div>
        <div className="layer-add-shape-row">
          <button
            type="button"
            onClick={() => onAddShape('rectangle')}
            title="Rectangle"
            aria-label="Add rectangle"
          ><Square size={14} /></button>
          <button
            type="button"
            onClick={() => onAddShape('ellipse')}
            title="Ellipse"
            aria-label="Add ellipse"
          ><Circle size={14} /></button>
          <button
            type="button"
            onClick={() => onAddShape('polygon')}
            title="Polygon"
            aria-label="Add polygon"
          ><Hexagon size={14} /></button>
          <button
            type="button"
            onClick={() => onAddShape('star')}
            title="Star"
            aria-label="Add star"
          ><Star size={14} /></button>
          <button
            type="button"
            onClick={() => onAddShape('line')}
            title="Line"
            aria-label="Add line"
          ><Minus size={14} /></button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>

      <div className="layer-panel-globals">
        <div className="control-group">
          <span>Label size</span>
          <div className="label-size-row">
            <select value={presetIdx} onChange={e => onPresetIdxChange(Number(e.target.value))}>
              {presets.map((p, i) => (
                <option key={`${p.label}-${i}`} value={i}>{p.label}</option>
              ))}
            </select>
            <button
              type="button"
              className="label-size-edit"
              onClick={onEditPresets}
              title="Edit label sizes"
              aria-label="Edit label sizes"
            ><Pencil size={14} /></button>
          </div>
        </div>

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
          <span>View</span>
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
            <button
              type="button"
              className={trueSize ? 'active' : ''}
              onClick={onToggleTrueSize}
              title={trueSize ? 'Fit to viewport' : 'True size'}
              aria-label={trueSize ? 'Fit to viewport' : 'True size'}
            >
              {trueSize ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              title="Settings"
              aria-label="Settings"
            >
              <Settings2 size={16} />
            </button>
          </div>
        </div>

        <div className="control-group">
          <span>File</span>
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
        </div>
        {saveStatus === 'saved' && <p className="status ok">Saved.</p>}
        {saveStatus && typeof saveStatus === 'object' && (
          <p className="status error">Save failed: {saveStatus.error}</p>
        )}

        <div className="control-group">
          <span>Print</span>
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
        </div>
        {printStatus === 'ok' && <p className="status ok">Sent to printer.</p>}
        {printStatus && typeof printStatus === 'object' && (
          <p className="status error">Error: {printStatus.error}</p>
        )}
      </div>
    </aside>
  );
}
