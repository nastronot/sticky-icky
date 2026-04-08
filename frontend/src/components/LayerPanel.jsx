import { useRef, useState } from 'react';

/** Right-sidebar layer list. All three layer types (Big Text, Text, Image)
 *  are addable. Reordering is done via HTML5 drag-and-drop on the rows. */
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

  return (
    <aside className="layer-panel">
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
                  {layer.visible ? '●' : '○'}
                </button>
                <span className="layer-name" title={layer.name}>{layer.name}</span>
                <div className="layer-row-actions">
                  <button
                    type="button"
                    aria-label="Duplicate layer"
                    title="Duplicate"
                    onClick={e => { e.stopPropagation(); onDuplicate(layer.id); }}
                  >⧉</button>
                  <button
                    type="button"
                    aria-label="Delete layer"
                    title="Delete"
                    disabled={layers.length === 1}
                    onClick={e => { e.stopPropagation(); onDelete(layer.id); }}
                  >✕</button>
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
          <button type="button" onClick={onAddBigText}>Big Text</button>
          <button type="button" onClick={onAddText}>Text</button>
          <button type="button" onClick={handleAddImageClick}>Image</button>
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
