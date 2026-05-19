import { getGeoCubeData } from './geoCubeLoader';
import { buildMaterialClassDiskMap } from './materialDiskProjector';

/**
 * Added (mod 360) to the RT/composite filename phase before loading `vims_geo` for basemap / surface-unit disks.
 * **0** → same `p***` as the RT image. **340** with RT **p000** → `p340_geo` (your boundary test). For **p180** RT
 * with **p340** geo use **160** instead ((180 + 160) % 360 = 340).
 */
export const MATERIAL_GEO_CUBE_PHASE_OFFSET_DEG = 340;

/** Geo filename phase (0–359) used to build the basemap class disk for a given RT/composite `p***` phase. */
export function materialDiskGeoPhaseFromRtFilenamePhase(rtPhaseDeg) {
  const p = Math.round(Number(rtPhaseDeg));
  const x = (p + MATERIAL_GEO_CUBE_PHASE_OFFSET_DEG) % 360;
  return x < 0 ? x + 360 : x;
}

/**
 * Basemap disk geometry matches shared {@link geoCubeLoader} `vims_geo` cubes only (no per-haze *_geo.img
 * in-tree). Do not key by haze folder — same phase ⇒ same 681×681 lat/lon grid for every RT composite.
 */
function cacheKey(phaseAssetDeg, materialMap, opts = {}) {
  if (!materialMap?.width || !materialMap?.height) return null;
  const p = Math.round(Number(phaseAssetDeg));
  const exact = opts.geoFilenamePhaseIsExact === true;
  const tag = exact ? `raw${p}` : `rt${p}`;
  return `${tag}_${materialMap.width}x${materialMap.height}_goff${MATERIAL_GEO_CUBE_PHASE_OFFSET_DEG}_vims_geo`;
}

const diskMapCache = new Map();
const inflight = new Map();

export function clearMaterialDiskClassCache() {
  diskMapCache.clear();
  inflight.clear();
}

/**
 * @param {object} [opts]
 * @param {object|null} [opts.geoLoadContext]
 * @param {boolean} [opts.geoFilenamePhaseIsExact] If true, `phaseAssetDeg` is the geo filename index (no RT→geo offset).
 */
async function ensureDiskMap(phaseAssetDeg, materialMap, opts = {}) {
  const { geoLoadContext = null, geoFilenamePhaseIsExact = false } = opts;
  const key = cacheKey(phaseAssetDeg, materialMap, opts);
  if (!key) return null;
  if (diskMapCache.has(key)) return diskMapCache.get(key);
  let pending = inflight.get(key);
  if (!pending) {
    pending = (async () => {
      const geoPhaseDeg = geoFilenamePhaseIsExact
        ? Math.round(Number(phaseAssetDeg))
        : materialDiskGeoPhaseFromRtFilenamePhase(phaseAssetDeg);
      const geo = await getGeoCubeData(geoPhaseDeg, geoLoadContext);
      const disk = buildMaterialClassDiskMap(geo, materialMap);
      diskMapCache.set(key, disk);
      inflight.delete(key);
      return disk;
    })();
    inflight.set(key, pending);
  }
  return pending;
}

/**
 * Same 681×681 smoothed class grid as the Surface units PNG ({@link buildMaterialClassDiskMap}).
 * @param {number} phaseAssetDeg RT/composite filename phase (e.g. 15–180) unless `geoFilenamePhaseIsExact`.
 * @param {object} [opts]
 * @param {boolean} [opts.geoFilenamePhaseIsExact] Load `p###_geo` matching this number exactly (debug only).
 */
export async function getMaterialClassDiskMap(phaseAssetDeg, materialMap, opts = {}) {
  return ensureDiskMap(phaseAssetDeg, materialMap, opts);
}

export async function warmMaterialDiskClassCache(phaseAssetDeg, materialMap, opts = {}) {
  await ensureDiskMap(phaseAssetDeg, materialMap, opts);
}

export async function getSmoothedMaterialClassAtDiskPixel(phaseAssetDeg, materialMap, x, y, opts = {}) {
  const disk = await ensureDiskMap(phaseAssetDeg, materialMap, opts);
  if (!disk?.data) return null;
  const xi = Math.max(0, Math.min(680, Math.floor(x)));
  const yi = Math.max(0, Math.min(680, Math.floor(y)));
  const v = disk.data[yi * disk.width + xi];
  if (v === 0 || v === 1 || v === 2) return v;
  return null;
}

export function getCachedSmoothedMaterialClassAtDiskPixel(phaseAssetDeg, materialMap, x, y, opts = {}) {
  const { geoLoadContext = null, geoFilenamePhaseIsExact = false } = opts;
  const key = cacheKey(phaseAssetDeg, materialMap, { geoLoadContext, geoFilenamePhaseIsExact });
  if (!key) return null;
  const disk = diskMapCache.get(key);
  if (!disk?.data) return null;
  const xi = Math.max(0, Math.min(680, Math.floor(x)));
  const yi = Math.max(0, Math.min(680, Math.floor(y)));
  const v = disk.data[yi * disk.width + xi];
  if (v === 0 || v === 1 || v === 2) return v;
  return null;
}
