/**
 * Build a weighted phase globe texture: map image pixels to lat/lon with
 * incidence/emission/phase weighting (downweight limb/terminator), blend where overlapping.
 * Supports single-phase or all phase angles into one sphere.
 */
import { getGeoCubeData, getGeoValue } from './geoCubeLoader';
import { getImageUrl, getAvailablePhaseAngles } from './imageLoader';

const NUM_SAMPLES = 681;
const NUM_LINES = 681;
const OUT_HEIGHT = 1024;
const OUT_WIDTH = 2 * OUT_HEIGHT; // 2:1 equirectangular
const BACKGROUND_R = 0x1a;
const BACKGROUND_G = 0x1a;
const BACKGROUND_B = 0x2e;

const DEG2RAD = Math.PI / 180;

function isValidLatLon(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  // Exclude common PDS fill values
  if (Math.abs(lat) > 1e6 || Math.abs(lon) > 1e6) return false;
  if (lat < -90 || lat > 90) return false;
  if (lon < -180 || lon > 360) return false;
  return true;
}

/**
 * Compute pixel weight from incidence, emission, and phase (downweight limb/terminator).
 * @param {number} incDeg - Incidence angle (degrees)
 * @param {number} emisDeg - Emission angle (degrees)
 * @param {number} phaseDeg - Phase angle (degrees)
 * @returns {number} Weight in [0, 1]
 */
function pixelWeight(incDeg, emisDeg, phaseDeg) {
  const inc = Number.isFinite(incDeg) ? incDeg : 90;
  const emis = Number.isFinite(emisDeg) ? emisDeg : 90;
  const phase = Number.isFinite(phaseDeg) ? phaseDeg : 90;
  const incRad = Math.min(90, Math.max(0, inc)) * DEG2RAD;
  const emisRad = Math.min(90, Math.max(0, emis)) * DEG2RAD;
  const phaseRad = Math.min(180, Math.max(0, phase)) * DEG2RAD;
  const cosInc = Math.cos(incRad);
  const cosEmis = Math.cos(emisRad);
  // Phase factor: max at 90°, lower at 0° and 180° (terminator)
  const phaseFactor = Math.sin(phaseRad);
  const w = cosInc * cosEmis * phaseFactor;
  return Math.max(0, Math.min(1, w));
}

/**
 * Compute lat/lon coverage statistics from GEO cube data.
 * @param {Float32Array} geoData - Parsed geo cube (9 bands, 681x681)
 * @returns {{ validCount: number, totalPixels: number, minLat: number, maxLat: number, minLon: number, maxLon: number, fullGlobe: boolean, summary: string }}
 */
export function computeCoverageStats(geoData) {
  const totalPixels = NUM_SAMPLES * NUM_LINES;
  let validCount = 0;
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLon = Infinity;
  let maxLon = -Infinity;

  for (let y = 0; y < NUM_LINES; y++) {
    for (let x = 0; x < NUM_SAMPLES; x++) {
      const lat = getGeoValue(geoData, x, y, 0);
      const lon = getGeoValue(geoData, x, y, 1);
      if (!isValidLatLon(lat, lon)) continue;
      validCount++;
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
    }
  }

  const latSpan = validCount > 0 ? maxLat - minLat : 0;
  const lonSpan = validCount > 0 ? maxLon - minLon : 0;
  const fullGlobe =
    validCount > 0 &&
    latSpan >= 179 &&
    (lonSpan >= 359 || (minLon <= -179 && maxLon >= 179));

  const summary =
    validCount === 0
      ? 'No valid lat/lon data.'
      : `Lat: ${minLat.toFixed(1)}° to ${maxLat.toFixed(1)}°, Lon: ${minLon.toFixed(1)}° to ${maxLon.toFixed(1)}°. Valid pixels: ${validCount} of ${totalPixels}. Full globe: ${fullGlobe ? 'Yes' : 'No'}.`;

  return {
    validCount,
    totalPixels,
    minLat: validCount > 0 ? minLat : null,
    maxLat: validCount > 0 ? maxLat : null,
    minLon: validCount > 0 ? minLon : null,
    maxLon: validCount > 0 ? maxLon : null,
    fullGlobe,
    summary,
  };
}

/**
 * Load image and return ImageData (RGB from canvas).
 * @param {string} imageUrl
 * @returns {Promise<{ data: Uint8ClampedArray, width: number, height: number }>}
 */
function loadImagePixels(imageUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get 2d context'));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      resolve({
        data: imageData.data,
        width: w,
        height: h,
      });
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    img.src = imageUrl;
  });
}

/**
 * Build weighted phase globe texture and coverage stats.
 * Pixels are placed only where GEO lat/lon exist; incidence/emission/phase downweight limb/terminator; overlap is blended.
 * @param {number} phaseAngle - Phase angle in degrees
 * @param {string} compositeType - e.g. '5_2_1.3'
 * @returns {Promise<{ canvas: HTMLCanvasElement, coverage: ReturnType<computeCoverageStats> }>}
 */
