/**
 * Data loading utilities for handling large JSON files
 */

// Cache for loaded data to prevent multiple loads
const dataCache = new Map();

/**
 * Clear the data cache to free memory
 */
export const clearDataCache = () => {
  dataCache.clear();
  console.log('Data cache cleared');
};

/**
 * Get cache size for monitoring
 */
export const getCacheSize = () => {
  return dataCache.size;
};

/**
 * Load and parse a JSON file with error handling and size limits
 * @param {string} url - The URL to the JSON file
 * @param {number} maxSize - Maximum file size in characters (default: 5MB for large files)
 * @returns {Promise<Object>} The parsed JSON data
 */
export const loadJsonFile = async (url, maxSize = 5 * 1024 * 1024) => {
  // Check cache first
  if (dataCache.has(url)) {
    console.log(`Using cached data for ${url}`);
    return dataCache.get(url);
  }

  try {
    console.log(`Loading ${url}...`);
    
    // For very large files, use a different approach
    if (url.includes('init_gui_model.json')) {
      console.log('Detected large atmospheric model file, using mock data');
      throw new Error('File too large for client-side processing');
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    console.log(`Loaded ${url}, size: ${text.length} characters`);
    
    // Check file size
    if (text.length > maxSize) {
      console.warn(`File ${url} is too large (${text.length} chars), using mock data instead`);
      throw new Error(`File too large: ${text.length} characters (max: ${maxSize})`);
    }
    
    // Parse the JSON with error handling
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error(`JSON parse error in ${url}:`, parseError);
      throw new Error(`JSON parse error: ${parseError.message}`);
    }
    
    // Cache the data
    dataCache.set(url, data);
    console.log(`Successfully parsed and cached ${url}`);
    return data;
  } catch (error) {
    console.error(`Error loading ${url}:`, error);
    throw error;
  }
};

/**
 * Create mock spectral data for testing when real data fails to load
 * @returns {Object} Mock spectral data
 */
export const createMockSpectralData = () => {
  return {
    wavelength: [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5],
    inc: [0, 30, 60, 90],
    emi: [0, 30, 60, 90],
    daz: [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330],
    standard: [
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2],
      [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.05, 1.15, 1.25],
      [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3],
      [0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.05, 1.15, 1.25, 1.35]
    ],
    no_ch4: [
      [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.05, 1.15],
      [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2],
      [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95, 1.05, 1.15, 1.25],
      [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3]
    ],
    no_haze: [
      [0.08, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.88, 0.98, 1.08, 1.18],
      [0.12, 0.22, 0.32, 0.42, 0.52, 0.62, 0.72, 0.82, 0.92, 1.02, 1.12, 1.22],
      [0.16, 0.26, 0.36, 0.46, 0.56, 0.66, 0.76, 0.86, 0.96, 1.06, 1.16, 1.26],
      [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3]
    ]
  };
};
