/**
 * Data processing utilities for PyDISORT spectral and atmospheric data
 * Supports old format, albedo format, and gui_v3 7D format.
 */

/**
 * Process spectral library data for visualization
 */
export const processSpectralData = (spectralData) => {
  if (!spectralData) return null;

  // 1. Format: gui_v3 (7D array with haze, methane, surface class)
  if (spectralData.format === 'gui_v3' || (spectralData.spectra && spectralData.haze_scale)) {
    return {
      wavelength: spectralData.wavelength,
      inc: spectralData.inc,
      emi: spectralData.emi,
      daz: spectralData.azimuth || spectralData.daz,
      haze_scale: spectralData.haze_scale,
      methane_scale: spectralData.methane_scale,
      surface_class: spectralData.surface_class,
      spectra: spectralData.spectra,
      isGuiV3: true,
      isNewFormat: false,
    };
  }

  // 2. Format: Albedo dictionary
  if (spectralData.data && spectralData.albedo) {
    const { wavelength, inc, emi, daz, albedo, data } = spectralData;
    return {
      wavelength,
      inc,
      emi,
      daz,
      albedo,
      data,
      isGuiV3: false,
      isNewFormat: true,
    };
  }

  // 3. Format: Legacy flat
  const { wavelength, inc, emi, daz, standard, no_ch4, no_haze } = spectralData;
  return {
    wavelength,
    inc,
    emi,
    daz,
    standard,
    no_ch4,
    no_haze,
    isGuiV3: false,
    isNewFormat: false,
  };
};

/**
 * Get available angles from spectral data
 */
export const getAvailableAngles = (spectralData) => {
  if (!spectralData) return { incidence: [], emission: [], azimuth: [] };

  const toArray = (arr) => {
    if (!arr) return [];
    if (arr instanceof Float32Array || arr instanceof Float64Array || Array.isArray(arr)) {
      return Array.from(arr);
    }
    return [];
  };

  if (spectralData.isGuiV3 || spectralData.isNewFormat) {
    return {
      incidence: toArray(spectralData.inc),
      emission: toArray(spectralData.emi),
      azimuth: toArray(spectralData.daz || spectralData.azimuth),
    };
  }

  return {
    incidence: [...new Set(toArray(spectralData.inc))],
    emission: [...new Set(toArray(spectralData.emi))],
    azimuth: [...new Set(toArray(spectralData.daz || spectralData.azimuth))],
  };
};

/**
 * Find the closest value in an array and return its index
 */
export const findClosestAngleIndex = (angleArray, targetAngle) => {
  if (!angleArray || angleArray.length === 0) return 0;

  let exactIndex = -1;
  for (let i = 0; i < angleArray.length; i++) {
    if (Math.abs(angleArray[i] - targetAngle) < 1e-6) {
      exactIndex = i;
      break;
    }
  }
  if (exactIndex !== -1) return exactIndex;

  let closestIndex = 0;
  let minDiff = Math.abs(angleArray[0] - targetAngle);

  for (let i = 1; i < angleArray.length; i++) {
    const diff = Math.abs(angleArray[i] - targetAngle);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }

  return closestIndex;
};

export const getActualAngles = (processedData, incidenceAngle, emissionAngle, azimuthAngle) => {
  if (!processedData) return { incidence: 0, emission: 0, azimuth: 0 };

  const { inc, emi, daz, isGuiV3, isNewFormat } = processedData;

  if (isGuiV3 || isNewFormat) {
    const incidenceIndex = findClosestAngleIndex(inc, incidenceAngle);
    const emissionIndex = findClosestAngleIndex(emi, emissionAngle);
    const azimuthIndex = findClosestAngleIndex(daz, azimuthAngle);

    return {
      incidence: inc[incidenceIndex] ?? incidenceAngle,
      emission: emi[emissionIndex] ?? emissionAngle,
      azimuth: daz[azimuthIndex] ?? azimuthAngle,
    };
  }

  const incidenceIndex = inc ? findClosestAngleIndex(inc, incidenceAngle) : 0;
  const emissionIndex = emi ? findClosestAngleIndex(emi, emissionAngle) : 0;
  const azimuthIndex = daz ? findClosestAngleIndex(daz, azimuthAngle) : 0;

  return {
    incidence: inc?.[incidenceIndex] ?? incidenceAngle,
    emission: emi?.[emissionIndex] ?? emissionAngle,
    azimuth: daz?.[azimuthIndex] ?? azimuthAngle,
  };
};

const calculateFlatIndex = (incIdx, emiIdx, azIdx, numEmi, numAz) => {
  return incIdx * (numEmi * numAz) + emiIdx * numAz + azIdx;
};

/**
 * Main dispatcher to create spectral plot data
 */
export const createSpectralPlotData = (
  processedData,
  incidenceAngle,
  emissionAngle,
  azimuthAngle,
  caseType,
  albedo = 0.1,
  options = {}
) => {
  if (!processedData || !processedData.wavelength) return { wavelengths: [], intensities: [] };
  if (!Number.isFinite(incidenceAngle) || !Number.isFinite(emissionAngle) || !Number.isFinite(azimuthAngle)) {
    return { wavelengths: [], intensities: [] };
  }

  if (processedData.isGuiV3) {
    return createSpectralPlotDataGuiV3(
      processedData,
      incidenceAngle,
      emissionAngle,
      azimuthAngle,
      caseType,
      options.hazeAbundance ?? 1.0,
      options.methaneAbundance ?? 1.0,
      options.surfaceClass ?? 0
    );
  }

  if (processedData.isNewFormat) {
    return createSpectralPlotDataNewFormat(
      processedData,
      incidenceAngle,
      emissionAngle,
      azimuthAngle,
      caseType,
      albedo
    );
  }

  return createSpectralPlotDataOldFormat(
    processedData,
    incidenceAngle,
    emissionAngle,
    azimuthAngle,
    caseType
  );
};

