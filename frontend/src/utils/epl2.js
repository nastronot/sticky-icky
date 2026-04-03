/**
 * Encode a dithered RGBA image as an EPL2 GW command.
 *
 * @param {Uint8ClampedArray} imageData - RGBA pixel data (Canvas ImageData.data)
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @returns {Uint8Array} Complete GW command bytes (header + bitmap)
 */
export function encodeGW(imageData, width, height) {
  const paddedWidth = Math.ceil(width / 8) * 8;
  const widthBytes = paddedWidth / 8;

  const header = new TextEncoder().encode(
    `GW0,0,${widthBytes},${height}\r\n`
  );

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

  const result = new Uint8Array(header.length + bitmap.length);
  result.set(header, 0);
  result.set(bitmap, header.length);
  return result;
}
