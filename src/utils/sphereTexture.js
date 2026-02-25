/**
 * Load an image from URL as a promise.
 * @param {string} imageUrl
 * @returns {Promise<HTMLImageElement>}
 */
const loadImage = (imageUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    img.src = imageUrl;
  });
};

/**
 * Build a 2:1 equirectangular texture from a half-sphere image (e.g. 681×681).
 * The image is drawn into the left half of the texture (u in [0, 0.5]);
 * the right half is filled with a dark placeholder for the far side.
 * @param {string} imageUrl - URL of the half-sphere PNG
 * @returns {Promise<HTMLCanvasElement>} Canvas with dimensions (2*height, height) for use as texture source
 */
export const buildEquirectangularTextureCanvas = (imageUrl) => {
  return loadImage(imageUrl).then((img) => {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const outWidth = 2 * h;
    const outHeight = h;
    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas 2d context');
    ctx.drawImage(img, 0, 0, w, h, 0, 0, outWidth / 2, outHeight);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(outWidth / 2, 0, outWidth / 2, outHeight);
    return canvas;
  });
};

/**
 * Build a 2:1 equirectangular texture from two half-sphere images:
 * left half (u 0–0.5) = front phase, right half (u 0.5–1) = opposite phase (180°).
 * @param {string} frontImageUrl - URL for the visible hemisphere (e.g. phase 40°)
 * @param {string} backImageUrl - URL for the far hemisphere (e.g. phase 220° = 40 + 180)
 * @returns {Promise<HTMLCanvasElement>} Canvas 2:1 for full sphere texture
 */
export const buildEquirectangularTextureCanvasFromTwoHalves = (frontImageUrl, backImageUrl) => {
  return Promise.all([loadImage(frontImageUrl), loadImage(backImageUrl)]).then(([frontImg, backImg]) => {
    const h = Math.max(frontImg.naturalHeight, backImg.naturalHeight);
    const outWidth = 2 * h;
    const outHeight = h;
    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not get canvas 2d context');
    const halfW = outWidth / 2;
    ctx.drawImage(frontImg, 0, 0, frontImg.naturalWidth, frontImg.naturalHeight, 0, 0, halfW, outHeight);
    ctx.drawImage(backImg, 0, 0, backImg.naturalWidth, backImg.naturalHeight, halfW, 0, halfW, outHeight);
    return canvas;
  });
};
