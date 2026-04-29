/**
 * Utility functions for loading and parsing PDS4 geo cube files
 * Geo cubes contain 9 layers (bands) of geospatial data
 * Layers: 0=lat, 1=lon, 2=xres, 3=yres, 4=phase, 5=incidence, 6=emis, 7=azimuth, 8=distance
 */

// Cache for parsed geo cube data (by phase angle)
const geoCubeCache = new Map();

/**
 * Load geo cube data from a .img file
 * @param {number} phaseAngle - Phase angle in degrees
 * @returns {Promise<ArrayBuffer>} ArrayBuffer containing the geo cube data
 */
export const loadGeoCubeFile = async (phaseAngle) => {
  const paddedPhase = String(Math.round(phaseAngle)).padStart(3, '0');
  const filename = `2012_A0.1_p${paddedPhase}_geo.img`;
  const url = `/assets/dt/tomasko_1.0/${filename}`;
  
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
  if (!geoCubeData || typeof geoCubeData.length !== 'number') {
    return null;
  }
  const numBands = 9;
  const numLines = 681;
  const numSamples = 681;
  
  // Clamp and validate coordinates
  const clampedX = Math.max(0, Math.min(Math.floor(x), numSamples - 1));
  const clampedY = Math.max(0, Math.min(Math.floor(y), numLines - 1));
  const clampedBand = Math.max(0, Math.min(Math.floor(band), numBands - 1));
  
  // Calculate index: [band][line][sample] order (Last Index Fastest = sample changes fastest)
  const index = clampedBand * numLines * numSamples + clampedY * numSamples + clampedX;
  
  if (index < 0 || index >= geoCubeData.length) {
    console.error(`Invalid index ${index} for array length ${geoCubeData.length}`);
    return null;
  }
  
  return geoCubeData[index];
};

const toFiniteOrNull = (value) => (Number.isFinite(value) ? value : null);

const toFiniteInRangeOrNull = (value, min, max) => {
  if (!Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
};

const normalizeLongitudeDeg = (lonDeg) => {
  if (!Number.isFinite(lonDeg)) return null;
  return ((((lonDeg + 180) % 360) + 360) % 360) - 180;
};

const estimateLatLonFromGrid = (geoData, x, y, maxRadius = 24) => {
  if (!geoData) return { lat: null, lon: null };
  const centerX = Math.max(0, Math.min(680, Math.round(x)));
  const centerY = Math.max(0, Math.min(680, Math.round(y)));

  for (let radius = 0; radius <= maxRadius; radius += 1) {
    let weightedLat = 0;
    let weightedLonCos = 0;
    let weightedLonSin = 0;
    let weightTotal = 0;

    const minX = Math.max(0, centerX - radius);
    const maxX = Math.min(680, centerX + radius);
    const minY = Math.max(0, centerY - radius);
    const maxY = Math.min(680, centerY + radius);

    for (let yy = minY; yy <= maxY; yy += 1) {
      for (let xx = minX; xx <= maxX; xx += 1) {
        const lat = toFiniteInRangeOrNull(getGeoValue(geoData, xx, yy, 0), -90, 90);
        const lonRaw = toFiniteInRangeOrNull(getGeoValue(geoData, xx, yy, 1), -360, 360);
        const lon = normalizeLongitudeDeg(lonRaw);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

        const dx = xx - centerX;
        const dy = yy - centerY;
        const distance = Math.sqrt((dx * dx) + (dy * dy));
        const w = 1 / (1 + distance);

        weightedLat += lat * w;
        const lonRad = lon * (Math.PI / 180);
        weightedLonCos += Math.cos(lonRad) * w;
        weightedLonSin += Math.sin(lonRad) * w;
        weightTotal += w;
      }
    }

    if (weightTotal > 0) {
      const lat = weightedLat / weightTotal;
      const lon = Math.atan2(weightedLonSin, weightedLonCos) * (180 / Math.PI);
      return {
        lat: toFiniteInRangeOrNull(lat, -90, 90),
        lon: toFiniteInRangeOrNull(normalizeLongitudeDeg(lon), -180, 180),
      };
    }
  }

  return { lat: null, lon: null };
};

/**
 * Get or load parsed geo cube data for a phase angle (with caching)
 * @param {number} phaseAngle - Phase angle in degrees
 * @returns {Promise<Float32Array>} Parsed geo cube data
 */
export const getGeoCubeData = async (phaseAngle) => {
  const cacheKey = Math.round(phaseAngle);
  
  // Check cache first
  if (geoCubeCache.has(cacheKey)) {
    return geoCubeCache.get(cacheKey);
  }
  
  // Load and parse
  const buffer = await loadGeoCubeFile(phaseAngle);
  const geoData = parseGeoCube(buffer);
  
  // Cache the parsed data
  geoCubeCache.set(cacheKey, geoData);
  
  return geoData;
};

/**
 * Extract values from layers 0, 1, 4, 5, 6, and 7 at a specific position
 * @param {number} phaseAngle - Phase angle in degrees
 * @param {number} x - Sample coordinate (0-680)
 * @param {number} y - Line coordinate (0-680)
 * @returns {Promise<Object>} Object with lat, lon, phase, incidence, emis, and azimuth values
 */
export const extractGeoValues = async (phaseAngle, x, y) => {
  try {
    const geoData = await getGeoCubeData(phaseAngle);

    const rawLat = getGeoValue(geoData, x, y, 0);       // Layer 0: lat (negative = North)
    const rawLon = getGeoValue(geoData, x, y, 1);       // Layer 1: lon (negative = West)
    const rawPhase = getGeoValue(geoData, x, y, 4);     // Layer 4: phase (Deg)
    const rawIncidence = getGeoValue(geoData, x, y, 5); // Layer 5: incidence (Deg)
    const rawEmis = getGeoValue(geoData, x, y, 6);      // Layer 6: emis (Deg)
    const rawAzimuth = getGeoValue(geoData, x, y, 7);   // Layer 7: azimuth (Deg)

    const lat = toFiniteInRangeOrNull(rawLat, -90, 90);
    const lon = toFiniteInRangeOrNull(rawLon, -360, 360);
    const phase = toFiniteInRangeOrNull(rawPhase, 0, 360);
    const incidence = toFiniteInRangeOrNull(rawIncidence, 0, 180);
    const emis = toFiniteInRangeOrNull(rawEmis, 0, 180);
    const azimuth = toFiniteInRangeOrNull(rawAzimuth, -360, 360);
    const estimatedLatLon = (!Number.isFinite(lat) || !Number.isFinite(lon))
      ? estimateLatLonFromGrid(geoData, x, y)
      : { lat: null, lon: null };
    const resolvedLat = Number.isFinite(lat) ? lat : estimatedLatLon.lat;
    const resolvedLon = Number.isFinite(lon) ? lon : estimatedLatLon.lon;
    
    return {
      lat: resolvedLat,
      lon: resolvedLon,
      phase,
      incidence,
      emis,
      azimuth,
      x,
      y
    };
  } catch (error) {
    console.error('Error extracting geo values:', error);
    return {
      lat: null,
      lon: null,
      phase: toFiniteOrNull(phaseAngle),
      incidence: null,
      emis: null,
      azimuth: null,
      x,
      y,
      error: error.message
    };
  }
};