export async function buildWeightedPhaseGlobeTexture(phaseAngle, compositeType) {
  const [geoData, pixels] = await Promise.all([
    getGeoCubeData(phaseAngle),
    loadImagePixels(getImageUrl(phaseAngle, compositeType)),
  ]);

  const coverage = computeCoverageStats(geoData);

  const outW = OUT_WIDTH;
  const outH = OUT_HEIGHT;
  const size = outW * outH;
  const sumR = new Float32Array(size);
  const sumG = new Float32Array(size);
  const sumB = new Float32Array(size);
  const sumW = new Float32Array(size);

  const srcW = pixels.width;
  const srcH = pixels.height;
  const srcData = pixels.data;

  for (let y = 0; y < NUM_LINES; y++) {
    for (let x = 0; x < NUM_SAMPLES; x++) {
      const lat = getGeoValue(geoData, x, y, 0);
      const lon = getGeoValue(geoData, x, y, 1);
      if (!isValidLatLon(lat, lon)) continue;

      const inc = getGeoValue(geoData, x, y, 5);
      const emis = getGeoValue(geoData, x, y, 6);
      const phase = getGeoValue(geoData, x, y, 4);
      const w = pixelWeight(inc, emis, phase);
      if (w <= 0) continue;

      const sx = Math.min(x, srcW - 1);
      const sy = Math.min(y, srcH - 1);
      const idx = (sy * srcW + sx) * 4;
      const R = srcData[idx];
      const G = srcData[idx + 1];
      const B = srcData[idx + 2];

      const u = (lon + 180) / 360;
      const v = (lat + 90) / 180; // lat negative = North; v=0 top = North pole
      const i = Math.min(outW - 1, Math.max(0, Math.floor(u * outW)));
      const j = Math.min(outH - 1, Math.max(0, Math.floor(v * outH)));
      const outIdx = j * outW + i;

      sumR[outIdx] += R * w;
      sumG[outIdx] += G * w;
      sumB[outIdx] += B * w;
      sumW[outIdx] += w;
    }
  }

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas 2d context');
  const outImageData = ctx.createImageData(outW, outH);
  const outData = outImageData.data;

  for (let j = 0; j < outH; j++) {
    for (let i = 0; i < outW; i++) {
      const outIdx = (j * outW + i) * 4;
      const w = sumW[j * outW + i];
      if (w > 0) {
        outData[outIdx] = Math.round(sumR[j * outW + i] / w);
        outData[outIdx + 1] = Math.round(sumG[j * outW + i] / w);
        outData[outIdx + 2] = Math.round(sumB[j * outW + i] / w);
        outData[outIdx + 3] = 255;
      } else {
        outData[outIdx] = BACKGROUND_R;
        outData[outIdx + 1] = BACKGROUND_G;
        outData[outIdx + 2] = BACKGROUND_B;
        outData[outIdx + 3] = 255;
      }
    }
  }

  ctx.putImageData(outImageData, 0, 0);
  return { canvas, coverage };
}

/**
 * Accumulate one phase's pixels into the global grid (mutates sumR, sumG, sumB, sumW).
 * Updates coverageAgg in place (min/max lat/lon, validCount).
 */
function accumulatePhaseIntoGrid(geoData, pixels, sumR, sumG, sumB, sumW, coverageAgg) {
  const srcW = pixels.width;
  const srcH = pixels.height;
  const srcData = pixels.data;
  const outW = OUT_WIDTH;
  const outH = OUT_HEIGHT;

  for (let y = 0; y < NUM_LINES; y++) {
    for (let x = 0; x < NUM_SAMPLES; x++) {
      const lat = getGeoValue(geoData, x, y, 0);
      const lon = getGeoValue(geoData, x, y, 1);
      if (!isValidLatLon(lat, lon)) continue;

      const inc = getGeoValue(geoData, x, y, 5);
      const emis = getGeoValue(geoData, x, y, 6);
      const phase = getGeoValue(geoData, x, y, 4);
      const w = pixelWeight(inc, emis, phase);
      if (w <= 0) continue;

      if (coverageAgg) {
        coverageAgg.validCount += 1;
        coverageAgg.minLat = Math.min(coverageAgg.minLat, lat);
        coverageAgg.maxLat = Math.max(coverageAgg.maxLat, lat);
        coverageAgg.minLon = Math.min(coverageAgg.minLon, lon);
        coverageAgg.maxLon = Math.max(coverageAgg.maxLon, lon);
      }

      const sx = Math.min(x, srcW - 1);
      const sy = Math.min(y, srcH - 1);
      const idx = (sy * srcW + sx) * 4;
      const R = srcData[idx];
      const G = srcData[idx + 1];
      const B = srcData[idx + 2];

      const u = (lon + 180) / 360;
      const v = (lat + 90) / 180;
      const i = Math.min(outW - 1, Math.max(0, Math.floor(u * outW)));
      const j = Math.min(outH - 1, Math.max(0, Math.floor(v * outH)));
      const outIdx = j * outW + i;

      sumR[outIdx] += R * w;
      sumG[outIdx] += G * w;
      sumB[outIdx] += B * w;
      sumW[outIdx] += w;
    }
  }
}

