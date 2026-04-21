/**
 * Data processing utilities for PyDISORT spectral and atmospheric data
 * Updated to support albedo dimension
 */

/**
 * Process spectral library data for visualization
 * Handles both old format (343 spectra with inc/emi/daz arrays) and new format (with albedo)
 * @param {Object} spectralData - The spectral library JSON data
 * @returns {Object} Processed data with wavelength and spectral arrays
 */
export const processSpectralData = (spectralData) => {
  if (!spectralData) return null;

  // Check if this is the new format with albedo
  if (spectralData.data && spectralData.albedo) {
    // New format with albedo
    const { wavelength, inc, emi, daz, albedo, data } = spectralData;
    
    return {
      wavelength,
      inc,
      emi,
      daz,
      albedo,
      data,
      isNewFormat: true
    };
  } else {
    // Old format without albedo
    const { wavelength, inc, emi, daz, standard, no_ch4, no_haze } = spectralData;

    return {
      wavelength,
      inc,
      emi,
      daz,
      standard,
      no_ch4,
      no_haze,
      isNewFormat: false
    };
  }
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
  
  // For new format, inc/emi/daz are already unique arrays
  // For old format, we need to get unique values
  if (spectralData.isNewFormat) {
    return {
      incidence: toArray(spectralData.inc),
      emission: toArray(spectralData.emi),
      azimuth: toArray(spectralData.daz)
    };
  }
  
  return {
    incidence: [...new Set(toArray(spectralData.inc))],
    emission: [...new Set(toArray(spectralData.emi))],
    azimuth: [...new Set(toArray(spectralData.daz))]
  };
};

/**
 * Find the closest angle value in an array and return its index
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

  const { inc, emi, daz, isNewFormat } = processedData;
  
  if (isNewFormat) {
    // New format: inc/emi/daz are unique angle arrays
    const incidenceIndex = findClosestAngleIndex(inc, incidenceAngle);
    const emissionIndex = findClosestAngleIndex(emi, emissionAngle);
    const azimuthIndex = findClosestAngleIndex(daz, azimuthAngle);
    
    return {
      incidence: inc[incidenceIndex] ?? incidenceAngle,
      emission: emi[emissionIndex] ?? emissionAngle,
      azimuth: daz[azimuthIndex] ?? azimuthAngle
    };
  } else {
    // Old format: find closest match in the 343 combinations
    const incidenceIndex = inc ? findClosestAngleIndex(inc, incidenceAngle) : 0;
    const emissionIndex = emi ? findClosestAngleIndex(emi, emissionAngle) : 0;
    const azimuthIndex = daz ? findClosestAngleIndex(daz, azimuthAngle) : 0;

    const getValue = (arr, index) => arr && arr[index] !== undefined ? arr[index] : undefined;
    
    return {
      incidence: getValue(inc, incidenceIndex) ?? incidenceAngle,
      emission: getValue(emi, emissionIndex) ?? emissionAngle,
      azimuth: getValue(daz, azimuthIndex) ?? azimuthAngle
    };
  }
};

/**
 * Calculate the flat index for a 3D angle combination in the new format
 * The data is stored as a flat array where the indices correspond to:
 * index = inc_idx * (num_emi * num_az) + emi_idx * num_az + az_idx
 * @param {number} incIdx - Incidence angle index
 * @param {number} emiIdx - Emission angle index
 * @param {number} azIdx - Azimuth angle index
 * @param {number} numEmi - Number of emission angles
 * @param {number} numAz - Number of azimuth angles
 * @returns {number} Flat array index
 */
const calculateFlatIndex = (incIdx, emiIdx, azIdx, numEmi, numAz) => {
  return incIdx * (numEmi * numAz) + emiIdx * numAz + azIdx;
};

/**
 * Create spectral plot data for a specific angle combination and case
 * @param {Object} processedData - Processed spectral data
 * @param {number} incidenceAngle - Selected incidence angle
 * @param {number} emissionAngle - Selected emission angle
 * @param {number} azimuthAngle - Selected azimuth angle
 * @param {string} caseType - Type of case ('standard', 'no_ch4', 'no_haze')
 * @param {number} albedo - Albedo value (0, 0.1, or 0.2) - only used for new format
 * @returns {Object} Plot data with wavelengths and intensities arrays
 */
export const createSpectralPlotData = (processedData, incidenceAngle, emissionAngle, azimuthAngle, caseType, albedo = 0.1) => {
  if (!processedData || !processedData.wavelength) return { wavelengths: [], intensities: [] };
  // Invalid/off-disc geo samples can produce NaN angles. Never map those to a spectrum.
  if (!Number.isFinite(incidenceAngle) || !Number.isFinite(emissionAngle) || !Number.isFinite(azimuthAngle)) {
    return { wavelengths: [], intensities: [] };
  }

  const { wavelength, inc, emi, daz, isNewFormat } = processedData;

  if (isNewFormat) {
    // New format with albedo
    return createSpectralPlotDataNewFormat(processedData, incidenceAngle, emissionAngle, azimuthAngle, caseType, albedo);
  } else {
    // Old format without albedo
    return createSpectralPlotDataOldFormat(processedData, incidenceAngle, emissionAngle, azimuthAngle, caseType);
  }
};

