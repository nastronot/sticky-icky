/**
 * Pack RGBA image data to 1bpp row-major bitmap and return a JSON-ready
 * payload for the LO-based print endpoint.
 *
 * @param {Uint8ClampedArray} imageData - RGBA pixel data (Canvas ImageData.data)
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {number} labelW - Label width in dots (for EPL2 q command)
 * @param {number} labelH - Label height in dots (for EPL2 Q command)
 * @returns {{ bitmap: string, width: number, height: number, labelW: number, labelH: number }}
 */
export function encodePrintPayload(imageData, width, height, labelW, labelH) {
  const paddedWidth = Math.ceil(width / 8) * 8;
  const widthBytes = paddedWidth / 8;

  const bitmap = new Uint8Array(widthBytes * height);

  for (let row = 0; row < height; row++) {
    for (let byteIndex = 0; byteIndex < widthBytes; byteIndex++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const col = byteIndex * 8 + bit;
        if (col < width) {
          const pixelIndex = (row * width + col) * 4;
          if (imageData[pixelIndex] < 128) {
            byte |= 0x80 >> bit;
          }
        }
        // padded columns beyond width remain 0 (white)
      }
      bitmap[row * widthBytes + byteIndex] = byte;
    }
  }

  // Convert to base64
  let binary = '';
  for (let i = 0; i < bitmap.length; i++) {
    binary += String.fromCharCode(bitmap[i]);
  }
  const base64 = btoa(binary);

  return { bitmap: base64, width: paddedWidth, height, labelW, labelH };
}
