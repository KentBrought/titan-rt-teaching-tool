/**
 * Test data loading functionality
 */

import { loadJsonFile, createMockSpectralData, createMockAtmosphericData } from './dataLoader';

export const testDataLoading = async () => {
  console.log('Testing data loading...');
  
  try {
    // Test loading spectral data
    console.log('Loading spectral data...');
    const spectralData = await loadJsonFile('/data/init_gui_library.json');
    console.log('Spectral data loaded successfully:', Object.keys(spectralData));
    
    // Test loading atmospheric data
    console.log('Loading atmospheric data...');
    const atmosphericData = await loadJsonFile('/data/init_gui_model.json');
    console.log('Atmospheric data loaded successfully:', Object.keys(atmosphericData));
    
    return { spectralData, atmosphericData };
  } catch (error) {
    console.error('Error loading data:', error);
    console.log('Falling back to mock data...');
    
    const mockSpectral = createMockSpectralData();
    const mockAtmospheric = createMockAtmosphericData();
    
    console.log('Mock spectral data:', Object.keys(mockSpectral));
    console.log('Mock atmospheric data:', Object.keys(mockAtmospheric));
    
    return { spectralData: mockSpectral, atmosphericData: mockAtmospheric };
  }
};
