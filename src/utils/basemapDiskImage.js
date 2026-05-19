import { getMaterialClassDiskMap } from './materialDiskClassCache';
import { SURFACE_CLASS_RGB } from './materialMapLoader';

const DISK = 681;

/**
 * 681×681 PNG object URL: basemap classes via {@link buildMaterialClassDiskMap}, teaching colors.
 * @param {string|null} _compositePngUrl - unused (API compat)
 * @param {object} opts - materialMap, phaseAssetDeg, geoLoadContext
 */
export async function createSurfaceUnitsDiskFromIrPngUrl(_compositePngUrl, opts = {}) {
  const { materialMap = null, phaseAssetDeg = null, geoLoadContext = null } = opts;
  if (!materialMap?.width || !materialMap?.height || !Number.isFinite(phaseAssetDeg) || !geoLoadContext) {
    return null;
  }
  let disk;
  try {
    disk = await getMaterialClassDiskMap(phaseAssetDeg, materialMap, { geoLoadContext });
  } catch {
    return null;
  }
  if (!disk?.data) return null;

  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = DISK;
    canvas.height = DISK;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      resolve(null);
      return;
    }
    const out = ctx.createImageData(DISK, DISK);
    const od = out.data;
    const d = disk.data;
    for (let i = 0; i < DISK * DISK; i += 1) {
      const cls = d[i];
      const j = i * 4;
      if (cls === 0 || cls === 1 || cls === 2) {
        const rgb = SURFACE_CLASS_RGB[cls];
        od[j] = rgb[0];
        od[j + 1] = rgb[1];
        od[j + 2] = rgb[2];
        od[j + 3] = 255;
      } else {
        od[j] = 0;
        od[j + 1] = 0;
        od[j + 2] = 0;
        od[j + 3] = 255;
      }
    }
    ctx.putImageData(out, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}
