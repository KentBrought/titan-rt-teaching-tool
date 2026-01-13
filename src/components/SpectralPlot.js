import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { processSpectralData, createSpectralPlotData, getActualAngles } from '../utils/dataProcessing';

// Helper function to adjust color brightness
const adjustColorBrightness = (hex, percent) => {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
};

const SpectralPlot = ({ 
  spectralData, 
  incidenceAngle, 
  emissionAngle, 
  azimuthAngle, 
  selectedCases, 
  plotMultiple, 
  multiplePositions, 
  geoValues,
  transmissionToggles = {},
  spectralUnits = false
}) => {
  const [actualAngles, setActualAngles] = useState({ incidence: 0, emission: 0, azimuth: 0 });
  const [gasTransmissionData, setGasTransmissionData] = useState(null);
  const [solarSpectrum, setSolarSpectrum] = useState(null);

  // Load gas transmission data on mount
  useEffect(() => {
    const loadGasTransmission = async () => {
      try {
        const response = await fetch('/data/gas_transmission.json');
        if (response.ok) {
          const data = await response.json();
          setGasTransmissionData(data);
        }
      } catch (err) {
        console.error('Error loading gas transmission data:', err);
      }
    };
    loadGasTransmission();
  }, []);

  // Load solar spectrum data on mount
  useEffect(() => {
    const loadSolarSpectrum = async () => {
      try {
        const response = await fetch('/data/solar_spectrum_vims.txt');
        if (response.ok) {
          const text = await response.text();
          const lines = text.trim().split('\n');
          
          // Skip header line and parse data
          const spectrumData = [];
          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;
            
            // Split by whitespace (can be space or tab)
            const parts = line.split(/\s+/);
            if (parts.length >= 2) {
              const wavelength = parseFloat(parts[0]);
              const flux = parseFloat(parts[1]);
              if (!isNaN(wavelength) && !isNaN(flux)) {
                spectrumData.push({ wavelength, flux });
              }
            }
          }
          
          // Sort by wavelength to ensure proper ordering
          spectrumData.sort((a, b) => a.wavelength - b.wavelength);
          
          setSolarSpectrum(spectrumData);
          console.log('Solar spectrum loaded:', spectrumData.length, 'points');
        }
      } catch (err) {
        console.error('Error loading solar spectrum:', err);
      }
    };
    loadSolarSpectrum();
  }, []);

  // Process data when component mounts or data changes - use useMemo for efficiency
  const processedData = useMemo(() => {
    if (!spectralData) return null;
    return processSpectralData(spectralData);
  }, [spectralData]);

  // Interpolation function to get solar flux for a given wavelength
  const getSolarFlux = useCallback((wavelength) => {
    if (!solarSpectrum || solarSpectrum.length === 0) return 1; // Return 1 if no spectrum loaded (no conversion)
    
    // If exact match, return it
    const exactMatch = solarSpectrum.find(s => Math.abs(s.wavelength - wavelength) < 1e-10);
    if (exactMatch) return exactMatch.flux;
    
    // If wavelength is outside range, return nearest edge value
    if (wavelength <= solarSpectrum[0].wavelength) return solarSpectrum[0].flux;
    if (wavelength >= solarSpectrum[solarSpectrum.length - 1].wavelength) {
      return solarSpectrum[solarSpectrum.length - 1].flux;
    }
    
    // Linear interpolation
    for (let i = 0; i < solarSpectrum.length - 1; i++) {
      const w1 = solarSpectrum[i].wavelength;
      const w2 = solarSpectrum[i + 1].wavelength;
      const f1 = solarSpectrum[i].flux;
      const f2 = solarSpectrum[i + 1].flux;
      
      if (wavelength >= w1 && wavelength <= w2) {
        const t = (wavelength - w1) / (w2 - w1);
        return f1 + t * (f2 - f1);
      }
    }
    
    return 1; // Fallback
  }, [solarSpectrum]);

  // Check if any gas transmission is selected
  const hasGasTransmission = !plotMultiple && Object.values(transmissionToggles).some(v => v);

  // Memoize plot data generation for performance - use useMemo to prevent blocking
  // Use useMemo with async-friendly approach
  const plotData = useMemo(() => {
    if (!processedData) return [];
    
    // Use requestIdleCallback or setTimeout to yield to browser if processing is heavy
    // For now, process synchronously but efficiently
    
    const traces = [];
    const colors = ['#ff0000', '#ffa500', '#ffff00', '#00ff00', '#0000ff', '#800080'];
    const colorNames = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
    
    if (plotMultiple && Array.isArray(geoValues) && geoValues.length > 0) {
      // Multiple mode: create traces for each point and each selected case
      geoValues.forEach((geoValue, pointIndex) => {
        const pointCases = selectedCases[pointIndex] || { standard: true, no_ch4: false, no_haze: false };
        const pointIncidence = geoValue.incidence ?? 0;
        const pointEmission = geoValue.emis ?? 0;
        const pointAzimuth = geoValue.azimuth ?? 0;
        
        // Count how many cases are selected for this point to determine shade variations
        const selectedCaseTypes = Object.entries(pointCases)
          .filter(([_, isSelected]) => isSelected)
          .map(([caseType, _]) => caseType);
        const baseColor = colors[pointIndex] || '#ff0000';
        const pointColor = colorNames[pointIndex] || 'Red';
        
        // Create traces for each selected case with different shades
        selectedCaseTypes.forEach((caseType, caseIndex) => {
          const data = createSpectralPlotData(
            processedData, 
            pointIncidence, 
            pointEmission, 
            pointAzimuth, 
            caseType
          );
          
          if (data && data.wavelengths && data.wavelengths.length > 0) {
            // Use arrays directly - no extraction needed
            const wavelengths = data.wavelengths;
            let intensities = data.intensities;
            
            // Convert to flux units if spectralUnits is enabled
            if (spectralUnits && solarSpectrum) {
              intensities = intensities.map((reflectance, idx) => {
                const wavelength = wavelengths[idx];
                const solarFlux = getSolarFlux(wavelength);
                return reflectance * solarFlux;
              });
            }
            
            const nameMap = {
              standard: 'CH₄ + haze',
              no_ch4: 'No CH₄',
              no_haze: 'No haze'
            };
            const caseName = nameMap[caseType] || caseType.replace('_', ' ').replace(/^\w/, c => c.toUpperCase());
            const traceName = `${caseName} (${pointColor})`;
            
            // Use different shades of the same color for multiple components
            let lineColor = baseColor;
            if (selectedCaseTypes.length > 1) {
              // If multiple cases selected, use different shades
              // Standard: base color, No methane: darker, No haze: lighter
              if (caseType === 'standard') {
                lineColor = baseColor;
              } else if (caseType === 'no_ch4') {
                lineColor = adjustColorBrightness(baseColor, -80);
              } else if (caseType === 'no_haze') {
                lineColor = adjustColorBrightness(baseColor, 80);
              }
            } else {
              // Only one case selected, use base color
              lineColor = baseColor;
            }
            
            // Set line style based on case type
            let dashStyle = 'solid';
            if (caseType === 'no_ch4') {
              dashStyle = 'dash';
            } else if (caseType === 'no_haze') {
              dashStyle = 'dot';
            }
            
            traces.push({
              x: wavelengths,
              y: intensities,
              type: 'scattergl',
              mode: 'lines',
              name: traceName,
              line: {
                color: lineColor,
                width: 2,
                dash: dashStyle
              }
            });
          }
        });
      });
    } else if (!plotMultiple && geoValues) {
      // Single mode: use the original logic
      Object.entries(selectedCases).forEach(([caseType, isSelected]) => {
        if (isSelected) {
          const data = createSpectralPlotData(
            processedData, 
            incidenceAngle, 
            emissionAngle, 
            azimuthAngle, 
            caseType
          );
          
          if (data && data.wavelengths && data.wavelengths.length > 0) {
            // Use arrays directly - no extraction needed
            const wavelengths = data.wavelengths;
            let intensities = data.intensities;
            
            // Convert to flux units if spectralUnits is enabled
            if (spectralUnits && solarSpectrum) {
              intensities = intensities.map((reflectance, idx) => {
                const wavelength = wavelengths[idx];
                const solarFlux = getSolarFlux(wavelength);
                return reflectance * solarFlux;
              });
            }
            
            const nameMap = {
              standard: 'CH₄ + haze',
              no_ch4: 'No CH₄',
              no_haze: 'No haze'
            };
            traces.push({
              x: wavelengths,
              y: intensities,
              type: 'scattergl',
              mode: 'lines',
              name: nameMap[caseType] || caseType.replace('_', ' ').replace(/^\w/, c => c.toUpperCase()),
              line: {
                color: caseType === 'standard' ? '#1f77b4' : 
                       caseType === 'no_ch4' ? '#ff7f0e' : '#2ca02c',
                width: 2
              }
            });
          }
        }
      });
    }

    // Add gas transmission traces if enabled and not in multiple mode
    if (!plotMultiple && gasTransmissionData) {
      const toggleToGasMap = {
        'ch4': 'CH4',
        'haze': 'Haze',
        'co': 'CO',
        'c2h6': 'C2H6',
        'c2h2': 'C2H2',
      };

      const gasColors = {
        'CH4': '#ff6b6b',
        'CO': '#e91e63', 
        'C2H2': '#9c27b0',
        'C2H6': '#4caf50',
        'Haze': '#ff9800',
      };

      const gasLabels = {
        'CH4': 'CH₄',
        'CO': 'CO',
        'C2H2': 'C₂H₂',
        'C2H6': 'C₂H₆',
        'Haze': 'Haze',
      };

      Object.entries(transmissionToggles).forEach(([toggleKey, isSelected]) => {
        const gasName = toggleToGasMap[toggleKey];
        if (isSelected && gasName && gasTransmissionData.gases[gasName]) {
          const gasData = gasTransmissionData.gases[gasName];
          traces.push({
            x: gasTransmissionData.wavelength,
            y: gasData.transmission,
            type: 'scattergl',
            mode: 'lines',
            name: `${gasLabels[gasName] || gasName}`,
            yaxis: 'y2',
            line: {
              color: gasColors[gasName] || '#888888',
              width: 1.5,
            },
            opacity: 0.7
          });
        }
      });
    }
    
    return traces;
  }, [processedData, incidenceAngle, emissionAngle, azimuthAngle, selectedCases, plotMultiple, geoValues, transmissionToggles, gasTransmissionData, spectralUnits, solarSpectrum, getSolarFlux]);

  // Update actualAngles in a separate effect to avoid infinite loop
  useEffect(() => {
    if (!processedData || !geoValues) return;
    
    if (plotMultiple && Array.isArray(geoValues) && geoValues.length > 0) {
      const geoValue = geoValues[0];
      const actual = getActualAngles(processedData, geoValue.incidence ?? 0, geoValue.emis ?? 0, geoValue.azimuth ?? 0);
      setActualAngles(actual);
    } else if (!plotMultiple && !Array.isArray(geoValues)) {
      const actual = getActualAngles(processedData, incidenceAngle, emissionAngle, azimuthAngle);
      setActualAngles(actual);
    }
  }, [processedData, geoValues, plotMultiple, incidenceAngle, emissionAngle, azimuthAngle]);

  const plotLayout = useMemo(() => ({
    xaxis: {
      title: {
        text: 'Wavelength (μm)',
        font: { size: 14, color: '#ccc' }
      },
      showgrid: true,
      gridcolor: 'rgba(255,255,255,0.1)',
      tickfont: { size: 11, color: '#999' }
    },
    yaxis: {
      title: {
        text: spectralUnits ? 'Flux (W/m²/sr/μm)' : 'Apparent Reflectance',
        font: { size: 14, color: '#ccc' }
      },
      type: 'linear',
      showgrid: true,
      gridcolor: 'rgba(255,255,255,0.1)',
      tickfont: { size: 11, color: '#999' }
    },
    ...(hasGasTransmission && {
      yaxis2: {
        title: {
          text: 'Transmission',
          font: { size: 14, color: '#888' }
        },
        type: 'linear',
        range: [0, 1],
        overlaying: 'y',
        side: 'right',
        showgrid: false,
        tickfont: { size: 11, color: '#888' }
      }
    }),
    margin: { l: 60, r: hasGasTransmission ? 60 : 30, t: 60, b: 60 },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 0.02,
      y: 0.98,
      bgcolor: 'rgba(0,0,0,0.5)',
      bordercolor: '#444',
      borderwidth: 1,
      font: { size: 11, color: '#ccc' }
    },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(26,26,26,1)'
  }), [hasGasTransmission, spectralUnits]);

  if (!spectralData) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', height: '600px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading spectral data...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 0, height: '600px', display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {/* Plot */}
      <div style={{ flex: 1, border: '1px solid #444', borderRadius: '8px', height: '500px', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', overflow: 'hidden', backgroundColor: '#1a1a1a' }}>
        <Plot
          data={plotData}
          layout={plotLayout}
          style={{ width: '100%', height: '500px', maxWidth: '100%' }}
          useResizeHandler={true}
          config={{
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d'],
            showTips: false,
            notifications: false
          }}
        />
      </div>

      {/* Info */}
      <div style={{ 
        marginTop: '15px', 
        padding: '10px', 
        backgroundColor: '#2a2a2a', 
        borderRadius: '4px',
        border: '1px solid #4a9d4a',
        fontSize: '14px',
        color: '#e0e0e0',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}>
        {(() => {
          // Check if cases are selected
          let hasSelectedCases = false;
          if (geoValues) {
            if (plotMultiple && Array.isArray(geoValues)) {
              // Check if any point has any case selected
              hasSelectedCases = geoValues.some((_, idx) => {
                const pointCases = selectedCases[idx] || {};
                return Object.values(pointCases).some(v => v === true);
              });
            } else if (!plotMultiple) {
              // Single mode: check selectedCases object
              hasSelectedCases = selectedCases && Object.values(selectedCases).some(v => v === true);
            }
          }
          
          // Check if there's any spectral data to plot (non-empty traces, excluding gas transmission)
          // This is recalculated on every render, so it will update when phase angle changes and data becomes available
          const hasDataToPlot = plotData && plotData.some(trace => 
            !trace.yaxis && // Exclude gas transmission traces (they use yaxis: 'y2')
            trace.x && trace.x.length > 0 && trace.y && trace.y.length > 0
          );
          
          // Show angle values only if a point is selected AND cases are selected
          const showAngles = geoValues && hasSelectedCases;
          
          return (
            <>
              {!hasDataToPlot && geoValues && hasSelectedCases ? (
                <span style={{ color: '#ff6b6b' }}>
                  ⚠️ No data available: The selected point is more than 10 degrees away from the nearest available data point. Please select a different location on the image.
                </span>
              ) : (
                <>
                  <strong>Current Selection:</strong> {
                    !geoValues ? (
                      // No point selected - show nothing for angles
                      null
                    ) : showAngles ? (
                      plotMultiple && Array.isArray(geoValues) && geoValues.length > 1 ? (
                        'Multiple points selected'
                      ) : (
                        <>Incidence: {actualAngles.incidence.toFixed(2)}°, Emission: {actualAngles.emission.toFixed(2)}°, Azimuth: {actualAngles.azimuth.toFixed(2)}°</>
                      )
                    ) : (
                      // Point selected but no cases - show nothing for angles
                      null
                    )
                  }
                  {!hasSelectedCases && (
                    <span style={{ color: '#ff6b6b', marginLeft: '10px' }}>
                      ⚠️ Please select at least one case to display
                    </span>
                  )}
                </>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
};

export default SpectralPlot;