/**
 * Build a 2:1 equirectangular texture from a half-sphere image (e.g. 681×681).
 * The image is drawn into the left half of the texture (u in [0, 0.5]);
 * the right half is filled with a dark placeholder for the far side.
 * @param {string} imageUrl - URL of the half-sphere PNG
 * @returns {Promise<HTMLCanvasElement>} Canvas with dimensions (2*height, height) for use as texture source
 */
export const buildEquirectangularTextureCanvas = (imageUrl) => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      // 2:1 aspect for full equirectangular: width = 2 * height
      const outWidth = 2 * h;
      const outHeight = h;
      const canvas = document.createElement('canvas');
      canvas.width = outWidth;
      canvas.height = outHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas 2d context'));
        return;
      }
      // Left half: draw the half-sphere image (stretch to fill left half)
      ctx.drawImage(img, 0, 0, w, h, 0, 0, outWidth / 2, outHeight);
      // Right half: dark fill for the far side (no data)
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(outWidth / 2, 0, outWidth / 2, outHeight);
      resolve(canvas);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${imageUrl}`));
    img.src = imageUrl;
  });
};
