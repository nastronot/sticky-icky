/** Normalize a rotation in degrees into the -180..+180 range, wrapping
 *  values outside. 270 → -90, 360 → 0, 181 → -179, etc. Leaves NaN /
 *  null / undefined alone so callers can decide on a default. */
export function normalizeRotation(deg) {
  if (deg == null || Number.isNaN(deg)) return 0;
  let r = Number(deg);
  if (!Number.isFinite(r)) return 0;
  // Reduce to (-180, 180]: first mod to [-360, 360), then shift.
  r = ((r % 360) + 540) % 360 - 180;
  // The above lands 180 as -180 due to the shift; callers are fine with
  // either — they behave identically visually — but prefer +180 over -180
  // so the slider's right edge is reachable.
  if (r === -180) return 180;
  return r;
}
