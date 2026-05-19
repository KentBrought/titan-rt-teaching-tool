/**
 * Utility functions for loading and parsing PDS4 geo cube files
 * Geo cubes contain 9 layers (bands) of geospatial data
 * Layers: 0=lat, 1=lon, 2=xres, 3=yres, 4=phase, 5=incidence, 6=emis, 7=azimuth, 8=distance
 */

import { resolveRtAssetFolder } from './imageLoader';

const geoCubeCache = new Map();

export const GEO_CUBE_BANDS = 9;
export const GEO_CUBE_LINES = 681;
export const GEO_CUBE_SAMPLES = 681;
export const GEO_CUBE_FLOAT32_BYTES = GEO_CUBE_BANDS * GEO_CUBE_LINES * GEO_CUBE_SAMPLES * 4;

/** Shared geo when RT-folder cube is missing or wrong size. */
export const GEO_CUBE_PUBLIC_BASE = '/assets/dt/vims_geo';

async function fetchArrayBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.arrayBuffer();
}

/**
 * Load raw geo cube bytes. Prefers `*_geo.img` in the resolved RT asset folder when it matches
 * the float32 cube size (same layout as `vims_geo`); otherwise uses `vims_geo`.
 */
export async function loadGeoCubeFile(phaseAngle, opts = {}) {
  const paddedPhase = String(Math.round(phaseAngle)).padStart(3, '0');
  const filename = `2012_A0.1_p${paddedPhase}_geo.img`;
  const { hazeFolder, albedo = 0.1, compositeType = '5_2_1.3' } = opts;

  const isUsableCube = (buf) => buf && buf.byteLength >= GEO_CUBE_FLOAT32_BYTES;

  let buffer = null;
  if (hazeFolder) {
    const folder = resolveRtAssetFolder(hazeFolder, albedo, compositeType);
    const rtBuf = await fetchArrayBuffer(`/assets/dt/${folder}/${filename}`);
    if (isUsableCube(rtBuf)) {
      buffer = rtBuf;
    } else if (rtBuf) {
      console.warn(
        `[geo] Skipping /assets/dt/${folder}/${filename} (${rtBuf.byteLength} bytes); need >= ${GEO_CUBE_FLOAT32_BYTES} for float cube. Using ${GEO_CUBE_PUBLIC_BASE}.`
      );
    }
  }
  if (!buffer) {
    buffer = await fetchArrayBuffer(`${GEO_CUBE_PUBLIC_BASE}/${filename}`);
  }
  if (!isUsableCube(buffer)) {
    const err = new Error(`Failed to load geo cube: ${filename}`);
    console.error(err.message);
    throw err;
  }
  return buffer;
}

export function clearGeoCubeCache() {
  geoCubeCache.clear();
}

/**
 * Geo cubes on disk: only `public/assets/dt/vims_geo/*_geo.img` ship in this repo; per-haze folders hold
 * composites only (`readme.txt`: *_geo are backplanes). {@link loadGeoCubeFile} therefore always ends up
 * reading `vims_geo` bytes for RT-aligned lat/lon at filename phase `p***`. Cache by phase only so every
 * haze scenario at the same slider shares identical geometry — matches the phase-labelled PNGs/`p***` grid.
 */
function geoCacheKey(phaseAngle, _geoLoadContext) {
  const p = Math.round(Number(phaseAngle));
  return `${p}|vims_geo`;
}

/**
 * Parse geo cube data from ArrayBuffer (uses first GEO_CUBE_FLOAT32_BYTES; ignores trailing padding).
 */
export const parseGeoCube = (buffer) => {
  const view = new DataView(buffer);
  const numBands = GEO_CUBE_BANDS;
  const numLines = GEO_CUBE_LINES;
  const numSamples = GEO_CUBE_SAMPLES;
  const totalElements = numBands * numLines * numSamples;
  const expectedBytes = totalElements * 4;
  if (buffer.byteLength < expectedBytes) {
    throw new Error(
      `Geo cube file too small (${buffer.byteLength} bytes; need at least ${expectedBytes}).`
    );
  }
  const data = new Float32Array(totalElements);
  for (let i = 0; i < totalElements; i++) {
    data[i] = view.getFloat32(i * 4, true);
  }
  return data;
};

export const getGeoValue = (geoCubeData, x, y, band) => {
  if (!geoCubeData || typeof geoCubeData.length !== 'number') {
    return null;
  }
  const numBands = GEO_CUBE_BANDS;
  const numLines = GEO_CUBE_LINES;
  const numSamples = GEO_CUBE_SAMPLES;

  const clampedX = Math.max(0, Math.min(Math.floor(x), numSamples - 1));
  const clampedY = Math.max(0, Math.min(Math.floor(y), numLines - 1));
  const clampedBand = Math.max(0, Math.min(Math.floor(band), numBands - 1));

  const index = clampedBand * numLines * numSamples + clampedY * numSamples + clampedX;

  if (index < 0 || index >= geoCubeData.length) {
    console.error(`Invalid index ${index} for array length ${geoCubeData.length}`);
    return null;
  }

  return geoCubeData[index];
};

