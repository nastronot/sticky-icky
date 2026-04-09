import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Star, Trash2, X } from 'lucide-react';

const PAGE_SIZE = 9;

function formatBytes(bytes) {
  if (bytes == null) return '?';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Saved-design gallery overlay. 3×3 grid with pagination, favourites first
 * then most-recent. Footer shows the current page indicator and the
 * IndexedDB usage / quota via navigator.storage.estimate().
 */
export default function Gallery({ designs, onLoad, onDelete, onToggleFavorite, onClose }) {
  const sorted = useMemo(() => {
    const copy = designs.slice();
    copy.sort((a, b) => {
      if (!!a.favorite !== !!b.favorite) return a.favorite ? -1 : 1;
      return (b.savedAt ?? '').localeCompare(a.savedAt ?? '');
    });
    return copy;
  }, [designs]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const [currentPage, setCurrentPage] = useState(0);

  // Clamp the current page if a delete drops us past the end (e.g. deleting
  // the last design on page 3 should bump us back to page 2).
  useEffect(() => {
    if (currentPage >= totalPages) setCurrentPage(totalPages - 1);
    if (currentPage < 0) setCurrentPage(0);
  }, [currentPage, totalPages]);

  const pageStart = currentPage * PAGE_SIZE;
  const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE);

  // Storage usage info from the StorageManager API. Re-queries when the
  // designs array changes (i.e. after a save / delete) so the displayed
  // number stays roughly current.
  const [storageInfo, setStorageInfo] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!navigator.storage?.estimate) {
      setStorageInfo(null);
      return;
    }
    navigator.storage.estimate().then((est) => {
      if (!cancelled) setStorageInfo(est);
    }).catch(() => {
      if (!cancelled) setStorageInfo(null);
    });
    return () => { cancelled = true; };
  }, [designs]);

  const onBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div className="gallery-backdrop" onClick={onBackdropClick}>
      <div className="gallery">
        <div className="gallery-header">
          <h2>Saved designs</h2>
          <button type="button" className="gallery-close" onClick={onClose} aria-label="Close gallery">
            <X size={16} />
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="gallery-empty">No saved designs yet. Use Save in the left sidebar.</p>
        ) : (
          <div className="gallery-grid">
            {pageItems.map(design => (
              <div key={design.id} className="gallery-card" onClick={() => onLoad(design)}>
                <div className="gallery-card-thumb">
                  {design.thumbnail
                    ? <img src={design.thumbnail} alt={design.name} draggable={false} />
                    : <div className="gallery-card-placeholder">no preview</div>}
                </div>
                <div className="gallery-card-meta">
                  <div className="gallery-card-name" title={design.name}>{design.name}</div>
                  <div className="gallery-card-date">
                    {design.savedAt ? new Date(design.savedAt).toLocaleString() : ''}
                  </div>
                </div>
                <button
                  type="button"
                  className={`gallery-card-fav ${design.favorite ? 'on' : ''}`}
                  aria-label={design.favorite ? 'Unfavorite' : 'Favorite'}
                  onClick={e => { e.stopPropagation(); onToggleFavorite(design.id); }}
                >
                  <Star size={14} fill={design.favorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  type="button"
                  className="gallery-card-del"
                  aria-label="Delete design"
                  onClick={e => {
                    e.stopPropagation();
                    if (window.confirm(`Delete "${design.name}"?`)) onDelete(design.id);
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="gallery-footer">
          <div className="gallery-storage">
            {storageInfo
              ? `Storage: ${formatBytes(storageInfo.usage)} / ${formatBytes(storageInfo.quota)}`
              : 'Storage: —'}
          </div>
          <div className="gallery-pager">
            <button
              type="button"
              className="gallery-page-btn"
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage <= 0}
              aria-label="Previous page"
            ><ChevronLeft size={16} /></button>
            <span className="gallery-page-indicator">
              Page {Math.min(currentPage + 1, totalPages)} of {totalPages}
            </span>
            <button
              type="button"
              className="gallery-page-btn"
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              aria-label="Next page"
            ><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}
