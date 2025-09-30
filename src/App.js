import React, { useState } from 'react';
import './App.css';

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

  const handleSliderChange = (name, value) => {
    setSliders(prev => ({ ...prev, [name]: parseFloat(value) }));
  };

  const handleToggleChange = (name) => {
    setToggles(prev => ({ ...prev, [name]: !prev[name] }));
  };

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
            <div className="plot-placeholder">
              <p>Click on image to generate plot</p>
            </div>
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
              
              <label>
                Incidence angle
                <input 
                  type="range" 
                  min="0" 
                  max="90" 
                  value={sliders.incidenceAngle}
                  onChange={(e) => handleSliderChange('incidenceAngle', e.target.value)}
                />
                <span>{sliders.incidenceAngle}°</span>
              </label>
              
              <label>
                Emission angle
                <input 
                  type="range" 
                  min="0" 
                  max="90" 
                  value={sliders.emissionAngle}
                  onChange={(e) => handleSliderChange('emissionAngle', e.target.value)}
                />
                <span>{sliders.emissionAngle}°</span>
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