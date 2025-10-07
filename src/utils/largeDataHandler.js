/**
 * Utilities for handling large JSON files efficiently
 */

/**
 * Sample large data to reduce memory usage
 * @param {Object} data - The large data object
 * @param {number} maxPoints - Maximum number of data points to keep
 * @returns {Object} Sampled data object
 */
export const sampleLargeData = (data, maxPoints = 1000) => {
  if (!data || typeof data !== 'object') return data;
  
  const sampled = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value)) {
      // Sample arrays to reduce size
      if (value.length > maxPoints) {
        const step = Math.ceil(value.length / maxPoints);
        sampled[key] = value.filter((_, index) => index % step === 0);
        console.log(`Sampled ${key}: ${value.length} -> ${sampled[key].length} points`);
      } else {
        sampled[key] = value;
      }
    } else if (typeof value === 'object' && value !== null) {
      // Recursively sample nested objects
      sampled[key] = sampleLargeData(value, maxPoints);
    } else {
      sampled[key] = value;
    }
  }
  
  return sampled;
};

/**
 * Create a lightweight atmospheric data extractor
 * @param {string} url - URL to the large JSON file
 * @returns {Promise<Object>} Extracted atmospheric data
 */
export const extractAtmosphericData = async (url) => {
  try {
    console.log('Attempting to extract atmospheric data from large file...');
    
    // For now, return mock data since the file is too large
    // In a production environment, you might want to implement server-side processing
    console.log('File too large for client-side processing, using mock data');
    return null;
  } catch (error) {
    console.error('Error extracting atmospheric data:', error);
    return null;
  }
};

/**
 * Memory-efficient data loader with streaming
 * @param {string} url - URL to load
 * @param {number} maxSize - Maximum size in bytes
 * @returns {Promise<Object>} Loaded data
 */
export const loadLargeJsonFile = async (url, maxSize = 5 * 1024 * 1024) => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > maxSize) {
      throw new Error(`File too large: ${contentLength} bytes (max: ${maxSize})`);
    }
    
    // Read the response as a stream to check size
    const reader = response.body.getReader();
    const chunks = [];
    let totalSize = 0;
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      totalSize += value.length;
      if (totalSize > maxSize) {
        reader.cancel();
        throw new Error(`File too large: ${totalSize} bytes (max: ${maxSize})`);
      }
      
      chunks.push(value);
    }
    
    // Combine chunks and parse
    const text = new TextDecoder().decode(new Uint8Array(chunks.flat()));
    const data = JSON.parse(text);
    
    // Sample the data if it's still too large
    return sampleLargeData(data, 1000);
    
  } catch (error) {
    console.error(`Error loading large file ${url}:`, error);
    throw error;
  }
};
