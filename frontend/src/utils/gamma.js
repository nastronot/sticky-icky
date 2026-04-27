// sRGB ↔ linear conversion. Canvas ImageData is sRGB-encoded, so a byte value
// of 128 represents ~22% linear luminance, not 50%. Threshold/dither math run
// on raw sRGB bytes pushes the perceptual cutoff into the shadows and skews
// dithered midtones bright. When gamma correction is enabled at the studio
// level the grayscale step routes through SRGB_TO_LINEAR_LUT before any
// comparison/diffusion, so 128 means "perceptual mid-grey" everywhere.
//
// One 256-entry LUT, computed once at module load. Output is rescaled back
// to a 0..255 byte so the rest of the pipeline keeps using byte arithmetic
// (Float32Array buffers, integer thresholds, etc.) without rewriting every
// algorithm to operate on floats.

function srgbToLinearFloat(s) {
  const x = s / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
}

export const SRGB_TO_LINEAR_LUT = (() => {
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(srgbToLinearFloat(i) * 255);
  }
  return lut;
})();

/** Convenience wrapper: returns the LUT when `enabled`, else identity. */
export function gammaLUT(enabled) {
  return enabled ? SRGB_TO_LINEAR_LUT : null;
}
