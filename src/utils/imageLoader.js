// Utility functions for loading and processing PDS4 image files
// This is a simplified version - in a real implementation, you'd need to use
// a library like pds4-tools or implement PDS4 parsing

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
 * @returns {string} Filename for the image
 */
export const getImageFilename = (phaseAngle) => {
  const paddedPhase = formatPhaseAngle(phaseAngle);
  return `2012_A0.1_p${paddedPhase}_colorCCD.img`;
};

/**
 * Generate the XML filename for a given phase angle
 * @param {number} phaseAngle - Phase angle in degrees
 * @returns {string} Filename for the XML metadata
 */
export const getXmlFilename = (phaseAngle) => {
  const paddedPhase = formatPhaseAngle(phaseAngle);
  return `2012_A0.1_p${paddedPhase}_colorCCD.xml`;
};

/**
 * Get the public URL for an image file
 * @param {number} phaseAngle - Phase angle in degrees
 * @param {string} compositeType - Type of composite image: '5_2_1.3' or '2_1.6_1.3'
 * @returns {string} Public URL to the image file
 */
const getAssetBasePath = (hazeFolder) => {
  // Always use tomasko_1.0 directory
  return '/assets/dt/tomasko_1.0';
};

/**
 * Generate the image URL for a given phase angle and haze configuration
 * @param {number} phaseAngle - Phase angle in degrees
 * @param {string} compositeType - Type of composite image: '5_2_1.3' or '2_1.6_1.3', or 'incidence', 'emission', 'phase'
 * @param {string} hazeFolder - Folder name for haze configuration (e.g., 'doose_0.5')
 * @returns {string} Public URL to the image file
 */
export const getImageUrl = (phaseAngle, compositeType = '5_2_1.3', hazeFolder) => {
  const paddedPhase = formatPhaseAngle(phaseAngle);
  const basePath = getAssetBasePath(hazeFolder);
  
  // Handle geo-based image types (incidence, emission, phase)
  if (compositeType === 'incidence' || compositeType === 'emission' || compositeType === 'phase') {
    return `${basePath}/2012_A0.1_p${paddedPhase}_${compositeType}.png`;
  }
  
  // Handle composite image types
  return `${basePath}/2012_A0.1_p${paddedPhase}_${compositeType}.png`;
};

/**
 * Get the public URL for an XML file
 * @param {number} phaseAngle - Phase angle in degrees
 * @returns {string} Public URL to the XML file
 */
export const getXmlUrl = (phaseAngle) => {
  const filename = getXmlFilename(phaseAngle);
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
 * 
 * @param {number} phaseAngle - Phase angle in degrees
 * @param {string} compositeType - Type of composite image: '5_2_1.3' or '2_1.6_1.3', or 'incidence', 'emission', 'phase'
 * @param {string} hazeFolder - Folder name for haze configuration (e.g., 'doose_0.5')
 * @returns {Promise<string|null>} URL of the PNG image, or null if failed
 */
export const loadPds4Image = async (phaseAngle, compositeType = '5_2_1.3', hazeFolder) => {
  try {
    const imageUrl = getImageUrl(phaseAngle, compositeType, hazeFolder);
    
    // Use native image preloading (much faster than fetch)
    const loaded = await preloadImage(imageUrl);
    
    if (loaded) {
      return imageUrl;
    }

    // No fallback - only use tomasko_1.0 directory
    console.warn(`Image not found for phase angle ${phaseAngle}° (${compositeType})`);
    return null;
  } catch (error) {
    console.error('Error loading image:', error);
    return null;
  }
};

/**
 * Preload adjacent images for smoother transitions
 * @param {number} currentPhaseAngle - Current phase angle in degrees
 * @param {string} compositeType - Type of composite image
 * @param {string} hazeFolder - Folder name for haze configuration
 * @param {number} range - Number of adjacent angles to preload on each side (default: 2)
 */
export const preloadAdjacentImages = async (currentPhaseAngle, compositeType, hazeFolder, range = 2) => {
  const availableAngles = getAvailablePhaseAngles();
  const currentIndex = availableAngles.indexOf(currentPhaseAngle);
  
  if (currentIndex === -1) return;
  
  // Preload images in background (don't await)
  for (let i = -range; i <= range; i++) {
    const targetIndex = currentIndex + i;
    if (targetIndex >= 0 && targetIndex < availableAngles.length && i !== 0) {
      const targetAngle = availableAngles[targetIndex];
      const imageUrl = getImageUrl(targetAngle, compositeType, hazeFolder);
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
  // Phase angles go from 0 to 215 in 5-degree increments
  const angles = [];
  for (let i = 0; i <= 215; i += 5) {
    angles.push(i);
  }
  return angles;
};
