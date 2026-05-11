/**
 * Grayscale views derived from the same false-color IR composite PNGs used in color mode
 * (haze-folder PNGs from `loadPds4Image`), not from `tomasko_1.0` single-band `colorCCD.img`.
 *
 * Each band index applies a different RGB mix (short-wavelength emphasis → long-wavelength emphasis)
 * so the wavelength slider still changes appearance while keeping disk geometry identical to color IR.
 */

const NUM_BANDS = 8;

/** Per-band RGB weights (rows sum to 1). Tunable; order is short → long emphasis. */
const RGB_WEIGHTS = [
  [0.10, 0.38, 0.52],
  [0.12, 0.42, 0.46],
  [0.16, 0.45, 0.39],
  [0.20, 0.48, 0.32],
  [0.26, 0.50, 0.24],
  [0.34, 0.46, 0.20],
  [0.48, 0.38, 0.14],
  [0.58, 0.30, 0.12],
].map((row) => {
  const s = row[0] + row[1] + row[2];
  return row.map((v) => v / s);
});

function robustStretchRange(grayValues) {
  const tmp = [];
  for (let i = 0; i < grayValues.length; i += 1) {
    const v = grayValues[i];
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
 * @param {string} imageUrl - Same PNG URL as color IR (e.g. from `loadPds4Image`)
 * @param {number} bandIndex - 0 .. NUM_BANDS-1
 * @returns {Promise<string|null>} object URL for a PNG blob; caller must revoke
 */
export async function compositeImageUrlToGrayscaleObjectURL(imageUrl, bandIndex) {
  if (!imageUrl || bandIndex < 0 || bandIndex >= NUM_BANDS) return null;
  const [wr, wg, wb] = RGB_WEIGHTS[bandIndex];

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!w || !h) {
        resolve(null);
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      const src = ctx.getImageData(0, 0, w, h);
      const { data } = src;
      const n = w * h;
      const gray = new Float32Array(n);
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        const r = data[p] / 255;
        const g = data[p + 1] / 255;
        const b = data[p + 2] / 255;
        gray[i] = wr * r + wg * g + wb * b;
      }
      const { lo, hi } = robustStretchRange(gray);
      const out = ctx.createImageData(w, h);
      const od = out.data;
      for (let i = 0, p = 0; i < n; i++, p += 4) {
        let t = (gray[i] - lo) / (hi - lo);
        if (t < 0) t = 0;
        if (t > 1) t = 1;
        const g = Math.round(t * 255);
        od[p] = g;
        od[p + 1] = g;
        od[p + 2] = g;
        od[p + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);
      canvas.toBlob((blob) => {
        if (!blob) resolve(null);
        else resolve(URL.createObjectURL(blob));
      }, 'image/png');
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

export const COMPOSITE_GRAY_NUM_BANDS = NUM_BANDS;
