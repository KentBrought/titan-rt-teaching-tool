// Utility functions for loading and processing PDS4 image files
// This is a simplified version - in a real implementation, you'd need to use
// a library like pds4-tools or implement PDS4 parsing

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
 * @returns {string} Public URL to the image file
 */
export const getImageUrl = (phaseAngle) => {
  const paddedPhase = formatPhaseAngle(phaseAngle);
  return `/assets/2012_A0.1_p${paddedPhase}.png`;
};

/**
 * Get the public URL for an XML file
 * @param {number} phaseAngle - Phase angle in degrees
 * @returns {string} Public URL to the XML file
 */
export const getXmlUrl = (phaseAngle) => {
  const filename = getXmlFilename(phaseAngle);
  return `/src/assets/${filename}`;
};

/**
 * Load image data from a converted PNG file
 * 
 * @param {number} phaseAngle - Phase angle in degrees
 * @returns {Promise<string|null>} URL of the PNG image, or null if failed
 */
export const loadPds4Image = async (phaseAngle) => {
  try {
    const imageUrl = getImageUrl(phaseAngle);
    console.log(`Loading image for phase angle: ${phaseAngle}° from ${imageUrl}`);
    
    // Test if the image exists by trying to load it
    const response = await fetch(imageUrl);
    if (response.ok) {
      return imageUrl;
    } else {
      console.warn(`Image not found for phase angle ${phaseAngle}°`);
      return null;
    }
  } catch (error) {
    console.error('Error loading image:', error);
    return null;
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
