/**
 * Load 15-band VIMS-style spectral cubes (colorCCD.img) dynamically from matrix folders.
 * Updated to match true scientific float32 cube arrays exactly.
 * Cubes are float32, shape [Band=15, Line=641, Sample=641], sample index fastest.
 */

const NUM_LINES = 641;   
const NUM_SAMPLES = 641; 
export const COLOR_CUBE_NUM_BANDS = 15;
const PLANE_SIZE = NUM_LINES * NUM_SAMPLES;
const EXPECTED_BYTES = COLOR_CUBE_NUM_BANDS * PLANE_SIZE * 4;

const cubeCache = new Map();

function cacheKey(phaseDeg, albedo, folderName) {
  return `${Math.round(phaseDeg)}_${Number(albedo)}_${folderName}`;
}

export const COLOR_CUBE_BAND_CENTERS_UM = [
  0.93, 1.00, 1.08, 1.21, 1.28, 1.39, 1.59, 1.70, 
  2.02, 2.10, 2.20, 2.39, 2.70, 2.80, 5.01
];

// In src/utils/colorCubeLoader.js

export async function loadColorCubeData(phaseAngleDeg, folderName, albedo = 0.1) {
  const phase = Math.round(phaseAngleDeg);
  const padded = String(phase).padStart(3, '0');
  
  const key = cacheKey(phase, albedo, folderName);
  const cached = cubeCache.get(key);
  if (cached) return cached;

  // 1. Strip the underscore JUST for the filename (e.g., haze0methane0)
  const tag = folderName.replace(/_/g, '');
  const filename = `runsforgui_${tag}_p${padded}_colorCCD.img`;
  
  // 2. Use the original folderName WITH the underscore for the directory path
  const url = `/assets/dt/${folderName}/${filename}`;
  
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`colorCCD fetch failed: ${res.status} ${filename} in ${folderName}`);
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

export async function getMonoBandImageObjectUrl(phaseAngleDeg, bandIndex, folderName, albedo = 0.1) {
  const cube = await loadColorCubeData(phaseAngleDeg, folderName, albedo);
  return renderColorCubeBandToObjectURL(cube, bandIndex);
}