/**
 * Build one canvas from accumulation buffers and optional aggregated coverage.
 */
function canvasFromAccumulation(sumR, sumG, sumB, sumW, coverageAgg) {
  const outW = OUT_WIDTH;
  const outH = OUT_HEIGHT;
  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas 2d context');
  const outImageData = ctx.createImageData(outW, outH);
  const outData = outImageData.data;

  for (let j = 0; j < outH; j++) {
    for (let i = 0; i < outW; i++) {
      const outIdx = (j * outW + i) * 4;
      const w = sumW[j * outW + i];
      if (w > 0) {
        outData[outIdx] = Math.round(sumR[j * outW + i] / w);
        outData[outIdx + 1] = Math.round(sumG[j * outW + i] / w);
        outData[outIdx + 2] = Math.round(sumB[j * outW + i] / w);
        outData[outIdx + 3] = 255;
      } else {
        outData[outIdx] = BACKGROUND_R;
        outData[outIdx + 1] = BACKGROUND_G;
        outData[outIdx + 2] = BACKGROUND_B;
        outData[outIdx + 3] = 255;
      }
    }
  }

  ctx.putImageData(outImageData, 0, 0);

  let coverage = null;
  if (coverageAgg && coverageAgg.validCount > 0) {
    const latSpan = coverageAgg.maxLat - coverageAgg.minLat;
    const lonSpan = coverageAgg.maxLon - coverageAgg.minLon;
    const fullGlobe =
      latSpan >= 179 &&
      (lonSpan >= 359 || (coverageAgg.minLon <= -179 && coverageAgg.maxLon >= 179));
    const totalPixels = coverageAgg.phaseCount * NUM_SAMPLES * NUM_LINES;
    coverage = {
      ...coverageAgg,
      fullGlobe,
      totalPixels,
      summary: `All phases: Lat ${coverageAgg.minLat.toFixed(1)}° to ${coverageAgg.maxLat.toFixed(1)}°, Lon ${coverageAgg.minLon.toFixed(1)}° to ${coverageAgg.maxLon.toFixed(1)}°. Valid contributions: ${coverageAgg.validCount}. Full globe: ${fullGlobe ? 'Yes' : 'No'}.`,
    };
  }

  return { canvas, coverage };
}

/**
 * Build a single sphere texture using data from all available phase angles.
 * Each phase's pixels are mapped to lat/lon with the same weight (incidence, emission, phase);
 * contributions from all phases accumulate into one equirectangular grid and blend where they overlap.
 * @param {string} compositeType - e.g. '5_2_1.3'
 * @param {{ onProgress?: (current: number, total: number, phaseAngle: number) => void }} options
 * @returns {Promise<{ canvas: HTMLCanvasElement, coverage: object | null }>}
 */
export async function buildWeightedPhaseGlobeTextureAllPhases(compositeType, options = {}) {
  const { onProgress } = options;
  const phaseAngles = getAvailablePhaseAngles();
  const total = phaseAngles.length;

  const outW = OUT_WIDTH;
  const outH = OUT_HEIGHT;
  const size = outW * outH;
  const sumR = new Float32Array(size);
  const sumG = new Float32Array(size);
  const sumB = new Float32Array(size);
  const sumW = new Float32Array(size);

  const coverageAgg = {
    validCount: 0,
    minLat: Infinity,
    maxLat: -Infinity,
    minLon: Infinity,
    maxLon: -Infinity,
    phaseCount: total,
  };

  for (let p = 0; p < total; p++) {
    const phaseAngle = phaseAngles[p];
    if (typeof onProgress === 'function') {
      onProgress(p + 1, total, phaseAngle);
    }

    let geoData;
    let pixels;
    try {
      [geoData, pixels] = await Promise.all([
        getGeoCubeData(phaseAngle),
        loadImagePixels(getImageUrl(phaseAngle, compositeType)),
      ]);
    } catch (err) {
      console.warn(`Skipping phase ${phaseAngle}°: ${err.message}`);
      continue;
    }

    accumulatePhaseIntoGrid(geoData, pixels, sumR, sumG, sumB, sumW, coverageAgg);
  }

  return canvasFromAccumulation(sumR, sumG, sumB, sumW, coverageAgg);
}
