import { useMemo } from 'react';
import { Star, Trash2, X } from 'lucide-react';

/**
 * Saved-design gallery overlay. Shows favorites first, then most-recent.
 * Click a card to load it; the small star toggles favorite; the small ✕
 * deletes (with a confirm). Click the backdrop or the Close button to
 * dismiss without loading.
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
            {sorted.map(design => (
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
      </div>
    </div>
  );
}
