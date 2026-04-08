import BigTextControls from './BigTextControls.jsx';
import ImageControls from './ImageControls.jsx';
import TextControls from './TextControls.jsx';

const PRESETS = [
  { label: '3.00 × 2.00"', w: 570, h: 406 },
  { label: '4.00 × 2.00"', w: 832, h: 406 },
  { label: '4.00 × 3.00"', w: 832, h: 609 },
  { label: '2.25 × 2.00"', w: 457, h: 406 },
  { label: '2.25 × 1.25"', w: 457, h: 254 },
  { label: 'Custom', w: null, h: null },
];

/**
 * Left sidebar. Top half: per-layer controls dispatched on layer.type.
 * Bottom half: global label / print settings + the print button.
 */
export default function LayerControls({
  selectedLayer,
  onLayerChange,
  focusTextNonce,
  presetIdx,
  onPresetIdxChange,
  customW,
  onCustomWChange,
  customH,
  onCustomHChange,
  onPrint,
  printStatus,
  copies,
  onCopiesChange,
  onSave,
  saveStatus,
  onOpenGallery,
  onNew,
}) {
  const preset = PRESETS[presetIdx];

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

      <div className="layer-controls-globals">
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

        <div className="btn-group">
          <button type="button" className="secondary-btn" onClick={onNew}>New</button>
          <button type="button" className="secondary-btn" onClick={onSave}>Save</button>
          <button type="button" className="secondary-btn" onClick={onOpenGallery}>Load</button>
        </div>
        {saveStatus === 'saved' && <p className="status ok">Saved.</p>}
        {saveStatus && typeof saveStatus === 'object' && (
          <p className="status error">Save failed: {saveStatus.error}</p>
        )}

        <div className="print-row">
          <button className="print-btn" onClick={onPrint} disabled={printStatus === 'printing'}>
            {printStatus === 'printing'
              ? (copies > 1 ? `Printing ${copies} copies…` : 'Printing…')
              : 'Print'}
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
    </aside>
  );
}

export { PRESETS };
