import React, { useState, useEffect } from 'react';
import './App.css';
import SpectralPlot from './components/SpectralPlot';
import { loadJsonFile, clearDataCache, getMemoryInfo } from './utils/dataLoader';

function App() {
  const [activeTab, setActiveTab] = useState('tab1');
  const [sliders, setSliders] = useState({
    hazeAbundance: 50,
    methaneAbundance: 50,
    incidenceAngle: 45,
    emissionAngle: 45,
    spectralResolution: 50,
    hazeProperties: 50
  });

  const [toggles, setToggles] = useState({
    hazeProfile: false,
    rayleighScattering: false,
    plotMultiple: false,
    transReflect: false,
    spectralUnits: false,
    logLinear: false
  });

  // Spectral data state
  const [spectralData, setSpectralData] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [angleOptions, setAngleOptions] = useState({ inc: [], emi: [], daz: [] });
  const [incidenceIdx, setIncidenceIdx] = useState(0);
  const [emissionIdx, setEmissionIdx] = useState(0);
  const [azimuthIdx, setAzimuthIdx] = useState(0);
  const [selectedCases, setSelectedCases] = useState({ standard: true, no_ch4: false, no_haze: false });

  const handleSliderChange = (name, value) => {
    setSliders(prev => ({ ...prev, [name]: parseFloat(value) }));
  };

  const handleToggleChange = (name) => {
    setToggles(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Load spectral data
  useEffect(() => {
    if (dataLoaded) return;

    const loadSpectralData = async () => {
      try {
        setLoading(true);
        setError(null);
        console.log('Loading spectral data...');
        
        const spectralJson = await loadJsonFile('/data/init_gui_library.json');
        console.log('Spectral data loaded successfully:', Object.keys(spectralJson));
        console.log('Memory usage after loading:', getMemoryInfo());
        
        // Check if we have valid data
        if (!spectralJson || !spectralJson.wavelength || !spectralJson.standard) {
          throw new Error('Invalid spectral data structure');
        }
        
        setSpectralData(spectralJson);
        // Initialize angle options and indices
        const inc = spectralJson.inc || [];
        const emi = spectralJson.emi || [];
        const daz = spectralJson.daz || [];
        console.log('Angle arrays:', { inc: inc.length, emi: emi.length, daz: daz.length });
        setAngleOptions({ inc, emi, daz });
        setIncidenceIdx(0);
        setEmissionIdx(0);
        setAzimuthIdx(0);
      } catch (err) {
        console.error('Error loading spectral data:', err);
        setError('Unable to load spectral data due to memory constraints. The dataset is too large for the browser to handle safely.');
        setSpectralData(null);
      } finally {
        setLoading(false);
        setDataLoaded(true);
      }
    };

    loadSpectralData();
  }, [dataLoaded]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      clearDataCache();
    };
  }, []);

  return (
    <div className="App">
      {/* Tabs */}
      <div className="tabs">
        <button 
          className={`tab ${activeTab === 'tab1' ? 'active' : ''}`}
          onClick={() => setActiveTab('tab1')}
        >
          Tab 1
        </button>
        <button 
          className={`tab ${activeTab === 'tab2' ? 'active' : ''}`}
          onClick={() => setActiveTab('tab2')}
        >
          Tab 2
        </button>
      </div>

      <div className="main-container">
        {/* Left side - Display panels */}
        <div className="left-panel">
          <div className="display-row">
            <div className="display-box true-color">
              <h2>True Color</h2>
              <div className="placeholder-circle"></div>
            </div>
            <div className="display-box ir-color">
              <h2>IR Color</h2>
              <div className="placeholder-circle"></div>
            </div>
          </div>
          
          <div className="spectral-plot">
            <h2>Spectral Plot</h2>
            {loading ? (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                margin: '10px'
              }}>
                <div style={{ fontSize: '18px', marginBottom: '10px' }}>🔄</div>
                <p>Loading spectral data...</p>
              </div>
            ) : error ? (
              <div style={{ 
                padding: '40px', 
                textAlign: 'center',
                backgroundColor: '#f8d7da',
                borderRadius: '8px',
                margin: '10px',
                border: '1px solid #f5c6cb'
              }}>
                <div style={{ fontSize: '24px', marginBottom: '15px' }}>⚠️</div>
                <h3 style={{ color: '#721c24', marginBottom: '10px' }}>Memory Error</h3>
                <p style={{ color: '#721c24', marginBottom: '15px' }}>{error}</p>
                <p style={{ color: '#856404', fontSize: '14px' }}>
                  The PyDISORT spectral dataset is too large for the browser to handle safely. 
                  Consider using a more powerful machine or a different browser for this visualization.
                </p>
              </div>
            ) : spectralData ? (
              <div>
                <SpectralPlot 
                  spectralData={spectralData}
                  incidenceAngle={angleOptions.inc[incidenceIdx] ?? 0}
                  emissionAngle={0}
                  azimuthAngle={0}
                  selectedCases={selectedCases}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                  Debug: Inc={angleOptions.inc[incidenceIdx] ?? 0}°, 
                  Emi=0°, 
                  Az=0°
                </div>
              </div>
            ) : (
              <div className="plot-placeholder">
                <p>No spectral data available</p>
              </div>
            )}
          </div>
        </div>

        {/* Right side - Controls */}
        <div className="right-panel">
          {/* Sliders */}
          <div className="control-box sliders-box">
            <h2>Sliders:</h2>
            <div className="slider-group">
              <label>
                Haze abundance
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={sliders.hazeAbundance}
                  onChange={(e) => handleSliderChange('hazeAbundance', e.target.value)}
                />
                <span>{sliders.hazeAbundance}</span>
              </label>
              
              <label>
                Methane abundance
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={sliders.methaneAbundance}
                  onChange={(e) => handleSliderChange('methaneAbundance', e.target.value)}
                />
                <span>{sliders.methaneAbundance}</span>
              </label>
              
              <label style={{ fontWeight: 'bold' }}>
                Incidence angle
                <input 
                  type="range" 
                  min={0} 
                  max={Math.max((angleOptions.inc?.length || 1) - 1, 0)} 
                  step={1}
                  value={incidenceIdx}
                  onChange={(e) => setIncidenceIdx(parseInt(e.target.value, 10))}
                />
                <span>{angleOptions.inc[incidenceIdx] ?? 0}°</span>
              </label>
              

              <label>
                Spectral resolution*
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={sliders.spectralResolution}
                  onChange={(e) => handleSliderChange('spectralResolution', e.target.value)}
                />
                <span>{sliders.spectralResolution}</span>
              </label>
              
              <label>
                Haze properties*
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={sliders.hazeProperties}
                  onChange={(e) => handleSliderChange('hazeProperties', e.target.value)}
                />
                <span>{sliders.hazeProperties}</span>
              </label>
            </div>
          </div>

          {/* Toggles */}
          <div className="control-box toggles-box">
            <h2>Toggles:</h2>
            <div className="toggle-group">
              {/* Case toggles (functional) */}
              {['standard', 'no_ch4', 'no_haze'].map((caseKey) => (
                <label key={caseKey} className="toggle-label" style={{ fontWeight: 'bold' }}>
                  <input 
                    type="checkbox"
                    checked={!!selectedCases[caseKey]}
                    onChange={() => setSelectedCases(prev => ({ ...prev, [caseKey]: !prev[caseKey] }))}
                  />
                  <span>{caseKey.replace('_', ' ').toUpperCase()}</span>
                </label>
              ))}

              {/* Existing non-functional toggles */}
              {Object.entries(toggles).map(([key, value]) => (
                <label key={key} className="toggle-label">
                  <input 
                    type="checkbox"
                    checked={value}
                    onChange={() => handleToggleChange(key)}
                  />
                  <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;