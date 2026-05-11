import { getGeoValue } from './geoCubeLoader';
import { getMaterialClassAtLatLon } from './materialMapLoader';

const NUM_SAMPLES = 681;
const NUM_LINES = 681;

const isValidClass = (v) => v === 0 || v === 1 || v === 2;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function majority3(values) {
  // values are 0/1/2; return mode, tiebreak by preferring center-ish order 2,1,0 (arbitrary but stable)
  let c0 = 0, c1 = 0, c2 = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v === 0) c0++;
    else if (v === 1) c1++;
    else if (v === 2) c2++;
  }
  if (c2 >= c1 && c2 >= c0) return 2;
  if (c1 >= c0) return 1;
  return 0;
}

function smoothMajority3x3(classMap, onDiskMask) {
  const out = new Uint8Array(classMap.length);
  out.set(classMap);
  for (let y = 0; y < NUM_LINES; y++) {
    for (let x = 0; x < NUM_SAMPLES; x++) {
      const idx = y * NUM_SAMPLES + x;
      if (!onDiskMask[idx]) continue;
      const center = classMap[idx];
      if (!isValidClass(center)) continue;
      const neighborhood = [];
      for (let yy = y - 1; yy <= y + 1; yy++) {
        if (yy < 0 || yy >= NUM_LINES) continue;
        for (let xx = x - 1; xx <= x + 1; xx++) {
          if (xx < 0 || xx >= NUM_SAMPLES) continue;
          const nIdx = yy * NUM_SAMPLES + xx;
          if (!onDiskMask[nIdx]) continue;
          const v = classMap[nIdx];
          if (isValidClass(v)) neighborhood.push(v);
        }
      }
      if (neighborhood.length >= 5) out[idx] = majority3(neighborhood);
    }
  }
  return out;
}

function fillInvalidByNearestValid(classMap, onDiskMask, maxRadius = 6) {
  const out = new Uint8Array(classMap.length);
  out.set(classMap);
  for (let y = 0; y < NUM_LINES; y++) {
    for (let x = 0; x < NUM_SAMPLES; x++) {
      const idx = y * NUM_SAMPLES + x;
      if (!onDiskMask[idx]) continue;
      const v = out[idx];
      if (isValidClass(v)) continue;

      let found = null;
      for (let r = 1; r <= maxRadius && found === null; r++) {
        const minY = clamp(y - r, 0, NUM_LINES - 1);
        const maxY = clamp(y + r, 0, NUM_LINES - 1);
        const minX = clamp(x - r, 0, NUM_SAMPLES - 1);
        const maxX = clamp(x + r, 0, NUM_SAMPLES - 1);
        // Search ring (top/bottom rows + left/right cols) for first valid.
        for (let xx = minX; xx <= maxX && found === null; xx++) {
          const topIdx = minY * NUM_SAMPLES + xx;
          const botIdx = maxY * NUM_SAMPLES + xx;
          if (onDiskMask[topIdx] && isValidClass(out[topIdx])) found = out[topIdx];
          else if (onDiskMask[botIdx] && isValidClass(out[botIdx])) found = out[botIdx];
        }
        for (let yy = minY; yy <= maxY && found === null; yy++) {
          const leftIdx = yy * NUM_SAMPLES + minX;
          const rightIdx = yy * NUM_SAMPLES + maxX;
          if (onDiskMask[leftIdx] && isValidClass(out[leftIdx])) found = out[leftIdx];
          else if (onDiskMask[rightIdx] && isValidClass(out[rightIdx])) found = out[rightIdx];
        }
      }
      if (found !== null) out[idx] = found;
    }
  }
  return out;
}

/**
 * Project the global 3-class material map onto the current 681x681 disk using the geo cube.
 * This mimics the old overlay’s “stable” per-pixel classing (and then lightly smooths it).
 */
export function buildMaterialClassDiskMap(geoCubeData, materialMap) {
  const out = new Uint8Array(NUM_SAMPLES * NUM_LINES);
  out.fill(255); // invalid sentinel
  const onDiskMaskSeed = new Uint8Array(out.length);
  let minX = NUM_SAMPLES - 1;
  let maxX = 0;
  let minY = NUM_LINES - 1;
  let maxY = 0;
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  for (let y = 0; y < NUM_LINES; y++) {
    for (let x = 0; x < NUM_SAMPLES; x++) {
      const idx = y * NUM_SAMPLES + x;
      const lat = getGeoValue(geoCubeData, x, y, 0);
      const lon = getGeoValue(geoCubeData, x, y, 1);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      onDiskMaskSeed[idx] = 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumX += x;
      sumY += y;
      count += 1;

      const cls = getMaterialClassAtLatLon(materialMap, lat, lon);
      if (isValidClass(cls)) out[idx] = cls;
    }
  }

  // Build a circular on-disk mask from the valid-lat/lon footprint.
  // (Distance band is finite everywhere, so it can't be used as a mask.)
  const onDiskMask = new Uint8Array(out.length);
  if (minX > maxX || minY > maxY) {
    // No valid footprint; return empty mask.
    return { width: NUM_SAMPLES, height: NUM_LINES, data: out };
  }
  const cx = count > 0 ? (sumX / count) : ((minX + maxX) * 0.5);
  const cy = count > 0 ? (sumY / count) : ((minY + maxY) * 0.5);

  // Radius from the farthest seed point (more accurate than bbox-derived radius).
  let r2Seed = 0;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const idx = y * NUM_SAMPLES + x;
      if (!onDiskMaskSeed[idx]) continue;
      const dx = x - cx;
      const dy = y - cy;
      const d2 = (dx * dx) + (dy * dy);
      if (d2 > r2Seed) r2Seed = d2;
    }
  }
  const r = Math.sqrt(r2Seed) + 6; // pad to reach the visible limb
  const r2 = r * r;
  for (let y = 0; y < NUM_LINES; y++) {
    for (let x = 0; x < NUM_SAMPLES; x++) {
      const dx = x - cx;
      const dy = y - cy;
      if ((dx * dx + dy * dy) <= r2) onDiskMask[y * NUM_SAMPLES + x] = 1;
    }
  }

  // Fill missing classes near the limb, then smooth within the disk.
  const filled = fillInvalidByNearestValid(out, onDiskMask, 10);
  const smoothed = smoothMajority3x3(filled, onDiskMask);
  return { width: NUM_SAMPLES, height: NUM_LINES, data: smoothed };
}

