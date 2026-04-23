// Utility functions for loading and processing PDS4 image files
// Updated to support albedo parameter

// Image cache to track loaded images
const imageCache = new Map();
const preloadingImages = new Set();

/**
 * Convert phase angle to padded string for filename
 * @param {number} phaseAngle - Phase angle in degrees
 * @returns {string} Padded phase angle string (e.g., "000", "005", "010")
 */
export const formatPhaseAngle = (phaseAngle) => {
  return String(Math.round(phaseAngle)).padStart(3, '0');
};

/**
 * Generate the filename for a given phase angle
 * @param {number} phaseAngle - Phase angle in degrees
 * @param {number} albedo - Albedo value (0.1 or 0.2)
 * @returns {string} Filename for the image
 */
export const getImageFilename = (phaseAngle, albedo = 0.1) => {
  const paddedPhase = formatPhaseAngle(phaseAngle);
  return `2012_A${albedo}_p${paddedPhase}_colorCCD.img`;
};

/**
 * Generate the XML filename for a given phase angle
 * @param {number} phaseAngle - Phase angle in degrees
 * @param {number} albedo - Albedo value (0.1 or 0.2)
 * @returns {string} Filename for the XML metadata
 */
export const getXmlFilename = (phaseAngle, albedo = 0.1) => {
  const paddedPhase = formatPhaseAngle(phaseAngle);
  return `2012_A${albedo}_p${paddedPhase}_colorCCD.xml`;
};

function canonicalDtFolder(hazeFolder, albedo, compositeType) {
  const geo = compositeType === 'incidence' || compositeType === 'emission' || compositeType === 'phase';
  if (geo || !hazeFolder || !hazeFolder.startsWith('doose')) return hazeFolder;
  if (hazeFolder === 'doose_0.0_meth0') return 'haze0_methane1';
  if (hazeFolder === 'doose_0.0_meth0.25') return 'haze0_methane1';
  if (hazeFolder === 'doose_0.0_meth1') return 'haze0_methane1';
  if (hazeFolder === 'doose_0.5_meth0') return 'haze0.5_methane1';
  if (hazeFolder === 'doose_0.5_meth0.25') return 'haze0.5_methane1';
  if (hazeFolder === 'doose_0.5_meth1') return 'haze0.5_methane1';
  if (hazeFolder === 'doose_1.0_meth0') return 'haze1_methane0.25';
  if (hazeFolder === 'doose_1.0_meth0.25') return 'haze1_methane0.25';
  if (hazeFolder === 'doose_1.0_meth1') return 'haze1_methane1';
  if (hazeFolder === 'doose_2.0_meth0') return 'dooseA0.2_haze2';
  if (hazeFolder === 'doose_2.0_meth0.25') return 'dooseA0.2_haze2';
  if (hazeFolder === 'doose_2.0_meth1') return 'dooseA0.2_haze2';
  if (hazeFolder === 'doose_0.0') return 'haze0_methane1';
  if (hazeFolder === 'doose_0.5') return 'haze0.5_methane1';
  if (hazeFolder === 'doose_2.0') return 'dooseA0.2_haze2';
  if (hazeFolder === 'doose_1.0') {
    if (albedo === 0.1) return 'haze1_methane1';
    if (albedo === 0.2) return 'dooseA0.2_haze1';
    return 'dooseA0.1_haze1';
  }
  return hazeFolder;
}

// Folder-level albedo availability in `public/assets/dt/`.
const FOLDER_ALBEDO_SUPPORT = {
  'dooseA0.1_haze1': [0.1],
  'dooseA0.2_haze1': [0.2],
  'dooseA0.2_haze0.52': [0.2],
  'dooseA0.2_haze2': [0.2],
  'tomasko_1.0': [0.1],
  'haze0.5_methane1': [0.1],
  'haze0_methane1': [0.1],
  'haze1_methane1': [0.1],
  'haze1_methane0.25': [0.1],
};

