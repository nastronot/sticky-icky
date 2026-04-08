import { useCallback, useEffect, useRef } from 'react';

const DITHER_ALGOS = [
  { id: 'none',           label: 'None' },
  { id: 'bayer4',         label: 'Ordered (Bayer 4×4)' },
  { id: 'bayer8',         label: 'Ordered (Bayer 8×8)' },
  { id: 'floydSteinberg', label: 'Floyd-Steinberg' },
  { id: 'atkinson',       label: 'Atkinson' },
];

/** Per-image-layer controls. `onChange(patch)` patches the layer in App. */
export default function ImageControls({ layer, onChange }) {
  // Aspect lock lives on the layer itself so the canvas resize handles
  // (in CanvasPreview) and the sidebar W/H inputs share one source of truth.
  const lockAspect = layer.lockAspect ?? false;
  const set = useCallback((patch) => onChange(patch), [onChange]);

  // The aspect ratio is taken from the original imported image's natural
  // dimensions, not the current displayed width/height — so repeatedly
  // resizing while locked never compounds rounding error.
  const originalWidth  = layer.originalImage?.width  ?? layer.naturalW ?? 1;
  const originalHeight = layer.originalImage?.height ?? layer.naturalH ?? 1;

  const onWidthChange = useCallback((newW) => {
    if (lockAspect) {
      const newH = newW * (originalHeight / originalWidth);
      onChange({ width: newW, height: Math.round(newH) });
    } else {
      onChange({ width: newW });
    }
  }, [lockAspect, onChange, originalWidth, originalHeight]);

  const onHeightChange = useCallback((newH) => {
    if (lockAspect) {
      const newW = newH * (originalWidth / originalHeight);
      onChange({ height: newH, width: Math.round(newW) });
    } else {
      onChange({ height: newH });
    }
  }, [lockAspect, onChange, originalWidth, originalHeight]);

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
            onClick={() => set({ lockAspect: true })}
          >Lock</button>
          <button
            className={!lockAspect ? 'active' : ''}
            onClick={() => set({ lockAspect: false })}
          >Free</button>
          <button
            onClick={() => set({
              height: Math.round(layer.width * (originalHeight / originalWidth)),
            })}
            title="Snap back to the original image's aspect ratio (height follows current width)"
          >Reset</button>
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
        <span>Brightness <em>{layer.threshold}</em></span>
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
