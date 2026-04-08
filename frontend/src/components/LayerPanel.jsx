import { useRef } from 'react';

/**
 * Right-sidebar layer list. Big Text and Image are addable; plain Text is
 * still a placeholder for a future phase.
 */
export default function LayerPanel({
  layers,
  selectedLayerId,
  onSelect,
  onAddBigText,
  onAddImage,
  onToggleVisibility,
  onDelete,
  onMoveUp,
  onMoveDown,
}) {
  const fileInputRef = useRef(null);
  const handleAddImageClick = () => fileInputRef.current?.click();
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) onAddImage(file);
    e.target.value = ''; // allow re-selecting the same file
  };
  return (
    <aside className="layer-panel">
      <div className="layer-panel-header">
        <span>Layers</span>
      </div>

      <ul className="layer-list">
        {layers.map((layer, idx) => {
          const selected = layer.id === selectedLayerId;
          return (
            <li
              key={layer.id}
              className={`layer-row ${selected ? 'selected' : ''}`}
              onClick={() => onSelect(layer.id)}
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
                  aria-label="Move layer up"
                  disabled={idx === 0}
                  onClick={e => { e.stopPropagation(); onMoveUp(layer.id); }}
                >▲</button>
                <button
                  type="button"
                  aria-label="Move layer down"
                  disabled={idx === layers.length - 1}
                  onClick={e => { e.stopPropagation(); onMoveDown(layer.id); }}
                >▼</button>
                <button
                  type="button"
                  aria-label="Delete layer"
                  disabled={layers.length === 1}
                  onClick={e => { e.stopPropagation(); onDelete(layer.id); }}
                >✕</button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="layer-add">
        <span className="layer-add-label">Add layer</span>
        <div className="btn-group btn-group-vert">
          <button type="button" onClick={onAddBigText}>Big Text</button>
          <button type="button" disabled title="Coming soon">Text</button>
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
