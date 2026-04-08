import BigTextControls from './BigTextControls.jsx';

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
  presetIdx,
  onPresetIdxChange,
  customW,
  onCustomWChange,
  customH,
  onCustomHChange,
  darkness,
  onDarknessChange,
  speed,
  onSpeedChange,
  onPrint,
  printStatus,
}) {
  const preset = PRESETS[presetIdx];

  return (
    <aside className="layer-controls">
      <div className="layer-controls-scroll">
        {selectedLayer?.type === 'bigtext' && (
          <BigTextControls layer={selectedLayer} onChange={onLayerChange} />
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

        <label className="control-group">
          <span>Darkness <em>{darkness}</em></span>
          <input
            type="range"
            min={0}
            max={15}
            step={1}
            value={darkness}
            onChange={e => onDarknessChange(Number(e.target.value))}
          />
        </label>

        <label className="control-group">
          <span>Speed <em>{speed}</em></span>
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={speed}
            onChange={e => onSpeedChange(Number(e.target.value))}
          />
        </label>

        <button className="print-btn" onClick={onPrint} disabled={printStatus === 'printing'}>
          {printStatus === 'printing' ? 'Printing…' : 'Print'}
        </button>

        {printStatus === 'ok' && <p className="status ok">Sent to printer.</p>}
        {printStatus && typeof printStatus === 'object' && (
          <p className="status error">Error: {printStatus.error}</p>
        )}
      </div>
    </aside>
  );
}

export { PRESETS };
