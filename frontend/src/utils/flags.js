import usFlagUrl from '../assets/flags/us.svg?url';

/** ISO 3166-1 alpha-2 → SVG asset URL. Drop additional flags into
 *  src/assets/flags/<code>.svg and add an entry here to register them. The
 *  source SVG should be black-on-white; the renderer inverts at draw time so
 *  the flag reads as white-on-black on the banner. */
const FLAG_URLS = {
  US: usFlagUrl,
};

// Cache the in-flight Promise per code so concurrent calls reuse one load.
const flagImageCache = new Map();

/** Extract the ISO country code from a Postcrossing ID like "US-123456789".
 *  Returns null when the ID is missing or doesn't match the prefix pattern. */
export function parseCountryCode(postcrossingId) {
  if (!postcrossingId) return null;
  const m = postcrossingId.trim().match(/^([A-Za-z]{2})-/);
  return m ? m[1].toUpperCase() : null;
}

/** Resolve the flag image for an ISO code. Returns null for unknown codes or
 *  when the SVG fails to load — callers should treat that as "skip the flag,
 *  just render the ID". */
export function getFlagImage(code) {
  if (!code) return Promise.resolve(null);
  const url = FLAG_URLS[code];
  if (!url) return Promise.resolve(null);
  const cached = flagImageCache.get(code);
  if (cached) return cached;
  const img = new Image();
  const promise = new Promise(resolve => {
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
  img.src = url;
  flagImageCache.set(code, promise);
  return promise;
}
