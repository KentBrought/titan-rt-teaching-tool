/**
 * Build a stable public asset URL that works with PUBLIC_URL values like:
 * - ''
 * - '/'
 * - '/subpath'
 * - 'https://example.com/subpath'
 */
export function getPublicAssetUrl(path) {
  const rawBase = typeof process !== 'undefined' ? (process.env.PUBLIC_URL || '') : '';
  const base = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

