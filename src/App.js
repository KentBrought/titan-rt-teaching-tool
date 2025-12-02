import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import SpectralPlot from './components/SpectralPlot';
import ClickableImage from './components/ClickableImage';
import { loadJsonFile, clearDataCache, getMemoryInfo } from './utils/dataLoader';
import { loadPds4Image, getAvailablePhaseAngles } from './utils/imageLoader';
import { extractGeoValues } from './utils/geoCubeLoader';

function App() {
  const [activeTab, setActiveTab] = useState('tab1');
  const [sliders, setSliders] = useState({
    hazeAbundance: 50,
    methaneAbundance: 50,
    incidenceAngle: 45,
    emissionAngle: 45,
    spectralResolution: 50,
    phaseAngle: 0
  });

  const [toggles, setToggles] = useState({
    hazeProfile: false,
    plotMultiple: false,
    transReflect: false,
    spectralUnits: false,
  });

  const getHazeAbundanceValue = (sliderValue) => {
    // Map slider value to the three options (0, 0.5, 1)
    if (sliderValue <= 33) return 0;
    if (sliderValue <= 67) return 0.5;
    return 1;
  };

  // Spectral data state
  const [spectralData, setSpectralData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [angleOptions, setAngleOptions] = useState({ inc: [], emi: [], daz: [] });
  const [selectedCases, setSelectedCases] = useState({ standard: true, no_ch4: false, no_haze: false });
  const [currentImage, setCurrentImage] = useState(null);
  const [geoValues, setGeoValues] = useState(null);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [clickedPosition, setClickedPosition] = useState(null); // Store clicked position persistently
  const [compositeType, setCompositeType] = useState('5_2_1.3'); // '5_2_1.3' or '2_1.6_1.3'
  const [hazePropertiesModel, setHazePropertiesModel] = useState('doose');

  const handleSliderChange = (name, value) => {
    setSliders(prev => ({ ...prev, [name]: parseFloat(value) }));
  };

  const handleToggleChange = (name) => {
    setToggles(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Fetch geo values for a given position
  const fetchGeoValues = useCallback(async (x, y) => {
    try {
      setLoadingGeo(true);
      const phaseAngle = sliders.phaseAngle * 5; // Convert slider value to degrees
      const values = await extractGeoValues(phaseAngle, x, y);
      setGeoValues(values);
      console.log('Extracted geo values:', values);
    } catch (error) {
      console.error('Error extracting geo values:', error);
      setGeoValues({
        error: error.message,
        x,
        y
      });
    } finally {
      setLoadingGeo(false);
    }
  }, [sliders.phaseAngle]);

  // Handle image click to extract geo values
  const handleImageClick = async (x, y, position) => {
    if (x === null || y === null) {
      setGeoValues(null);
      setClickedPosition(null);
      return;
    }

    // Store the clicked position (natural coordinates for geo cube lookup)
    setClickedPosition({ x, y, position });
    
    // Extract values immediately
    await fetchGeoValues(x, y);
  };

  const hazeAbundanceSetting = getHazeAbundanceValue(sliders.hazeAbundance);
  const hazeFolderName = `${hazePropertiesModel}_${hazeAbundanceSetting.toFixed(1)}`;

  // Load image when relevant parameters change
  useEffect(() => {
    const loadImage = async () => {
      try {
        const phaseAngle = sliders.phaseAngle * 5; // Convert slider value to degrees
        const imageDataUrl = await loadPds4Image(phaseAngle, compositeType, hazeFolderName);
        setCurrentImage(imageDataUrl);
      } catch (error) {
        console.error('Error loading image:', error);
        setCurrentImage(null);
      }
    };

    loadImage();
  }, [sliders.phaseAngle, compositeType, hazeFolderName]);

  // Update geo values when phase angle changes (if position is marked)
  useEffect(() => {
    if (clickedPosition) {
      fetchGeoValues(clickedPosition.x, clickedPosition.y);
    }
  }, [sliders.phaseAngle, clickedPosition, fetchGeoValues]);

  // Load spectral data when haze configuration changes
  useEffect(() => {
    let isCancelled = false;

    const loadSpectralData = async () => {
      try {
        setLoading(true);
        setError(null);
        const dataPath = `/assets/dt/tomasko_1.0/init_gui_library.json`;
        console.log(`Loading spectral data from ${dataPath}...`);

        const spectralJson = await loadJsonFile(dataPath);
        if (isCancelled) return;

        console.log('Spectral data loaded successfully:', Object.keys(spectralJson));
        console.log('Memory usage after loading:', getMemoryInfo());

        if (!spectralJson || !spectralJson.wavelength || !spectralJson.standard) {
          throw new Error('Invalid spectral data structure');
        }

        setSpectralData(spectralJson);
        const inc = spectralJson.inc || [];
        const emi = spectralJson.emi || [];
        const daz = spectralJson.daz || [];
        console.log('Angle arrays:', { inc: inc.length, emi: emi.length, daz: daz.length });
        setAngleOptions({ inc, emi, daz });
      } catch (err) {
        if (isCancelled) return;
        console.error('Error loading spectral data:', err);
        setError(`Unable to load spectral data from ${hazeFolderName}. ${err.message}`);
        setSpectralData(null);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadSpectralData();

    return () => {
      isCancelled = true;
    };
  }, [hazeFolderName]);

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
      </div>

      <div className="main-container">
        {/* Left side - Display panels */}
        <div className="left-panel">
          <div className="display-row">
            <div className="display-box ir-color">
              <h2>IR Color</h2>
              {currentImage ? (
                <ClickableImage
                  src={currentImage}
                  alt="Titan IR Color Image"
                  onImageClick={handleImageClick}
                  className="ir-color-image"
                  style={{ width: '100%', height: '100%' }}
                  initialPosition={clickedPosition}
                />
              ) : (
                <div className="placeholder-circle"></div>
              )}
              {geoValues && (
                <div className="geo-values-display">
                  <h3 style={{ marginBottom: '10px', fontSize: '16px', color: '#e0e0e0' }}>
                    Geo Values at ({geoValues.x}, {geoValues.y})
                  </h3>
                  {geoValues.error ? (
                    <p style={{ color: '#ff6b6b' }}>Error: {geoValues.error}</p>
                  ) : (
                    <div style={{ fontSize: '14px', color: '#ccc' }}>
                      <p><strong>Latitude (Layer 0):</strong> {geoValues.lat !== null ? `${geoValues.lat.toFixed(4)}° ${geoValues.lat < 0 ? 'N' : 'S'}` : 'N/A'}</p>
                      <p><strong>Longitude (Layer 1):</strong> {geoValues.lon !== null ? `${geoValues.lon.toFixed(4)}° ${geoValues.lon < 0 ? 'W' : 'E'}` : 'N/A'}</p>
                      <p><strong>Phase (Layer 4):</strong> {geoValues.phase !== null ? `${geoValues.phase.toFixed(2)}°` : 'N/A'}</p>
                      <p><strong>Incidence (Layer 5):</strong> {geoValues.incidence !== null ? `${geoValues.incidence.toFixed(2)}°` : 'N/A'}</p>
                      <p><strong>Emis (Layer 6):</strong> {geoValues.emis !== null ? `${geoValues.emis.toFixed(2)}°` : 'N/A'}</p>
                      <p><strong>Azimuth (Layer 7):</strong> {geoValues.azimuth !== null ? `${geoValues.azimuth.toFixed(2)}°` : 'N/A'}</p>
                    </div>
                  )}
                  {loadingGeo && <p style={{ color: '#999', fontSize: '12px' }}>Loading...</p>}
                </div>
              )}
            </div>
            <div className="composite-selector">
              <h3 style={{ fontSize: '18px', marginBottom: '15px', color: '#e0e0e0' }}>Composite Type</h3>
              <div className="radio-group">
                <label className="radio-label">
                  <input
                    type="radio"
                    name="compositeType"
                    value="5_2_1.3"
                    checked={compositeType === '5_2_1.3'}
                    onChange={(e) => setCompositeType(e.target.value)}
                  />
                  <span>5, 2, 1.3 µm</span>
                </label>
                <label className="radio-label">
                  <input
                    type="radio"
                    name="compositeType"
                    value="2_1.6_1.3"
                    checked={compositeType === '2_1.6_1.3'}
                    onChange={(e) => setCompositeType(e.target.value)}
                  />
                  <span>2, 1.6, 1.3 µm</span>
                </label>
              </div>
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
            ) : spectralData && geoValues ? (
              <div>
                <SpectralPlot 
                  spectralData={spectralData}
                  incidenceAngle={geoValues.incidence ?? 0}
                  emissionAngle={geoValues.emis ?? 0}
                  azimuthAngle={geoValues.azimuth ?? 0}
                  selectedCases={selectedCases}
                />
                <div style={{ fontSize: '12px', color: '#666', marginTop: '10px' }}>
                  Using geo-extracted angles: 
                  Inc={geoValues.incidence !== null ? `${geoValues.incidence.toFixed(2)}°` : 'N/A'}, 
                  Emi={geoValues.emis !== null ? `${geoValues.emis.toFixed(2)}°` : 'N/A'}, 
                  Az={geoValues.azimuth !== null ? `${geoValues.azimuth.toFixed(2)}°` : 'N/A'}
                </div>
              </div>
            ) : spectralData ? (
              <div className="plot-placeholder">
                <p>Click on the image to place a marker and view the spectral plot</p>
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
        {/* IR Image Options */}
        <div className="control-box sliders-box">
          <h2>IR Image Options</h2>
          <div className="slider-group">
            {/* Haze Model Section */}
            <div style={{ marginBottom: '15px' }}>
              <p style={{ marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>Haze Model</p>
              <div style={{ display: 'flex', gap: '20px' }}>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="hazePropertiesModel"
                    value="doose"
                    checked={hazePropertiesModel === 'doose'}
                    onChange={(e) => setHazePropertiesModel(e.target.value)}
                    style={{ marginRight: '6px', cursor: 'pointer' }}
                  />
                  <span>Doose</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="hazePropertiesModel"
                    value="tomasko"
                    checked={hazePropertiesModel === 'tomasko'}
                    onChange={(e) => setHazePropertiesModel(e.target.value)}
                    style={{ marginRight: '6px', cursor: 'pointer' }}
                  />
                  <span>Tomasko</span>
                </label>
              </div>
            </div>

            <label style={{ fontWeight: 'bold' }}>
              Haze abundance
              <input 
                type="range" 
                min="0" 
                max="2" 
                step="1"
                value={sliders.hazeAbundance / 50}
                onChange={(e) => {
                  const stepValue = parseInt(e.target.value);
                  const sliderValue = stepValue * 50;
                  handleSliderChange('hazeAbundance', sliderValue);
                }}
              />
              <span>{hazeAbundanceSetting}</span>
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
              Phase angle
              <input 
                type="range" 
                min="0" 
                max="71" 
                step="1"
                value={sliders.phaseAngle}
                onChange={(e) => handleSliderChange('phaseAngle', e.target.value)}
              />
              <span>{sliders.phaseAngle * 5}°</span>
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
          </div>
        </div>

          {/* Spectral Plot Options */}
          <div className="control-box toggles-box">
            <h2>Spectral Plot Options</h2>
            <div className="toggle-group">
              <div className="case-toggle-group">
                <div className="case-toggle-options">
                  {['standard', 'no_ch4', 'no_haze'].map((caseKey) => {
                    const labelMap = {
                      standard: 'METHANE + HAZE',
                      no_ch4: 'NO METHANE',
                      no_haze: 'NO HAZE'
                    };
                    const label = labelMap[caseKey] || caseKey.replace('_', ' ').toUpperCase();
                    return (
                      <label key={caseKey} className="toggle-label case-toggle-label">
                        <input 
                          type="checkbox"
                          checked={!!selectedCases[caseKey]}
                          onChange={() => setSelectedCases(prev => ({ ...prev, [caseKey]: !prev[caseKey] }))}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
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