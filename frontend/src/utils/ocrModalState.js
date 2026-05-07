// Module-level open flag for the OCR modal. App.jsx's document-level
// paste-image handler reads this to skip its "create Image layer" branch
// while the OCR modal is open — otherwise pasting an image into the modal
// would also drop it onto the canvas as a new layer.

let _open = false;

export function setOcrModalOpen(open) {
  _open = !!open;
}

export function isOcrModalOpen() {
  return _open;
}