/**
 * Create spectral plot data for the new format with albedo
 */
const createSpectralPlotDataNewFormat = (processedData, incidenceAngle, emissionAngle, azimuthAngle, caseType, albedo) => {
  const { wavelength, inc, emi, daz, data } = processedData;
  
  // Find closest angle indices
  const incIdx = findClosestAngleIndex(inc, incidenceAngle);
  const emiIdx = findClosestAngleIndex(emi, emissionAngle);
  const azIdx = findClosestAngleIndex(daz, azimuthAngle);
  
  // Check if angle differences are too large (> 10 degrees)
  const incDiff = Math.abs(inc[incIdx] - incidenceAngle);
  const emiDiff = Math.abs(emi[emiIdx] - emissionAngle);
  const azDiff = Math.abs(daz[azIdx] - azimuthAngle);
  
  if (incDiff > 10 || emiDiff > 10 || azDiff > 10) {
    console.log(`Angle differences too large: incidence ${incDiff.toFixed(2)}°, emission ${emiDiff.toFixed(2)}°, azimuth ${azDiff.toFixed(2)}° - returning empty data`);
    return { wavelengths: [], intensities: [] };
  }
  
  // Calculate flat index
  const numEmi = emi.length;
  const numAz = daz.length;
  const flatIndex = calculateFlatIndex(incIdx, emiIdx, azIdx, numEmi, numAz);
  
  // Get the albedo key
  const albedoKey = `albedo_${albedo}`;
  
  // Check if albedo data exists
  if (!data[albedoKey]) {
    const fallbackKey = 'albedo_0.1';
    if (!data[fallbackKey]) {
      console.error('No albedo data found');
      return { wavelengths: [], intensities: [] };
    }
  }
  
  const albedoData = data[albedoKey] || data['albedo_0.1'];
  
  // Get spectral values for the case type
  let spectralValues = null;
  switch (caseType) {
    case 'standard':
      spectralValues = albedoData.standard?.[flatIndex];
      break;
    case 'no_ch4':
      spectralValues = albedoData.no_ch4?.[flatIndex];
      break;
    case 'no_haze':
      spectralValues = albedoData.no_haze?.[flatIndex];
      break;
    default:
      spectralValues = albedoData.standard?.[flatIndex];
  }
  
  if (!spectralValues) {
    return { wavelengths: [], intensities: [] };
  }
  
  const length = Math.min(wavelength.length, spectralValues.length);
  
  return {
    wavelengths: wavelength.slice(0, length),
    intensities: spectralValues.slice(0, length)
  };
};

/**
 * Create spectral plot data for the old format without albedo
 */
const createSpectralPlotDataOldFormat = (processedData, incidenceAngle, emissionAngle, azimuthAngle, caseType) => {
  const { wavelength, inc, emi, daz, standard, no_ch4, no_haze } = processedData;
  
  // The inc, emi, daz arrays contain the angle values for each spectrum (343 elements each)
  // We need to find the spectrum index that matches the requested angles
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

  if (angleIndex >= 0) {
    const foundInc = getValue(inc, angleIndex);
    const foundEmi = getValue(emi, angleIndex);
    const foundDaz = getValue(daz, angleIndex);
    
    // Check if any angle difference is greater than 10 degrees
    const incDiff = Math.abs(foundInc - incidenceAngle);
    const emiDiff = Math.abs(foundEmi - emissionAngle);
    const dazDiff = Math.abs(foundDaz - azimuthAngle);
    
    if (incDiff > 10 || emiDiff > 10 || dazDiff > 10) {
      return { wavelengths: [], intensities: [] };
    }
  } else {
    return { wavelengths: [], intensities: [] };
  }

  // Get the spectral data for the selected case
  let spectralValues = null;
  switch (caseType) {
    case 'standard':
      spectralValues = standard?.[angleIndex];
      break;
    case 'no_ch4':
      spectralValues = no_ch4?.[angleIndex];
      break;
    case 'no_haze':
      spectralValues = no_haze?.[angleIndex];
      break;
    default:
      spectralValues = standard?.[angleIndex];
  }

  if (!spectralValues) {
    return { wavelengths: [], intensities: [] };
  }

  const length = Math.min(wavelength.length, spectralValues.length);
  
  return {
    wavelengths: wavelength.slice(0, length),
    intensities: spectralValues.slice(0, length)
  };
};