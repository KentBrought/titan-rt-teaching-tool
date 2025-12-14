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
    
    let text = await response.text();
    console.log(`Loaded ${url}, size: ${text.length} characters`);
    
    // Check file size - increased limit for real data
    if (text.length > maxSize) {
      console.warn(`File ${url} is very large (${text.length} chars), but attempting to parse...`);
    }
    
    // Parse the JSON with error handling
    // For very large files, this might cause memory issues
    let data;
    try {
      // Check memory before parsing
      const memoryBefore = getMemoryInfo();
      if (memoryBefore) {
        console.log(`Memory before parsing: ${memoryBefore.used} / ${memoryBefore.limit}`);
      }
      
      // Use a try-catch around JSON.parse to catch memory errors
      const textLength = text.length; // Store length before clearing
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        // Clear text immediately if parse fails to free memory
        text = null;
        
        // Check if it's a memory-related error
        const errorMsg = parseErr.message || String(parseErr);
        if (errorMsg.toLowerCase().includes('memory') || 
            errorMsg.toLowerCase().includes('out of') ||
            parseErr.name === 'RangeError') {
          throw new Error(`Out of memory while parsing ${url} (${(textLength / 1024 / 1024).toFixed(2)}MB). The file is too large for your browser.`);
        }
        throw parseErr;
      }
      
      // Clear the text string to free memory immediately after parsing
      // This helps reduce peak memory usage
      text = null; // Allow GC to free the string immediately
      
      const memoryAfter = getMemoryInfo();
      if (memoryAfter) {
        console.log(`Memory after parsing: ${memoryAfter.used} / ${memoryAfter.limit}`);
        const usedMB = parseInt(memoryAfter.used);
        const limitMB = parseInt(memoryAfter.limit);
        if (usedMB > limitMB * 0.9) {
          console.warn(`Memory usage is very high (${usedMB}MB / ${limitMB}MB). Consider reducing dataset size.`);
        }
      }
    } catch (parseError) {
      console.error(`JSON parse error in ${url}:`, parseError);
      // Re-throw with better error message
      throw parseError;
    }
    
    // Keep spectral library data as-is (no conversion to avoid memory spikes)
    // Modern JS engines handle arrays efficiently, and conversion causes temporary memory doubling
    if (url.includes('init_gui_library.json')) {
      console.log('Loaded spectral data (keeping all wavelength points, no conversion)...');
      console.log(`Full data: ${data.wavelength?.length || 0} wavelengths, ${data.standard?.length || 0} spectra`);
      
      // Log memory usage for monitoring
      const memoryInfo = getMemoryInfo();
      if (memoryInfo) {
        console.log('Memory usage after loading:', memoryInfo);
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