function getFolderAlbedoOrder(folder, requestedAlbedo) {
  const supported = FOLDER_ALBEDO_SUPPORT[folder] || [requestedAlbedo];
  if (supported.includes(requestedAlbedo)) {
    return [requestedAlbedo, ...supported.filter((v) => v !== requestedAlbedo)];
  }
  return supported;
}

function resolveFolderAndAlbedo(hazeFolder, requestedAlbedo, compositeType) {
  const folder = canonicalDtFolder(hazeFolder, requestedAlbedo, compositeType);
  const albedo = getFolderAlbedoOrder(folder, requestedAlbedo)[0];
  return { folder, albedo };
}

/**
 * @param {string} hazeFolder - dt subfolder (canonical or legacy doose_*)
 */
const getAssetBasePath = (hazeFolder) => `/assets/dt/${hazeFolder}`;

/**
 * Generate the image URL for a given phase angle, composite type, haze folder, and albedo
 * @param {number} phaseAngle - Phase angle in degrees
 * @param {string} compositeType - Type of composite image: '5_2_1.3' or '2_1.6_1.3', or 'incidence', 'emission', 'phase'
 * @param {string} hazeFolder - Folder name for haze configuration (e.g., 'doose_0.5')
 * @param {number} albedo - Albedo value (0.1 or 0.2)
 * @returns {string} Public URL to the image file
 */
export const getImageUrl = (phaseAngle, compositeType = '5_2_1.3', hazeFolder, albedo = 0.1) => {
  const paddedPhase = formatPhaseAngle(phaseAngle);
  const resolved = resolveFolderAndAlbedo(hazeFolder, albedo, compositeType);
  const folder = resolved.folder;
  const effectiveAlbedo = resolved.albedo;
  const basePath = getAssetBasePath(folder);
  
  // Handle geo-based image types (incidence, emission, phase)
  // These are only available with albedo 0.1 in tomasko_1.0
  if (compositeType === 'incidence' || compositeType === 'emission' || compositeType === 'phase') {
    return `/assets/dt/tomasko_1.0/2012_A0.1_p${paddedPhase}_${compositeType}.png`;
  }
  
  // Handle composite image types with albedo
  return `${basePath}/2012_A${effectiveAlbedo}_p${paddedPhase}_${compositeType}.png`;
};

/**
 * Get the public URL for an XML file
 * @param {number} phaseAngle - Phase angle in degrees
 * @param {number} albedo - Albedo value (0.1 or 0.2)
 * @returns {string} Public URL to the XML file
 */
export const getXmlUrl = (phaseAngle, albedo = 0.1) => {
  const filename = getXmlFilename(phaseAngle, albedo);
  return `/assets/dt/tomasko_1.0/${filename}`;
};

/**
 * Preload an image using native Image object (faster than fetch)
 * @param {string} imageUrl - URL of the image to preload
 * @returns {Promise<boolean>} True if image loaded successfully, false otherwise
 */
const preloadImage = (imageUrl) => {
  return new Promise((resolve) => {
    // Check cache first
    if (imageCache.has(imageUrl)) {
      resolve(true);
      return;
    }

    // Check if already preloading
    if (preloadingImages.has(imageUrl)) {
      // Wait for existing preload to complete
      const checkInterval = setInterval(() => {
        if (imageCache.has(imageUrl)) {
          clearInterval(checkInterval);
          resolve(true);
        } else if (!preloadingImages.has(imageUrl)) {
          // Preload failed
          clearInterval(checkInterval);
          resolve(false);
        }
      }, 50);
      return;
    }

    preloadingImages.add(imageUrl);
    const img = new Image();
    
    img.onload = () => {
      imageCache.set(imageUrl, true);
      preloadingImages.delete(imageUrl);
      resolve(true);
    };
    
    img.onerror = () => {
      preloadingImages.delete(imageUrl);
      resolve(false);
    };
    
    img.src = imageUrl;
  });
};

