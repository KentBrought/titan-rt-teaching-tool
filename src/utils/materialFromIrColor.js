/**
 * Map IR display pixels to the 681×681 geo / RT grid. Material class comes from the smoothed
 * basemap disk ({@link buildMaterialClassDiskMap} via {@link materialDiskClassCache}), not IR RGB.
 */

const DISK_GRID = 681;

/**
 * Map a clicked pixel in the IR PNG to the 681×681 geo / RT grid (integer indices 0–680).
 * @param {number} nx – column in the loaded image (natural pixel space)
 * @param {number} ny – row in the loaded image
 */
export function naturalIrPixelToDisk681(nx, ny, naturalWidth, naturalHeight) {
  const nw = Math.max(1, Math.floor(Number(naturalWidth) || DISK_GRID));
  const nh = Math.max(1, Math.floor(Number(naturalHeight) || DISK_GRID));
  const x = Math.max(0, Math.min(DISK_GRID - 1, Math.floor(((Number(nx) + 0.5) / nw) * DISK_GRID)));
  const y = Math.max(0, Math.min(DISK_GRID - 1, Math.floor(((Number(ny) + 0.5) / nh) * DISK_GRID)));
  return { x, y };
}
