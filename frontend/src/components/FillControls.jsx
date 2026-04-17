import PatternPicker from './PatternPicker.jsx';

const DITHER_ALGOS = [
  { id: 'none',           label: 'None' },
  { id: 'bayer4',         label: 'Ordered (Bayer 4×4)' },
  { id: 'bayer8',         label: 'Ordered (Bayer 8×8)' },
  { id: 'floydSteinberg', label: 'Floyd-Steinberg' },
  { id: 'atkinson',       label: 'Atkinson' },
];

/** Per-fill-layer controls. Position / size / rotation / flip / invert /
 *  XOR / dithering — same shape as image and text layers, just no font or
 *  image-specific options. */
export default function FillControls({ layer, onChange }) {
  const set = patch => onChange(patch);

  return (
    <>
      <div className="control-group custom-size">
        <label>
          <span>X</span>
          <input
            type="number"
            value={Math.round(layer.x)}
            onChange={e => set({ x: Number(e.target.value) })}
          />
        </label>
        <label>
          <span>Y</span>
          <input
            type="number"
            value={Math.round(layer.y)}
            onChange={e => set({ y: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="control-group custom-size">
        <label>
          <span>W</span>
          <input
            type="number"
            min={1}
            value={Math.round(layer.width)}
            onChange={e => set({ width: Number(e.target.value) })}
          />
        </label>
        <label>
          <span>H</span>
          <input
            type="number"
            min={1}
            value={Math.round(layer.height)}
            onChange={e => set({ height: Number(e.target.value) })}
          />
        </label>
      </div>

      <label className="control-group">
        <span>Rotation <em>{Math.round(layer.rotation)}°</em></span>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={layer.rotation}
          onChange={e => set({ rotation: Number(e.target.value) })}
        />
      </label>

      <PatternPicker
        value={layer.fillPattern}
        onChange={v => set({ fillPattern: v })}
      />

      <div className="control-group">
        <span>Invert</span>
        <div className="btn-group">
          <button
            className={layer.invert ? 'active' : ''}
            onClick={() => set({ invert: !layer.invert })}
          >{layer.invert ? 'On' : 'Off'}</button>
        </div>
      </div>

      <div className="control-group">
        <span>XOR composite</span>
        <div className="btn-group">
          <button
            className={layer.xor !== false ? 'active' : ''}
            onClick={() => set({ xor: layer.xor === false })}
          >{layer.xor !== false ? 'On' : 'Off'}</button>
        </div>
      </div>

      <label className="control-group">
        <span>Dithering</span>
        <select value={layer.ditherAlgo} onChange={e => set({ ditherAlgo: e.target.value })}>
          {DITHER_ALGOS.map(a => (
            <option key={a.id} value={a.id}>{a.label}</option>
          ))}
        </select>
      </label>

      {layer.ditherAlgo !== 'none' && (
        <label className="control-group">
          <span>Amount <em>{layer.ditherAmount}%</em></span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={layer.ditherAmount}
            onChange={e => set({ ditherAmount: Number(e.target.value) })}
          />
        </label>
      )}
    </>
  );
}
