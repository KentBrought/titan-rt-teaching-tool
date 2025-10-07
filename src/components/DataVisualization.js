import React, { useState, useEffect } from 'react';
import SpectralPlot from './SpectralPlot';
import AtmosphericProfile from './AtmosphericProfile';
import { loadJsonFile, createMockSpectralData, createMockAtmosphericData, clearDataCache } from '../utils/dataLoader';

const DataVisualization = () => {
  const [spectralData, setSpectralData] = useState(null);
  const [modelData, setModelData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('spectral');
  const [dataLoaded, setDataLoaded] = useState(false);

  // Load data files only once
  useEffect(() => {
    if (dataLoaded) return; // Prevent multiple loads

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('Starting data loading...');

        // Load spectral library data
        try {
          console.log('Loading spectral data...');
          const spectralJson = await loadJsonFile('/data/init_gui_library.json');
          console.log('Spectral data loaded successfully:', Object.keys(spectralJson));
          setSpectralData(spectralJson);
        } catch (err) {
          console.error('Error loading spectral data:', err);
          console.log('Using mock spectral data for testing');
          const mockSpectral = createMockSpectralData();
          console.log('Mock spectral data created:', Object.keys(mockSpectral));
          setSpectralData(mockSpectral);
        }

        // Load atmospheric model data
        try {
          console.log('Loading atmospheric data...');
          const modelJson = await loadJsonFile('/data/init_gui_model.json');
          console.log('Atmospheric data loaded successfully:', Object.keys(modelJson));
          setModelData(modelJson);
        } catch (err) {
          console.error('Error loading model data:', err);
          console.log('Using mock atmospheric data for testing');
          const mockAtmospheric = createMockAtmosphericData();
          console.log('Mock atmospheric data created:', Object.keys(mockAtmospheric));
          setModelData(mockAtmospheric);
        }

        console.log('Data loading completed');
        setDataLoaded(true);

      } catch (err) {
        console.error('Error loading data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [dataLoaded]);

  // Cleanup effect to prevent memory leaks
  useEffect(() => {
    return () => {
      // Clear cache when component unmounts
      clearDataCache();
    };
  }, []);

  // Memory monitoring (for debugging)
  useEffect(() => {
    const monitorMemory = () => {
      if (performance.memory) {
        console.log('Memory usage:', {
          used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB',
          total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + ' MB',
          limit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024) + ' MB'
        });
      }
    };

    // Monitor memory every 5 seconds during loading
    const interval = setInterval(monitorMemory, 5000);
    
    return () => clearInterval(interval);
  }, [loading]);

  const tabStyle = (isActive) => ({
    padding: '10px 20px',
    border: 'none',
    backgroundColor: isActive ? '#007bff' : '#f8f9fa',
    color: isActive ? 'white' : '#333',
    cursor: 'pointer',
    borderRadius: '4px 4px 0 0',
    marginRight: '2px',
    fontSize: '16px',
    fontWeight: isActive ? 'bold' : 'normal',
    transition: 'all 0.2s ease'
  });

  const contentStyle = {
    border: '1px solid #ddd',
    borderTop: 'none',
    borderRadius: '0 0 8px 8px',
    minHeight: '600px',
    backgroundColor: 'white'
  };

  if (loading) {
    return (
      <div style={{ 
        padding: '40px', 
        textAlign: 'center',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        margin: '20px'
      }}>
        <div style={{ fontSize: '18px', marginBottom: '10px' }}>🔄</div>
        <h3>Loading PyDISORT Data...</h3>
        <p>Please wait while we load the spectral library and atmospheric model data.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: '40px', 
        textAlign: 'center',
        backgroundColor: '#f8d7da',
        borderRadius: '8px',
        margin: '20px',
        color: '#721c24'
      }}>
        <div style={{ fontSize: '24px', marginBottom: '10px' }}>⚠️</div>
        <h3>Error Loading Data</h3>
        <p>{error}</p>
        <p style={{ fontSize: '14px', marginTop: '10px' }}>
          Make sure the JSON files are in the <code>public/data/</code> directory.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', backgroundColor: '#f8f9fa', minHeight: '100vh' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ color: '#333', marginBottom: '10px' }}>
          PyDISORT Data Visualization
        </h1>
        <p style={{ color: '#666', fontSize: '16px' }}>
          Interactive visualization of spectral reflectance and atmospheric profiles from PyDISORT radiative transfer modeling.
        </p>
      </div>

      {/* Tab Navigation */}
      <div style={{ marginBottom: '0' }}>
        <button
          style={tabStyle(activeTab === 'spectral')}
          onClick={() => setActiveTab('spectral')}
        >
          📊 Spectral Analysis
        </button>
        <button
          style={tabStyle(activeTab === 'atmospheric')}
          onClick={() => setActiveTab('atmospheric')}
        >
          🌍 Atmospheric Profiles
        </button>
      </div>

      {/* Tab Content */}
      <div style={contentStyle}>
        {activeTab === 'spectral' && (
          <div>
            {spectralData ? (
              <SpectralPlot spectralData={spectralData} />
            ) : (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <p>No spectral data available</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'atmospheric' && (
          <div>
            {modelData ? (
              <AtmosphericProfile modelData={modelData} />
            ) : (
              <div style={{ padding: '40px', textAlign: 'center' }}>
                <p>No atmospheric model data available</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ 
        marginTop: '30px', 
        padding: '20px', 
        backgroundColor: 'white', 
        borderRadius: '8px',
        border: '1px solid #ddd'
      }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>About This Visualization</h4>
        <div style={{ fontSize: '14px', color: '#666', lineHeight: '1.6' }}>
          <p>
            This tool visualizes data from PyDISORT, a 1D radiative transfer code for planetary atmospheres. 
            The spectral analysis shows reflectance as a function of wavelength for different viewing geometries 
            and atmospheric conditions (standard, no methane, no haze). The atmospheric profiles display 
            temperature and methane concentration as functions of altitude.
          </p>
          <p style={{ marginTop: '10px' }}>
            <strong>Data Source:</strong> PyDISORT model with 1029 spectra at VIMS resolution, 
            covering incidence angles (0-90°), emission angles (0-90°), and azimuth angles (0-360°) 
            in 10°/10°/30° steps respectively.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DataVisualization;
