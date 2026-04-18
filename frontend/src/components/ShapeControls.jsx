import PatternPicker from './PatternPicker.jsx';

const DITHER_ALGOS = [
  { id: 'none',           label: 'None' },
  { id: 'bayer4',         label: 'Ordered (Bayer 4×4)' },
  { id: 'bayer8',         label: 'Ordered (Bayer 8×8)' },
  { id: 'floydSteinberg', label: 'Floyd-Steinberg' },
  { id: 'atkinson',       label: 'Atkinson' },
];

/**
 * Per-shape-layer controls. Handles the five shape kinds — rectangle,
 * ellipse, polygon, star, line — in one component so switching kinds
 * doesn't have to juggle component identity.
 *
 * Shared controls: pattern fill, invert, XOR, dithering. Bounding-box
 * kinds also get x/y/w/h/rotation; polygon adds sides; star adds points
 * + innerRadiusRatio; line replaces the position/rotation block with
 * endpoint coordinates + thickness.
 */
export default function ShapeControls({ layer, onChange }) {
  const set = (patch) => onChange(patch);
  const isLine = layer.shapeKind === 'line';

  return (
    <>
      <div className="control-group">
        <span>Shape</span>
        <div className="shape-kind-label">{kindLabel(layer.shapeKind)}</div>
      </div>

      {!isLine && (
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
              min={-180}
              max={180}
              step={1}
              value={layer.rotation}
              onChange={e => set({ rotation: Number(e.target.value) })}
            />
          </label>
        </>
      )}

      {layer.shapeKind === 'polygon' && (
        <label className="control-group">
          <span>Sides <em>{layer.sides ?? 6}</em></span>
          <input
            type="range"
            min={3}
            max={12}
            step={1}
            value={layer.sides ?? 6}
            onChange={e => set({ sides: Number(e.target.value) })}
          />
        </label>
      )}

      {layer.shapeKind === 'star' && (
        <>
          <label className="control-group">
            <span>Points <em>{layer.points ?? 5}</em></span>
            <input
              type="range"
              min={3}
              max={12}
              step={1}
              value={layer.points ?? 5}
              onChange={e => set({ points: Number(e.target.value) })}
            />
          </label>
          <label className="control-group">
            <span>Pointiness <em>{(layer.innerRadiusRatio ?? 0.4).toFixed(2)}</em></span>
            <input
              type="range"
              min={0.2}
              max={0.8}
              step={0.01}
              value={layer.innerRadiusRatio ?? 0.4}
              onChange={e => set({ innerRadiusRatio: Number(e.target.value) })}
            />
          </label>
        </>
      )}

      {isLine && (
        <>
          <div className="control-group custom-size">
            <label>
              <span>X1</span>
              <input
                type="number"
                value={Math.round(layer.x1)}
                onChange={e => set({ x1: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Y1</span>
              <input
                type="number"
                value={Math.round(layer.y1)}
                onChange={e => set({ y1: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="control-group custom-size">
            <label>
              <span>X2</span>
              <input
                type="number"
                value={Math.round(layer.x2)}
                onChange={e => set({ x2: Number(e.target.value) })}
              />
            </label>
            <label>
              <span>Y2</span>
              <input
                type="number"
                value={Math.round(layer.y2)}
                onChange={e => set({ y2: Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="control-group">
            <span>Thickness <em>{layer.thickness ?? 2}</em></span>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={layer.thickness ?? 2}
              onChange={e => set({ thickness: Number(e.target.value) })}
            />
          </label>
        </>
      )}

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

function kindLabel(kind) {
  switch (kind) {
    case 'rectangle': return 'Rectangle';
    case 'ellipse':   return 'Ellipse';
    case 'polygon':   return 'Polygon';
    case 'star':      return 'Star';
    case 'line':      return 'Line';
    default:          return 'Shape';
  }
}
