/**
 * Build a stable public asset URL that works with PUBLIC_URL values like:
 * - ''
 * - '/'
 * - '/subpath'
 * - 'https://example.com/subpath'
 */
let cachedRuntimeBase = null;

function stripTrailingSlash(value) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function normalizeBase(value) {
  if (!value) return '';
  return stripTrailingSlash(value);
}

function detectRuntimePublicBase() {
  if (cachedRuntimeBase !== null) return cachedRuntimeBase;
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    cachedRuntimeBase = '';
    return cachedRuntimeBase;
  }

  const scripts = Array.from(document.getElementsByTagName('script'));
  for (let i = scripts.length - 1; i >= 0; i -= 1) {
    const srcAttr = scripts[i]?.getAttribute('src') || '';
    const marker = '/static/js/';
    const markerIndex = srcAttr.indexOf(marker);
    if (markerIndex === -1) continue;

    let base = srcAttr.slice(0, markerIndex);
    if (/^https?:\/\//i.test(base) && base.startsWith(window.location.origin)) {
      base = base.slice(window.location.origin.length);
    }
    if (base && !base.startsWith('/')) {
      base = `/${base}`;
    }
    cachedRuntimeBase = normalizeBase(base);
    return cachedRuntimeBase;
  }

  cachedRuntimeBase = '';
  return cachedRuntimeBase;
}

export function getRuntimePublicBase() {
  const rawBase = typeof process !== 'undefined' ? (process.env.PUBLIC_URL || '') : '';
  return normalizeBase(rawBase) || detectRuntimePublicBase();
}

export function resolveRuntimeAssetUrl(url) {
  if (!url || typeof url !== 'string') return url;
  if (/^(https?:)?\/\//i.test(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  const base = getRuntimePublicBase();
  if (!base) return url;
  if (url.startsWith(base + '/')) return url;
  if (url.startsWith('/')) return `${base}${url}`;
  return `${base}/${url}`;
}

export function getPublicAssetUrl(path) {
  const base = getRuntimePublicBase();
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
