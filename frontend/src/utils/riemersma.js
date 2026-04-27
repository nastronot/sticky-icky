// Riemersma dithering — error diffusion that walks pixels along a Hilbert
// space-filling curve instead of in row-major order, with a sliding window of
// past errors. Compared to Floyd/Atkinson the noise pattern is isotropic
// (no diagonal grain, no row banding) because consecutive pixels along the
// curve are spatially adjacent in 2-D, not strung in a horizontal line.
//
// Reference: Thiadmer Riemersma, "A Balanced Dithering Technique" — see
// https://www.compuphase.com/riemer.htm for the original write-up. We use
// his recommended defaults (window N=16, ratio=16) verbatim — these aren't
// exposed to the user.
//
// Vanilla Hilbert curves only cover 2ⁿ × 2ⁿ grids, so for arbitrary image
// dimensions we pad to the next power of 2 and skip out-of-bounds steps in
// the walk. The end-of-curve underflow (the last few pixels along the curve
// have no forward neighbours to receive their error) creates a faint corner
// artifact; we accept it.

const N = 16;          // window length
const RATIO = 16;      // newest weight / oldest weight

// Pre-compute weights once. weights[i] = ratio^(i / (N-1)) so that
// weights[0] = 1 (oldest) and weights[N-1] = ratio (newest).
const WEIGHTS = (() => {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    w[i] = Math.pow(RATIO, i / (N - 1));
  }
  return w;
})();
const WEIGHT_SUM = WEIGHTS.reduce((a, b) => a + b, 0);

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Iterate the Hilbert curve over an `order × order` grid, calling `visit(x, y)`
 * for each cell in curve order. `order` must be a power of 2.
 *
 * Implementation derived from the standard d2xy algorithm (see
 * https://en.wikipedia.org/wiki/Hilbert_curve). Iterative, allocation-free.
 */
function hilbertWalk(order, visit) {
  const total = order * order;
  for (let d = 0; d < total; d++) {
    let rx, ry, t = d;
    let x = 0, y = 0;
    for (let s = 1; s < order; s <<= 1) {
      rx = 1 & (t >> 1);
      ry = 1 & (t ^ rx);
      if (ry === 0) {
        if (rx === 1) {
          x = s - 1 - x;
          y = s - 1 - y;
        }
        const tmp = x;
        x = y;
        y = tmp;
      }
      x += s * rx;
      y += s * ry;
      t >>= 2;
    }
    visit(x, y);
  }
}

/**
 * In-place Riemersma dither on a grayscale Float32 buffer.
 *
 * - `buf`: Float32Array of length width*height, values in [0, 255]. After
 *   the call each entry is either 0 or 255.
 * - `cutoff`: scalar threshold in the same scale as `buf`. Pixels at or above
 *   it round to 255, below to 0. Pass 128 for the default 50% behaviour;
 *   when gamma correction is on, pass the linearised cutoff.
 * - `amount`: 0..1 scales how much accumulated error is folded back into
 *   each new pixel. amount=0 collapses to a pure threshold; amount=1 is
 *   full Riemersma.
 *
 * Out-of-bounds positions on the Hilbert curve (when width/height aren't
 * a power of 2) are skipped — the curve still threads contiguous in-bounds
 * pixels, and the ring buffer carries error across the gaps which is fine
 * since the gaps are along the padded right/bottom strip and don't matter
 * to the visible image.
 */
export function riemersmaDither(buf, width, height, cutoff, amount) {
  const order = nextPow2(Math.max(width, height));
  const ring = new Float32Array(N);   // circular buffer of recent errors
  let head = 0;                       // index of the OLDEST entry
  // After insertion the new error overwrites position `head`, then `head` advances.
  // Reading "in chronological order" therefore means starting at the new head
  // and walking forward, so the value just inserted becomes the newest weight.

  hilbertWalk(order, (x, y) => {
    if (x >= width || y >= height) return;
    const idx = y * width + x;

    // Accumulate weighted past errors. WEIGHTS is indexed so that the most
    // recent error gets the largest weight; ring[head] is the oldest entry,
    // and the loop walks forward from there to the newest.
    let correction = 0;
    for (let i = 0; i < N; i++) {
      correction += ring[(head + i) % N] * WEIGHTS[i];
    }
    correction = (correction / WEIGHT_SUM) * amount;

    const adjusted = buf[idx] + correction;
    const out = adjusted >= cutoff ? 255 : 0;
    buf[idx] = out;

    // Push the new error at the slot the oldest entry occupied, then
    // advance `head` so the freshly-written value becomes the newest.
    ring[head] = adjusted - out;
    head = (head + 1) % N;
  });
}
