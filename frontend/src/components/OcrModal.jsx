import { useEffect, useRef, useState } from 'react';
import { X, Upload, ScanText } from 'lucide-react';
import { recognizeAddress } from '../utils/ocr.js';
import { setOcrModalOpen } from '../utils/ocrModalState.js';

/**
 * OCR-an-image-into-the-address-textarea modal.
 *
 * Three input paths: drag-and-drop, paste-from-clipboard (document-level
 * listener active only while the modal is open), and a file-picker
 * fallback. Whichever fires first wins; subsequent inputs are ignored.
 *
 * On success, calls onResult(linesText) where linesText is "\n"-joined
 * trimmed non-empty lines, capped at the layer's max-lines limit by the
 * OCR utility. The caller is responsible for closing the modal in
 * onResult — we leave that policy to the caller so the address textarea
 * patch happens before the modal unmounts.
 *
 * Props:
 *   onCancel()
 *   onResult(text)   — called with the OCR'd text on success
 *   maxLines = 7
 */
export default function OcrModal({ onCancel, onResult, maxLines = 7 }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  // Hold while-mounted: tells App.jsx's paste handler to bail so the same
  // clipboard image isn't simultaneously added as an Image layer.
  useEffect(() => {
    setOcrModalOpen(true);
    return () => setOcrModalOpen(false);
  }, []);

  const runOcr = async (source) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setStatus('Loading OCR engine…');
    try {
      const lines = await recognizeAddress(source, {
        maxLines,
        onProgress: (m) => {
          if (m?.status) {
            const pct = typeof m.progress === 'number' ? ` ${Math.round(m.progress * 100)}%` : '';
            setStatus(`${m.status}${pct}`);
          }
        },
      });
      if (lines.length === 0) {
        setError('No text detected in the image.');
        setBusy(false);
        return;
      }
      onResult(lines.join('\n'));
    } catch (e) {
      console.error('OCR error', e);
      setError(e?.message ?? 'OCR failed. Check the console for details.');
      setBusy(false);
    }
  };

  const onDragEnter = (e) => {
    e.preventDefault();
    if (busy) return;
    dragCounterRef.current += 1;
    setDragActive(true);
  };
  const onDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setDragActive(false);
    }
  };
  const onDragOver = (e) => { e.preventDefault(); };
  const onDrop = (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragActive(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) runOcr(file);
    else setError('That file is not an image.');
  };

  // Document-level paste while the modal is open. Mirrors App.jsx's
  // clipboard handler but routes the image to OCR instead of layer-add.
  useEffect(() => {
    const onPaste = (e) => {
      if (busy) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type?.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            runOcr(blob);
            return;
          }
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
    // runOcr closes over busy via state, but we want a single listener — the
    // busy-guard inside the handler reads the latest value through the
    // setter closure. Re-binding on every busy change is safe but
    // unnecessary; intentionally leaving deps empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Esc to close (only when not actively OCR'ing — don't let the user
  // strand the worker mid-recognition).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) {
        e.preventDefault();
        onCancel();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget && !busy) onCancel();
  };

  const onFilePick = (e) => {
    const file = e.target.files?.[0];
    if (file) runOcr(file);
  };

  return (
    <div className="cal-backdrop" onClick={onBackdropClick}>
      <div className="cal-panel ocr-modal-panel">
        <div className="cal-header">
          <h2><ScanText size={18} style={{ verticalAlign: '-3px', marginRight: 6 }} />OCR address from image</h2>
          <button
            type="button"
            className="cal-close"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div className="ocr-modal-body">
          <div
            className={`ocr-dropzone ${dragActive ? 'active' : ''} ${busy ? 'busy' : ''}`}
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {busy ? (
              <>
                <div className="ocr-spinner" aria-hidden="true" />
                <div className="ocr-status-line">{status || 'Processing…'}</div>
                <div className="ocr-status-sub">First run downloads the engine — please wait.</div>
              </>
            ) : (
              <>
                <Upload size={32} aria-hidden="true" />
                <div className="ocr-dropzone-headline">Drag an image here</div>
                <div className="ocr-dropzone-sub">or paste from clipboard, or choose a file</div>
                <button
                  type="button"
                  className="cal-btn"
                  onClick={() => fileInputRef.current?.click()}
                >Choose image…</button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onFilePick}
                  style={{ display: 'none' }}
                />
              </>
            )}
          </div>

          {error && <div className="ocr-error">{error}</div>}

          <div className="ocr-modal-note">
            <strong>First use downloads ~12&nbsp;MB</strong> of OCR assets — the
            WebAssembly engine plus language data for English, German,
            Chinese (Simplified and Traditional), Japanese, and Russian.
            They're cached in the browser after that; subsequent OCRs are quick.
            All recognition runs locally; nothing is sent to an external
            service.
          </div>
        </div>

        <div className="cal-actions">
          <button
            type="button"
            className="cal-btn"
            onClick={onCancel}
            disabled={busy}
          >Cancel</button>
        </div>
      </div>
    </div>
  );
}
