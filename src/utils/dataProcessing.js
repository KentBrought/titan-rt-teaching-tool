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

  // Don't create angleCombinations array - it's never used and would create millions of entries
  // We calculate the index directly in createSpectralPlotData when needed
  // This saves massive amounts of memory (343^3 = ~40 million entries would be created!)

  return {
    wavelength,
    inc,
    emi,
    daz,
    standard,
    no_ch4,
    no_haze
  };
};

/**
 * Get available angles from spectral data
 * @param {Object} spectralData - The spectral library data
 * @returns {Object} Available angles
 */
export const getAvailableAngles = (spectralData) => {
  if (!spectralData) return { incidence: [], emission: [], azimuth: [] };
  
  // Handle both TypedArrays and regular arrays
  const toArray = (arr) => {
    if (!arr) return [];
    if (arr instanceof Float32Array || arr instanceof Float64Array || Array.isArray(arr)) {
      return Array.from(arr);
    }
    return [];
  };
  
  return {
    incidence: [...new Set(toArray(spectralData.inc))],
    emission: [...new Set(toArray(spectralData.emi))],
    azimuth: [...new Set(toArray(spectralData.daz))]
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
  
  // Handle both TypedArrays and regular arrays
  const getValue = (arr, index) => arr[index];
  const getLength = (arr) => arr.length;
  
  // First try exact match
  const length = getLength(angleArray);
  let exactIndex = -1;
  for (let i = 0; i < length; i++) {
    if (Math.abs(getValue(angleArray, i) - targetAngle) < 1e-6) {
      exactIndex = i;
      break;
    }
  }
  if (exactIndex !== -1) return exactIndex;
  
  // Find closest match
  let closestIndex = 0;
  let minDiff = Math.abs(getValue(angleArray, 0) - targetAngle);
  
  for (let i = 1; i < length; i++) {
    const diff = Math.abs(getValue(angleArray, i) - targetAngle);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }
  
  console.log(`Closest match for ${targetAngle}°: ${getValue(angleArray, closestIndex)}° (index ${closestIndex})`);
  return closestIndex;
};

/**
 * Get the actual angles from data that are closest to the provided angles
 * @param {Object} processedData - Processed spectral data
 * @param {number} incidenceAngle - Target incidence angle
 * @param {number} emissionAngle - Target emission angle
 * @param {number} azimuthAngle - Target azimuth angle
 * @returns {Object} Object with actual incidence, emission, and azimuth angles
 */
export const getActualAngles = (processedData, incidenceAngle, emissionAngle, azimuthAngle) => {
  if (!processedData) return { incidence: 0, emission: 0, azimuth: 0 };

  const { inc, emi, daz } = processedData;
  
  // Find the closest angle indices
  const incidenceIndex = inc ? findClosestAngleIndex(inc, incidenceAngle) : 0;
  const emissionIndex = emi ? findClosestAngleIndex(emi, emissionAngle) : 0;
  const azimuthIndex = daz ? findClosestAngleIndex(daz, azimuthAngle) : 0;

  // Return the actual angles from the data (handle both TypedArrays and regular arrays)
  const getValue = (arr, index) => arr && arr[index] !== undefined ? arr[index] : undefined;
  
  return {
    incidence: getValue(inc, incidenceIndex) ?? incidenceAngle,
    emission: getValue(emi, emissionIndex) ?? emissionAngle,
    azimuth: getValue(daz, azimuthIndex) ?? azimuthAngle
  };
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
  if (!processedData || !processedData.wavelength) return { wavelengths: [], intensities: [] };

  const { wavelength, inc, emi, daz, standard, no_ch4, no_haze } = processedData;
  
  // The inc, emi, daz arrays contain the angle values for each spectrum (343 elements each)
  // We need to find the spectrum index that matches the requested angles
  // Search for the closest matching spectrum
  const getValue = (arr, index) => arr && arr[index] !== undefined ? arr[index] : undefined;
  const getLength = (arr) => arr ? arr.length : 0;
  
  const numSpectra = getLength(inc);
  let bestMatchIndex = -1;
  let minDistance = Infinity;
  
  // Find the spectrum with angles closest to the requested angles
  for (let i = 0; i < numSpectra; i++) {
    const incVal = getValue(inc, i);
    const emiVal = getValue(emi, i);
    const dazVal = getValue(daz, i);
    
    if (incVal === undefined || emiVal === undefined || dazVal === undefined) continue;
    
    // Calculate distance (sum of squared differences)
    const distance = Math.pow(incVal - incidenceAngle, 2) + 
                     Math.pow(emiVal - emissionAngle, 2) + 
                     Math.pow(dazVal - azimuthAngle, 2);
    
    if (distance < minDistance) {
      minDistance = distance;
      bestMatchIndex = i;
    }
  }

  const angleIndex = bestMatchIndex;

  console.log(`Looking for spectrum at angles: ${incidenceAngle}°, ${emissionAngle}°, ${azimuthAngle}°`);
  if (angleIndex >= 0) {
    const foundInc = getValue(inc, angleIndex);
    const foundEmi = getValue(emi, angleIndex);
    const foundDaz = getValue(daz, angleIndex);
    console.log(`Found spectrum at index ${angleIndex} with angles: ${foundInc}°, ${foundEmi}°, ${foundDaz}° (max: ${(standard?.length || 0) - 1})`);
    
    // Check if any angle difference is greater than 10 degrees
    const incDiff = Math.abs(foundInc - incidenceAngle);
    const emiDiff = Math.abs(foundEmi - emissionAngle);
    const dazDiff = Math.abs(foundDaz - azimuthAngle);
    
    if (incDiff > 10 || emiDiff > 10 || dazDiff > 10) {
      console.log(`Angle differences too large: incidence ${incDiff.toFixed(2)}°, emission ${emiDiff.toFixed(2)}°, azimuth ${dazDiff.toFixed(2)}° - returning empty data`);
      return { wavelengths: [], intensities: [] };
    }
  } else {
    console.log(`No matching spectrum found (max: ${(standard?.length || 0) - 1})`);
  }

  // Get the spectral data for the selected case
  // Handle both TypedArrays and regular arrays
  let spectralValues = null;
  if (angleIndex >= 0) {
    switch (caseType) {
      case 'standard':
        spectralValues = standard && standard[angleIndex] ? standard[angleIndex] : null;
        break;
      case 'no_ch4':
        spectralValues = no_ch4 && no_ch4[angleIndex] ? no_ch4[angleIndex] : null;
        break;
      case 'no_haze':
        spectralValues = no_haze && no_haze[angleIndex] ? no_haze[angleIndex] : null;
        break;
      default:
        spectralValues = standard && standard[angleIndex] ? standard[angleIndex] : null;
    }
  }

  if (!spectralValues) {
    console.warn(`No spectral values found for ${caseType} at angle index ${angleIndex}`);
    return { wavelengths: [], intensities: [] };
  }

  // Return arrays directly for scattergl - no need for object structure
  // This avoids creating intermediate objects and reduces memory usage
  const spectralArray = spectralValues;
  const wavelengthArray = wavelength;

  // Return arrays directly - scattergl can use them as-is
  // This is much more memory efficient than creating objects
  const length = Math.min(wavelengthArray.length, spectralArray.length);
  
  // Return as object with arrays for compatibility, but don't create per-point objects
  return {
    wavelengths: wavelengthArray.slice(0, length),
    intensities: spectralArray.slice(0, length)
  };
};
