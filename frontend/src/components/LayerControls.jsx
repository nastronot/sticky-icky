import BigTextControls from './BigTextControls.jsx';
import ImageControls from './ImageControls.jsx';
import TextControls from './TextControls.jsx';

/**
 * Left sidebar. Renders only the per-layer controls for the currently
 * selected layer; the global label / print / save / load section now
 * lives in the right sidebar (LayerPanel).
 */
export default function LayerControls({
  selectedLayer,
  onLayerChange,
  focusTextNonce,
}) {
  return (
    <aside className="layer-controls">
      <div className="layer-controls-scroll">
        {selectedLayer?.type === 'bigtext' && (
          <BigTextControls layer={selectedLayer} onChange={onLayerChange} focusTextNonce={focusTextNonce} />
        )}
        {selectedLayer?.type === 'text' && (
          <TextControls layer={selectedLayer} onChange={onLayerChange} focusTextNonce={focusTextNonce} />
        )}
        {selectedLayer?.type === 'image' && (
          <ImageControls layer={selectedLayer} onChange={onLayerChange} />
        )}
        {!selectedLayer && (
          <p className="empty-hint">Select a layer to edit its properties.</p>
        )}
      </div>
    </aside>
  );
}
