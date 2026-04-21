let cached = null;

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

/**
 * Lookup material class at a clicked image pixel.
 * Maps image pixel coordinates (typically 681x681 IR image) into the material map grid.
 */
export function getMaterialClassAtPixel(materialMap, pixelX, pixelY, imageWidth = 681, imageHeight = 681) {
  if (!materialMap || !Number.isFinite(pixelX) || !Number.isFinite(pixelY)) return null;
  const { width: mw, height: mh, data } = materialMap;
  if (!mw || !mh || !data) return null;

  const x = Math.max(0, Math.min(imageWidth - 1, Math.floor(pixelX)));
  const y = Math.max(0, Math.min(imageHeight - 1, Math.floor(pixelY)));
  const mc = Math.min(mw - 1, Math.floor((x * mw) / imageWidth));
  const mr = Math.min(mh - 1, Math.floor((y * mh) / imageHeight));
  return data[mr * mw + mc];
}