/**
 * Load image data from a converted PNG file
 * Uses native image preloading for better performance
 * Has comprehensive fallback logic to always show an image
 * 
 * @param {number} phaseAngle - Phase angle in degrees
 * @param {string} compositeType - Type of composite image: '5_2_1.3' or '2_1.6_1.3', or 'incidence', 'emission', 'phase'
 * @param {string} hazeFolder - Folder name for haze configuration (e.g., 'doose_0.5')
 * @param {number} albedo - Albedo value (0, 0.1, or 0.2)
 * @returns {Promise<{url: string|null, fallbackUsed: boolean, actualAlbedo: number|null, actualFolder: string|null}>} Image URL and fallback info
 */
export const loadPds4Image = async (phaseAngle, compositeType = '5_2_1.3', hazeFolder, albedo = 0.1) => {
  try {
    const resolvedPrimary = resolveFolderAndAlbedo(hazeFolder, albedo, compositeType);
    const primaryFolder = resolvedPrimary.folder;
    const primaryAlbedo = resolvedPrimary.albedo;

    const isDoose = typeof hazeFolder === 'string' && hazeFolder.startsWith('doose');
    const fallbackFolders = isDoose
      ? [primaryFolder, 'dooseA0.1_haze1', 'dooseA0.2_haze1', 'dooseA0.2_haze0.52', 'dooseA0.2_haze2', 'tomasko_1.0']
      : [hazeFolder, 'tomasko_1.0', 'dooseA0.1_haze1', 'dooseA0.2_haze1'];

    const foldersToTry = [...new Set(fallbackFolders.filter(Boolean))];

    for (const folder of foldersToTry) {
      const albedosToTry = getFolderAlbedoOrder(folder, albedo);
      for (const tryAlbedo of albedosToTry) {
        const imageUrl = getImageUrl(phaseAngle, compositeType, folder, tryAlbedo);
        const loaded = await preloadImage(imageUrl);
        
        if (loaded) {
          const fallbackUsed = (folder !== primaryFolder || tryAlbedo !== primaryAlbedo);
          return {
            url: imageUrl,
            fallbackUsed,
            actualAlbedo: tryAlbedo,
            actualFolder: folder,
          };
        }
      }
    }

    return { url: null, fallbackUsed: false, actualAlbedo: null, actualFolder: null };
  } catch (error) {
    console.error('Error loading image:', error);
    return { url: null, fallbackUsed: false, actualAlbedo: null, actualFolder: null };
  }
};

/**
 * Preload adjacent images for smoother transitions
 * @param {number} currentPhaseAngle - Current phase angle in degrees
 * @param {string} compositeType - Type of composite image
 * @param {string} hazeFolder - Folder name for haze configuration
 * @param {number} range - Number of adjacent angles to preload on each side (default: 2)
 * @param {number} albedo - Albedo value (0.1 or 0.2)
 */
export const preloadAdjacentImages = async (currentPhaseAngle, compositeType, hazeFolder, range = 2, albedo = 0.1) => {
  const availableAngles = getAvailablePhaseAngles();
  const currentIndex = availableAngles.indexOf(currentPhaseAngle);

  if (currentIndex === -1) return;

  const preloadFolder = canonicalDtFolder(hazeFolder, albedo, compositeType);
  const preloadAlbedo = getFolderAlbedoOrder(preloadFolder, albedo)[0];

  for (let i = -range; i <= range; i++) {
    const targetIndex = currentIndex + i;
    if (targetIndex >= 0 && targetIndex < availableAngles.length && i !== 0) {
      const targetAngle = availableAngles[targetIndex];
      const imageUrl = getImageUrl(targetAngle, compositeType, preloadFolder, preloadAlbedo);
      // Preload without blocking
      preloadImage(imageUrl).catch(() => {
        // Silently fail for preloads
      });
    }
  }
};

/**
 * Get available phase angles based on the files in the assets directory
 * @returns {number[]} Array of available phase angles in degrees
 */
export const getAvailablePhaseAngles = () => {
  // Phase angles go from 0 to 355 in 5-degree increments
  const angles = [];
  for (let i = 0; i <= 355; i += 5) {
    angles.push(i);
  }
  return angles;
};
