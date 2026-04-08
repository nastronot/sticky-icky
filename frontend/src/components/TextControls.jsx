const FONTS = ['Arial Black', 'Impact', 'Courier New', 'Georgia'];

const DITHER_ALGOS = [
  { id: 'none',           label: 'None' },
  { id: 'bayer4',         label: 'Ordered (Bayer 4×4)' },
  { id: 'bayer8',         label: 'Ordered (Bayer 8×8)' },
  { id: 'floydSteinberg', label: 'Floyd-Steinberg' },
  { id: 'atkinson',       label: 'Atkinson' },
];

/** Per-free-text-layer controls. `onChange(patch)` patches the layer in App.
 *  Bounding-box width/height auto-correct from CanvasPreview after the next
 *  render-pass measures the text — they aren't edited from here. */
export default function TextControls({ layer, onChange }) {
  const set = patch => onChange(patch);

  return (
    <>
      <label className="control-group">
        <span>Text</span>
        <textarea
          value={layer.text}
          onChange={e => set({ text: e.target.value })}
          placeholder="Type something..."
          rows={3}
        />
      </label>

      <label className="control-group">
        <span>Font</span>
        <select value={layer.font} onChange={e => set({ font: e.target.value })}>
          {FONTS.map(f => (
            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
          ))}
        </select>
      </label>

      <div className="control-group">
        <span>Weight</span>
        <div className="btn-group">
          <button className={layer.bold ? 'active' : ''} onClick={() => set({ bold: true })}>Bold</button>
          <button className={!layer.bold ? 'active' : ''} onClick={() => set({ bold: false })}>Regular</button>
        </div>
      </div>

      <div className="control-group">
        <span>Style</span>
        <div className="btn-group">
          <button
            className={layer.italic ? 'active' : ''}
            onClick={() => set({ italic: !layer.italic })}
          >Italic</button>
        </div>
      </div>

      <label className="control-group">
        <span>Font size <em>{Math.round(layer.fontSize)}px</em></span>
        <input
          type="number"
          min={4}
          max={1000}
          step={1}
          value={Math.round(layer.fontSize)}
          onChange={e => set({ fontSize: Number(e.target.value) })}
        />
      </label>

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

      <div className="control-group">
        <span>Flip</span>
        <div className="btn-group">
          <button
            className={layer.flipH ? 'active' : ''}
            onClick={() => set({ flipH: !layer.flipH })}
          >Horizontal</button>
          <button
            className={layer.flipV ? 'active' : ''}
            onClick={() => set({ flipV: !layer.flipV })}
          >Vertical</button>
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
