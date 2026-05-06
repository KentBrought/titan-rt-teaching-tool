/**
 * Load 8-band VIMS-style spectral cubes (colorCCD.img) for single-band grayscale display.
 * Cubes are float32, shape [Band=8, Line=681, Sample=681], sample index fastest (PDS "Last Index Fastest").
 * Data in-repo: public/assets/dt/tomasko_1.0/2012_A{albedo}_p{phase}_colorCCD.img
 */

const TOMASKO_DT = '/assets/dt/tomasko_1.0';
const NUM_LINES = 681;
const NUM_SAMPLES = 681;
export const COLOR_CUBE_NUM_BANDS = 8;
const PLANE_SIZE = NUM_LINES * NUM_SAMPLES;
const EXPECTED_BYTES = COLOR_CUBE_NUM_BANDS * PLANE_SIZE * 4;

const cubeCache = new Map();

function cacheKey(phaseDeg, albedo) {
  return `${Math.round(phaseDeg)}_${Number(albedo)}`;
}

/**
 * Approximate band-center wavelengths (µm) for UI labels.
 * Replace with PDS bin-center table if bundled with your dataset.
 */
export const COLOR_CUBE_BAND_CENTERS_UM = [0.93, 1.08, 1.28, 1.59, 1.99, 2.69, 4.97, 5.07];

export async function loadColorCubeData(phaseAngleDeg, albedo = 0.1) {
  const phase = Math.round(phaseAngleDeg);
  const padded = String(phase).padStart(3, '0');
  const albedoStr = Number(albedo).toFixed(1);
  const key = cacheKey(phase, albedo);
  const cached = cubeCache.get(key);
  if (cached) return cached;

  const filename = `2012_A${albedoStr}_p${padded}_colorCCD.img`;
  const url = `${TOMASKO_DT}/${filename}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`colorCCD fetch failed: ${res.status} ${filename}`);
  }
  const buf = await res.arrayBuffer();
  if (buf.byteLength !== EXPECTED_BYTES) {
    console.warn(`colorCCD ${filename}: got ${buf.byteLength} bytes, expected ${EXPECTED_BYTES}`);
  }
  const data = new Float32Array(buf);
  cubeCache.set(key, data);
  return data;
}

function robustStretchRange(slice) {
  const tmp = [];
  for (let i = 0; i < slice.length; i += 1) {
    const v = slice[i];
    if (Number.isFinite(v)) tmp.push(v);
  }
  if (tmp.length === 0) return { lo: 0, hi: 1 };
  tmp.sort((a, b) => a - b);
  const lo = tmp[Math.floor(tmp.length * 0.02)];
  const hi = tmp[Math.floor(tmp.length * 0.98)];
  if (!(hi > lo)) return { lo: 0, hi: 1 };
  return { lo, hi };
}

/**
 * @returns {Promise<string|null>} object URL for a PNG blob; caller must revoke
 */
export async function renderColorCubeBandToObjectURL(cubeData, bandIndex) {
  if (!cubeData || bandIndex < 0 || bandIndex >= COLOR_CUBE_NUM_BANDS) {
    return null;
  }
  const offset = bandIndex * PLANE_SIZE;
  const slice = cubeData.subarray(offset, offset + PLANE_SIZE);
  const { lo, hi } = robustStretchRange(slice);

  const canvas = document.createElement('canvas');
  canvas.width = NUM_SAMPLES;
  canvas.height = NUM_LINES;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const imgData = ctx.createImageData(NUM_SAMPLES, NUM_LINES);
  const { data } = imgData;
  for (let i = 0; i < PLANE_SIZE; i += 1) {
    const v = slice[i];
    let t = 0;
    if (Number.isFinite(v)) {
      t = (v - lo) / (hi - lo);
      if (t < 0) t = 0;
      if (t > 1) t = 1;
    }
    const g = Math.round(t * 255);
    const j = i * 4;
    data[j] = g;
    data[j + 1] = g;
    data[j + 2] = g;
    data[j + 3] = 255;
  }
  ctx.putImageData(imgData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(null);
        return;
      }
      resolve(URL.createObjectURL(blob));
    }, 'image/png');
  });
}

export async function getMonoBandImageObjectUrl(phaseAngleDeg, bandIndex, albedo = 0.1) {
  const cube = await loadColorCubeData(phaseAngleDeg, albedo);
  return renderColorCubeBandToObjectURL(cube, bandIndex);
}
