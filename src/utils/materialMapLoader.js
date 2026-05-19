let cached = null;

/**
 * `material_albedo_map.txt` is equirectangular but its longitude origin does not match the
 * `*_geo.img` west/east registration used for lookups: sampling with raw cube lon systematically
 * mis-places columns (bright IR vs Tholin/ice labels). +180° aligns map columns with cube lon on
 * regression checks against the RT disk. Set to 0 if the source map is re-exported to match geo.
 */
export const MATERIAL_MAP_LON_SHIFT_DEG = 180;

export async function loadMaterialAlbedoMap() {
  if (cached) return cached;
  const res = await fetch('/data/material_albedo_map.txt');
  if (!res.ok) throw new Error('Failed to load material map');
  const text = await res.text();
  const lines = text.trim().split(/\n/);
  const height = lines.length;
  const width = lines[0].trim().split(/\s+/).length;
  const data = new Uint8Array(width * height);
  let o = 0;
  for (let r = 0; r < height; r++) {
    const vals = lines[r].trim().split(/\s+/);
    for (let c = 0; c < width; c++) {
      data[o++] = Math.round(Number(vals[c]));
    }
  }
  cached = { width, height, data };
  return cached;
}

/** Reference map classes for IR surface branch vs spectrum library albedo (0, 0.1, 0.2). */
export const SURFACE_MATERIAL_LABELS = {
  0: 'Tholin',
  1: 'Water ice',
  2: 'Water ice–tholin mix',
};

/**
 * One distinct sRGB color per class for teaching (Surface units disk + optional material overlay).
 * Index equals material class 0–2. Not physical reflectance — avoids brown/orange pairs that read as one surface.
 */
export const SURFACE_CLASS_RGB = Object.freeze([
  [255, 90, 90],
  [90, 220, 120],
  [100, 160, 255],
]);

export function getSurfaceMaterialLabel(materialClass) {
  if (!Number.isFinite(materialClass)) return '';
  if (Object.prototype.hasOwnProperty.call(SURFACE_MATERIAL_LABELS, materialClass)) {
    return SURFACE_MATERIAL_LABELS[materialClass];
  }
  return `Class ${materialClass}`;
}

/** Line for geo panel: composition name + spectrum albedo used from the library. */
export function formatSurfaceMaterialWithSpectrumAlbedo(materialClass, surfaceAlbedo) {
  const name = getSurfaceMaterialLabel(materialClass);
  if (!name) return '';
  if (Number.isFinite(surfaceAlbedo)) {
    return `${name} (spectrum albedo ${surfaceAlbedo})`;
  }
  return name;
}

/**
 * Convert map class (0/1/2) to library albedo key used by spectral data.
 */
export function mapMaterialClassToSpectralAlbedo(materialClass) {
  if (materialClass === 0) return 0;
  if (materialClass === 1) return 0.1;
  if (materialClass === 2) return 0.2;
  return 0.1;
}

function wrapLongitudeDeg180(lonDeg) {
  return ((((lonDeg + 180) % 360) + 360) % 360) - 180;
}

/**
 * Sample the global 3-class surface map at planetographic lat/lon (plate carrée grid).
 * Row 0 = +90° latitude. Longitude: after {@link MATERIAL_MAP_LON_SHIFT_DEG}, column 0 = −180°
 * (see file header comment — the raw ASCII grid is not registered to geo lon without this shift).
 */
export function getMaterialClassAtLatLon(materialMap, latDeg, lonDeg) {
  if (!materialMap || !Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return null;
  const { width: mw, height: mh, data } = materialMap;
  if (!mw || !mh || !data) return null;

  const lat = Math.max(-90, Math.min(90, latDeg));
  const lonWrapped = wrapLongitudeDeg180(lonDeg + MATERIAL_MAP_LON_SHIFT_DEG);

  const mr = Math.min(mh - 1, Math.max(0, Math.floor(((90 - lat) / 180) * mh)));
  const mc = Math.min(mw - 1, Math.max(0, Math.floor(((lonWrapped + 180) / 360) * mw)));
  return data[mr * mw + mc];
}

/**
 * Same grid as {@link getMaterialClassAtLatLon}, but uses a (2r+1)² majority vote so small
 * lat/lon / grid jitter does not flip the class at unit boundaries — stable “one color region → one unit”.
 */
export function getMaterialClassAtLatLonMajority(materialMap, latDeg, lonDeg, radius = 1) {
  if (!materialMap || !Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return null;
  const { width: mw, height: mh, data } = materialMap;
  if (!mw || !mh || !data) return null;

  const lat = Math.max(-90, Math.min(90, latDeg));
  const lonWrapped = wrapLongitudeDeg180(lonDeg + MATERIAL_MAP_LON_SHIFT_DEG);

  const mr0 = Math.min(mh - 1, Math.max(0, Math.floor(((90 - lat) / 180) * mh)));
  const mc0 = Math.min(mw - 1, Math.max(0, Math.floor(((lonWrapped + 180) / 360) * mw)));

  const r = Math.max(0, Math.min(4, Math.floor(Number(radius)) || 1));
  const counts = [0, 0, 0];
  for (let dr = -r; dr <= r; dr += 1) {
    for (let dc = -r; dc <= r; dc += 1) {
      const mr = Math.min(mh - 1, Math.max(0, mr0 + dr));
      const mc = Math.min(mw - 1, Math.max(0, mc0 + dc));
      const v = data[mr * mw + mc];
      if (v === 0 || v === 1 || v === 2) counts[v] += 1;
    }
  }

  const center = data[mr0 * mw + mc0];
  let bestN = -1;
  const ties = [];
  for (let v = 0; v < 3; v += 1) {
    if (counts[v] > bestN) {
      bestN = counts[v];
      ties.length = 0;
      ties.push(v);
    } else if (counts[v] === bestN) {
      ties.push(v);
    }
  }
  if (ties.length === 0) return null;
  if (ties.length === 1) return ties[0];
  if (ties.includes(center)) return center;
  return ties[0];
}