const toFiniteOrNull = (value) => (Number.isFinite(value) ? value : null);

const toFiniteInRangeOrNull = (value, min, max) => {
  if (!Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
};

const normalizeLongitudeDeg = (lonDeg) => {
  if (!Number.isFinite(lonDeg)) return null;
  return ((((lonDeg + 180) % 360) + 360) % 360) - 180;
};

const estimateLatLonFromGrid = (geoData, x, y, maxRadius = 24) => {
  if (!geoData) return { lat: null, lon: null };
  const centerX = Math.max(0, Math.min(680, Math.round(x)));
  const centerY = Math.max(0, Math.min(680, Math.round(y)));

  for (let radius = 0; radius <= maxRadius; radius += 1) {
    let weightedLat = 0;
    let weightedLonCos = 0;
    let weightedLonSin = 0;
    let weightTotal = 0;

    const minX = Math.max(0, centerX - radius);
    const maxX = Math.min(680, centerX + radius);
    const minY = Math.max(0, centerY - radius);
    const maxY = Math.min(680, centerY + radius);

    for (let yy = minY; yy <= maxY; yy += 1) {
      for (let xx = minX; xx <= maxX; xx += 1) {
        const lat = toFiniteInRangeOrNull(getGeoValue(geoData, xx, yy, 0), -90, 90);
        const lonRaw = toFiniteInRangeOrNull(getGeoValue(geoData, xx, yy, 1), -360, 360);
        const lon = normalizeLongitudeDeg(lonRaw);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const dx = xx - centerX;
        const dy = yy - centerY;
        const distance = Math.sqrt((dx * dx) + (dy * dy));
        const w = 1 / (1 + distance);

        weightedLat += lat * w;
        const lonRad = lon * (Math.PI / 180);
        weightedLonCos += Math.cos(lonRad) * w;
        weightedLonSin += Math.sin(lonRad) * w;
        weightTotal += w;
      }
    }

    if (weightTotal > 0) {
      const lat = weightedLat / weightTotal;
      const lon = Math.atan2(weightedLonSin, weightedLonCos) * (180 / Math.PI);
      return {
        lat: toFiniteInRangeOrNull(lat, -90, 90),
        lon: toFiniteInRangeOrNull(normalizeLongitudeDeg(lon), -180, 180),
      };
    }
  }

  return { lat: null, lon: null };
};

/**
 * @param {number} phaseAngle
 * @param {object|null} [geoLoadContext] `{ hazeFolder, albedo?, compositeType? }`
 */
export const getGeoCubeData = async (phaseAngle, geoLoadContext = null) => {
  const cacheKey = geoCacheKey(phaseAngle, geoLoadContext);

  if (geoCubeCache.has(cacheKey)) {
    return geoCubeCache.get(cacheKey);
  }

  const buffer = await loadGeoCubeFile(phaseAngle, geoLoadContext || {});
  const geoData = parseGeoCube(buffer);

  geoCubeCache.set(cacheKey, geoData);

  return geoData;
};

export const extractGeoValues = async (phaseAngle, x, y, geoLoadContext = null) => {
  try {
    const geoData = await getGeoCubeData(phaseAngle, geoLoadContext);

    const rawLat = getGeoValue(geoData, x, y, 0);
    const rawLon = getGeoValue(geoData, x, y, 1);
    const rawPhase = getGeoValue(geoData, x, y, 4);
    const rawIncidence = getGeoValue(geoData, x, y, 5);
    const rawEmis = getGeoValue(geoData, x, y, 6);
    const rawAzimuth = getGeoValue(geoData, x, y, 7);

    const lat = toFiniteInRangeOrNull(rawLat, -90, 90);
    const lon = toFiniteInRangeOrNull(rawLon, -360, 360);
    const phase = toFiniteInRangeOrNull(rawPhase, 0, 360);
    const incidence = toFiniteInRangeOrNull(rawIncidence, 0, 180);
    const emis = toFiniteInRangeOrNull(rawEmis, 0, 180);
    const azimuth = toFiniteInRangeOrNull(rawAzimuth, -360, 360);
    const estimatedLatLon = (!Number.isFinite(lat) || !Number.isFinite(lon))
      ? estimateLatLonFromGrid(geoData, x, y)
      : { lat: null, lon: null };
    const resolvedLat = Number.isFinite(lat) ? lat : estimatedLatLon.lat;
    const resolvedLon = Number.isFinite(lon) ? lon : estimatedLatLon.lon;

    return {
      lat: resolvedLat,
      lon: resolvedLon,
      phase,
      incidence,
      emis,
      azimuth,
      x,
      y
    };
  } catch (error) {
    console.error('Error extracting geo values:', error);
    return {
      lat: null,
      lon: null,
      phase: toFiniteOrNull(phaseAngle),
      incidence: null,
      emis: null,
      azimuth: null,
      x,
      y,
      error: error.message
    };
  }
};