/**
 * Handler for GUI v3 (7D array)
 */
const createSpectralPlotDataGuiV3 = (
  processedData,
  incidenceAngle,
  emissionAngle,
  azimuthAngle,
  caseType,
  hazeValue = 1.0,
  methaneValue = 1.0,
  surfaceClass = 0
) => {
  const { wavelength, inc, emi, daz, haze_scale, methane_scale, surface_class, spectra } = processedData;

  // 1. Determine Haze and Methane targets based on caseType override or slider values
  let targetHaze = caseType === 'no_haze' ? 0.0 : hazeValue;
  let targetMethane = caseType === 'no_ch4' ? 0.0 : methaneValue;

  const hazeIdx = findClosestAngleIndex(haze_scale, targetHaze);
  const methaneIdx = findClosestAngleIndex(methane_scale, targetMethane);
  const surfIdx = findClosestAngleIndex(surface_class, surfaceClass);

  // 2. Find angle indices
  const incIdx = findClosestAngleIndex(inc, incidenceAngle);
  const emiIdx = findClosestAngleIndex(emi, emissionAngle);
  const azIdx = findClosestAngleIndex(daz, azimuthAngle);

  // 3. Extract 1D spectral array directly from nested 7D matrix
  const spectralValues = spectra?.[hazeIdx]?.[methaneIdx]?.[surfIdx]?.[incIdx]?.[emiIdx]?.[azIdx];

  if (!spectralValues || !Array.isArray(spectralValues)) {
    return { wavelengths: [], intensities: [] };
  }

  const length = Math.min(wavelength.length, spectralValues.length);
  return {
    wavelengths: wavelength.slice(0, length),
    intensities: spectralValues.slice(0, length),
  };
};

/**
 * Handler for multi-albedo dictionary format
 */
const createSpectralPlotDataNewFormat = (
  processedData,
  incidenceAngle,
  emissionAngle,
  azimuthAngle,
  caseType,
  albedo
) => {
  const { wavelength, inc, emi, daz, data } = processedData;

  const incIdx = findClosestAngleIndex(inc, incidenceAngle);
  const emiIdx = findClosestAngleIndex(emi, emissionAngle);
  const azIdx = findClosestAngleIndex(daz, azimuthAngle);

  const numEmi = emi.length;
  const numAz = daz.length;
  const flatIndex = calculateFlatIndex(incIdx, emiIdx, azIdx, numEmi, numAz);

  const albedoKey = `albedo_${albedo}`;
  const albedoData = data[albedoKey] || data['albedo_0.1'] || data['albedo_0'] || Object.values(data)[0];

  if (!albedoData) return { wavelengths: [], intensities: [] };

  let spectralValues = null;
  switch (caseType) {
    case 'no_ch4':
      spectralValues = albedoData.no_ch4?.[flatIndex];
      break;
    case 'no_haze':
      spectralValues = albedoData.no_haze?.[flatIndex];
      break;
    case 'standard':
    default:
      spectralValues = albedoData.standard?.[flatIndex];
      break;
  }

  if (!spectralValues) return { wavelengths: [], intensities: [] };

  const length = Math.min(wavelength.length, spectralValues.length);
  return {
    wavelengths: wavelength.slice(0, length),
    intensities: spectralValues.slice(0, length),
  };
};

/**
 * Handler for legacy flat format
 */
const createSpectralPlotDataOldFormat = (
  processedData,
  incidenceAngle,
  emissionAngle,
  azimuthAngle,
  caseType
) => {
  const { wavelength, inc, emi, daz, standard, no_ch4, no_haze } = processedData;

  const numSpectra = inc ? inc.length : 0;
  let bestMatchIndex = -1;
  let minDistance = Infinity;

  for (let i = 0; i < numSpectra; i++) {
    const incVal = inc[i];
    const emiVal = emi[i];
    const dazVal = daz[i];
    if (incVal === undefined || emiVal === undefined || dazVal === undefined) continue;

    const distance =
      Math.pow(incVal - incidenceAngle, 2) +
      Math.pow(emiVal - emissionAngle, 2) +
      Math.pow(dazVal - azimuthAngle, 2);

    if (distance < minDistance) {
      minDistance = distance;
      bestMatchIndex = i;
    }
  }

  if (bestMatchIndex < 0) return { wavelengths: [], intensities: [] };

  let spectralValues = null;
  switch (caseType) {
    case 'no_ch4':
      spectralValues = no_ch4?.[bestMatchIndex];
      break;
    case 'no_haze':
      spectralValues = no_haze?.[bestMatchIndex];
      break;
    case 'standard':
    default:
      spectralValues = standard?.[bestMatchIndex];
      break;
  }

  if (!spectralValues) return { wavelengths: [], intensities: [] };

  const length = Math.min(wavelength.length, spectralValues.length);
  return {
    wavelengths: wavelength.slice(0, length),
    intensities: spectralValues.slice(0, length),
  };
};