import { useEffect, useRef, useState } from 'react';

const DITHER_ALGOS = [
  { id: 'none',           label: 'None' },
  { id: 'bayer4',         label: 'Ordered (Bayer 4×4)' },
  { id: 'bayer8',         label: 'Ordered (Bayer 8×8)' },
  { id: 'floydSteinberg', label: 'Floyd-Steinberg' },
  { id: 'atkinson',       label: 'Atkinson' },
];

/** Per-image-layer controls. `onChange(patch)` patches the layer in App. */
export default function ImageControls({ layer, onChange }) {
  const [lockAspect, setLockAspect] = useState(true);
  const set = patch => onChange(patch);
  const aspect = layer.naturalW / layer.naturalH;

  const onWidthChange = (w) => {
    if (lockAspect) set({ width: w, height: Math.round(w / aspect) });
    else set({ width: w });
  };
  const onHeightChange = (h) => {
    if (lockAspect) set({ height: h, width: Math.round(h * aspect) });
    else set({ height: h });
  };

  // Render a small thumbnail of the original image once per layer.
  const thumbRef = useRef(null);
  useEffect(() => {
    const c = thumbRef.current;
    if (!c || !layer.originalImage) return;
    const tmp = document.createElement('canvas');
    tmp.width = layer.originalImage.width;
    tmp.height = layer.originalImage.height;
    tmp.getContext('2d').putImageData(layer.originalImage, 0, 0);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, c.width, c.height);
    const scale = Math.min(c.width / tmp.width, c.height / tmp.height);
    const dw = tmp.width * scale;
    const dh = tmp.height * scale;
    ctx.drawImage(tmp, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
  }, [layer.id, layer.originalImage]);

  return (
    <>
      <div className="control-group">
        <span>Image</span>
        <canvas ref={thumbRef} width={148} height={84} className="image-thumb" />
      </div>

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
            onChange={e => onWidthChange(Number(e.target.value))}
          />
        </label>
        <label>
          <span>H</span>
          <input
            type="number"
            min={1}
            value={Math.round(layer.height)}
            onChange={e => onHeightChange(Number(e.target.value))}
          />
        </label>
      </div>

      <div className="control-group">
        <span>Aspect</span>
        <div className="btn-group">
          <button
            className={lockAspect ? 'active' : ''}
            onClick={() => setLockAspect(true)}
          >Lock</button>
          <button
            className={!lockAspect ? 'active' : ''}
            onClick={() => setLockAspect(false)}
          >Free</button>
        </div>
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
        <span>Threshold <em>{layer.threshold}</em></span>
        <input
          type="range"
          min={0}
          max={255}
          step={1}
          value={layer.threshold}
          onChange={e => set({ threshold: Number(e.target.value) })}
        />
      </label>

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
