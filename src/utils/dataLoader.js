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
  // Force garbage collection if available
  if (window.gc) {
    window.gc();
  }
  console.log('Data cache cleared');
};

/**
 * Get cache size for monitoring
 */
export const getCacheSize = () => {
  return dataCache.size;
};

/**
 * Get memory usage information
 */
export const getMemoryInfo = () => {
  if (performance.memory) {
    return {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB',
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + ' MB',
      limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + ' MB'
    };
  }
  return null;
};

/**
 * Sample data to reduce memory usage
 * @param {Object} data - The full dataset
 * @param {number} maxPoints - Maximum number of points to keep
 * @returns {Object} Sampled data
 */
const sampleData = (data, maxPoints = 100) => {
  if (!data || !data.wavelength) return data;
  
  const { wavelength, standard, no_ch4, no_haze, inc, emi, daz } = data;
  
  // Calculate sampling step
  const step = Math.max(1, Math.floor(wavelength.length / maxPoints));
  
  // Sample wavelengths evenly across the range
  const sampledWavelength = [];
  for (let i = 0; i < wavelength.length; i += step) {
    sampledWavelength.push(wavelength[i]);
  }
  
  // If we don't have enough points, add the last wavelength
  if (sampledWavelength.length < maxPoints && wavelength.length > 0) {
    sampledWavelength.push(wavelength[wavelength.length - 1]);
  }
  
  console.log('Wavelength sampling info:');
  console.log(`Original wavelength range: ${wavelength[0]} - ${wavelength[wavelength.length - 1]} μm (${wavelength.length} points)`);
  console.log(`Sampled wavelength range: ${sampledWavelength[0]} - ${sampledWavelength[sampledWavelength.length - 1]} μm (${sampledWavelength.length} points)`);
  console.log(`Sampling step: ${step} (every ${step} points)`);
  console.log('First 10 sampled wavelengths:', sampledWavelength.slice(0, 10));
  console.log('Last 10 sampled wavelengths:', sampledWavelength.slice(-10));
  
  // Sample spectral data - keep all spectra but sample wavelengths
  const sampleSpectralArray = (spectralArray) => {
    if (!spectralArray) return [];
    return spectralArray.map(spectrum => {
      if (!spectrum) return [];
      const sampled = [];
      for (let i = 0; i < spectrum.length; i += step) {
        sampled.push(spectrum[i]);
      }
      return sampled;
    });
  };
  
  // Get unique angle values instead of sampling the arrays
  const uniqueInc = [...new Set(inc || [])];
  const uniqueEmi = [...new Set(emi || [])];
  const uniqueDaz = [...new Set(daz || [])];
  
  console.log('Original angle arrays:', { 
    inc: inc?.length, 
    emi: emi?.length, 
    daz: daz?.length 
  });
  console.log('Unique angles:', { 
    inc: uniqueInc, 
    emi: uniqueEmi, 
    daz: uniqueDaz 
  });
  
  return {
    wavelength: sampledWavelength,
    inc: uniqueInc,
    emi: uniqueEmi,
    daz: uniqueDaz,
    standard: sampleSpectralArray(standard),
    no_ch4: sampleSpectralArray(no_ch4),
    no_haze: sampleSpectralArray(no_haze)
  };
};

/**
 * Load and parse a JSON file with error handling and size limits
 * @param {string} url - The URL to the JSON file
 * @param {number} maxSize - Maximum file size in characters (default: 5MB for large files)
 * @returns {Promise<Object>} The parsed JSON data
 */
export const loadJsonFile = async (url, maxSize = 50 * 1024 * 1024) => {
  // Check cache first
  if (dataCache.has(url)) {
    console.log(`Using cached data for ${url}`);
    return dataCache.get(url);
  }

  try {
    console.log(`Loading ${url}...`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const text = await response.text();
    console.log(`Loaded ${url}, size: ${text.length} characters`);
    
    // Check file size - increased limit for real data
    if (text.length > maxSize) {
      console.warn(`File ${url} is very large (${text.length} chars), but attempting to parse...`);
    }
    
    // Parse the JSON with error handling
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      console.error(`JSON parse error in ${url}:`, parseError);
      throw new Error(`JSON parse error: ${parseError.message}`);
    }
    
    // Sample the data to reduce memory usage
    if (url.includes('init_gui_library.json')) {
      console.log('Sampling spectral data to reduce memory usage...');
      data = sampleData(data, 100);
      console.log(`Sampled data: ${data.wavelength.length} wavelengths, ${data.standard.length} spectra`);
      
      // Check memory usage after sampling
      const memoryInfo = getMemoryInfo();
      if (memoryInfo && parseInt(memoryInfo.used) > 100) { // More than 100MB
        throw new Error('Memory usage too high after data sampling');
      }
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

