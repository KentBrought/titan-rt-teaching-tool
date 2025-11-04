/**
 * Utility functions for loading and parsing PDS4 geo cube files
 * Geo cubes contain 9 layers (bands) of geospatial data
 * Layers: 0=lat, 1=lon, 2=xres, 3=yres, 4=phase, 5=incidence, 6=emis, 7=azimuth, 8=distance
 */

/**
 * Load geo cube data from a .img file
 * @param {number} phaseAngle - Phase angle in degrees
 * @returns {Promise<ArrayBuffer>} ArrayBuffer containing the geo cube data
 */
export const loadGeoCubeFile = async (phaseAngle) => {
  const paddedPhase = String(Math.round(phaseAngle)).padStart(3, '0');
  const filename = `2012_A0.1_p${paddedPhase}_geo.img`;
  const url = `/assets/raw/${filename}`;
  
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load geo cube: ${response.status}`);
    }
    return await response.arrayBuffer();
  } catch (error) {
    console.error(`Error loading geo cube file ${filename}:`, error);
    throw error;
  }
};

/**
 * Parse geo cube data from ArrayBuffer
 * Geo cube structure: [9 bands, 681 lines, 681 samples]
 * Data type: IEEE754LSBSingle (32-bit float, little-endian)
 * Layout: Last Index Fastest (Sample fastest, then Line, then Band)
 * @param {ArrayBuffer} buffer - The binary data buffer
 * @returns {Float32Array} 1D array with data in [band][line][sample] order
 */
export const parseGeoCube = (buffer) => {
  // The data is stored as 32-bit floats (4 bytes each)
  // Total size: 9 * 681 * 681 * 4 = 16,695,396 bytes
  const view = new DataView(buffer);
  const numBands = 9;
  const numLines = 681;
  const numSamples = 681;
  const totalElements = numBands * numLines * numSamples;
  const data = new Float32Array(totalElements);
  
  // Read the data (little-endian 32-bit floats)
  for (let i = 0; i < totalElements; i++) {
    data[i] = view.getFloat32(i * 4, true); // true = little-endian
  }
  
  return data;
};

/**
 * Get value from geo cube at specific position and band
 * @param {Float32Array} geoCubeData - Parsed geo cube data (1D array)
 * @param {number} x - Sample coordinate (0-680)
 * @param {number} y - Line coordinate (0-680)
 * @param {number} band - Band index (0-8)
 * @returns {number} The value at the specified position
 */
export const getGeoValue = (geoCubeData, x, y, band) => {
  const numBands = 9;
  const numLines = 681;
  const numSamples = 681;
  
  // Clamp and validate coordinates
  const clampedX = Math.max(0, Math.min(Math.floor(x), numSamples - 1));
  const clampedY = Math.max(0, Math.min(Math.floor(y), numLines - 1));
  const clampedBand = Math.max(0, Math.min(Math.floor(band), numBands - 1));
  
  if (clampedX !== x || clampedY !== y || clampedBand !== band) {
    console.warn(`Coordinates clamped: (${x}, ${y}, ${band}) -> (${clampedX}, ${clampedY}, ${clampedBand})`);
  }
  
  // Calculate index: [band][line][sample] order (Last Index Fastest = sample changes fastest)
  const index = clampedBand * numLines * numSamples + clampedY * numSamples + clampedX;
  
  if (index < 0 || index >= geoCubeData.length) {
    console.error(`Invalid index ${index} for array length ${geoCubeData.length}`);
    return null;
  }
  
  return geoCubeData[index];
};

/**
 * Extract values from layers 0, 1, 4, 5, and 6 at a specific position
 * @param {number} phaseAngle - Phase angle in degrees
 * @param {number} x - Sample coordinate (0-680)
 * @param {number} y - Line coordinate (0-680)
 * @returns {Promise<Object>} Object with lat, lon, phase, incidence, and emis values
 */
export const extractGeoValues = async (phaseAngle, x, y) => {
  try {
    const buffer = await loadGeoCubeFile(phaseAngle);
    const geoData = parseGeoCube(buffer);
    
    const lat = getGeoValue(geoData, x, y, 0);         // Layer 0: lat (negative = North)
    const lon = getGeoValue(geoData, x, y, 1);       // Layer 1: lon (negative = West)
    const phase = getGeoValue(geoData, x, y, 4);      // Layer 4: phase (Deg)
    const incidence = getGeoValue(geoData, x, y, 5);   // Layer 5: incidence (Deg)
    const emis = getGeoValue(geoData, x, y, 6);       // Layer 6: emis (Deg)
    
    return {
      lat: lat !== null ? lat : null,
      lon: lon !== null ? lon : null,
      phase: phase !== null ? phase : null,
      incidence: incidence !== null ? incidence : null,
      emis: emis !== null ? emis : null,
      x,
      y
    };
  } catch (error) {
    console.error('Error extracting geo values:', error);
    return {
      lat: null,
      lon: null,
      phase: null,
      incidence: null,
      emis: null,
      x,
      y,
      error: error.message
    };
  }
};

