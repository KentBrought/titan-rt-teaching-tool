/**
 * Data processing utilities for PyDISORT spectral and atmospheric data
 */

/**
 * Process spectral library data for visualization
 * @param {Object} spectralData - The spectral library JSON data
 * @returns {Object} Processed data with wavelength and spectral arrays
 */
export const processSpectralData = (spectralData) => {
  if (!spectralData) return null;

  const { wavelength, inc, emi, daz, standard, no_ch4, no_haze } = spectralData;

  // Create angle combinations for indexing
  const angleCombinations = [];
  if (inc && emi && daz) {
    for (let i = 0; i < inc.length; i++) {
      for (let j = 0; j < emi.length; j++) {
        for (let k = 0; k < daz.length; k++) {
          angleCombinations.push({
            incidence: inc[i],
            emission: emi[j],
            azimuth: daz[k],
            index: i * emi.length * daz.length + j * daz.length + k
          });
        }
      }
    }
  }

  return {
    wavelength,
    inc,
    emi,
    daz,
    standard,
    no_ch4,
    no_haze,
    angleCombinations
  };
};

/**
 * Get available angles from spectral data
 * @param {Object} spectralData - The spectral library data
 * @returns {Object} Available angles
 */
export const getAvailableAngles = (spectralData) => {
  if (!spectralData) return { incidence: [], emission: [], azimuth: [] };
  
  return {
    incidence: [...new Set(spectralData.inc || [])],
    emission: [...new Set(spectralData.emi || [])],
    azimuth: [...new Set(spectralData.daz || [])]
  };
};

/**
 * Find the closest angle value in an array
 * @param {Array} angleArray - Array of available angles
 * @param {number} targetAngle - Target angle to find
 * @returns {number} Index of closest angle
 */
export const findClosestAngleIndex = (angleArray, targetAngle) => {
  if (!angleArray || angleArray.length === 0) return 0;
  
  // First try exact match
  const exactIndex = angleArray.findIndex(angle => Math.abs(angle - targetAngle) < 1e-6);
  if (exactIndex !== -1) return exactIndex;
  
  // Find closest match
  let closestIndex = 0;
  let minDiff = Math.abs(angleArray[0] - targetAngle);
  
  for (let i = 1; i < angleArray.length; i++) {
    const diff = Math.abs(angleArray[i] - targetAngle);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }
  
  console.log(`Closest match for ${targetAngle}°: ${angleArray[closestIndex]}° (index ${closestIndex})`);
  return closestIndex;
};

/**
 * Create spectral plot data for a specific angle combination and case
 * @param {Object} processedData - Processed spectral data
 * @param {number} incidenceAngle - Selected incidence angle
 * @param {number} emissionAngle - Selected emission angle
 * @param {number} azimuthAngle - Selected azimuth angle
 * @param {string} caseType - Type of case ('standard', 'no_ch4', 'no_haze')
 * @returns {Array} Plot data array
 */
export const createSpectralPlotData = (processedData, incidenceAngle, emissionAngle, azimuthAngle, caseType) => {
  if (!processedData || !processedData.wavelength) return [];

  const { wavelength, inc, emi, daz, standard, no_ch4, no_haze } = processedData;
  
  // Find the closest angle indices
  const incidenceIndex = inc ? findClosestAngleIndex(inc, incidenceAngle) : 0;
  const emissionIndex = emi ? findClosestAngleIndex(emi, emissionAngle) : 0;
  const azimuthIndex = daz ? findClosestAngleIndex(daz, azimuthAngle) : 0;

  // For sampled data, we need to find the correct spectrum index
  // The sampled data has fewer spectra, so we need to map the angle combination to the correct index
  const emissionLength = emi ? emi.length : 1;
  const azimuthLength = daz ? daz.length : 1;
  const angleIndex = incidenceIndex * emissionLength * azimuthLength + 
                     emissionIndex * azimuthLength + 
                     azimuthIndex;

  console.log(`Looking for spectrum at angles: ${incidenceAngle}°, ${emissionAngle}°, ${azimuthAngle}°`);
  console.log(`Calculated angle index: ${angleIndex} (max: ${(standard?.length || 0) - 1})`);

  // Get the spectral data for the selected case
  let spectralValues = [];
  switch (caseType) {
    case 'standard':
      spectralValues = standard && standard[angleIndex] ? standard[angleIndex] : [];
      break;
    case 'no_ch4':
      spectralValues = no_ch4 && no_ch4[angleIndex] ? no_ch4[angleIndex] : [];
      break;
    case 'no_haze':
      spectralValues = no_haze && no_haze[angleIndex] ? no_haze[angleIndex] : [];
      break;
    default:
      spectralValues = standard && standard[angleIndex] ? standard[angleIndex] : [];
  }

  console.log(`Found ${spectralValues.length} spectral values for ${caseType}`);

  // Create plot data
  return wavelength.map((w, i) => ({
    wavelength: w,
    intensity: spectralValues[i] || 0
  }));
};
