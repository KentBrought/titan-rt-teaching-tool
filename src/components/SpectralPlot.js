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
  transmissionToggles = {}  // { ch4: bool, h2: bool, co: bool, c2h6: bool, c2h2: bool }
}) => {
  const [actualAngles, setActualAngles] = useState({ incidence: 0, emission: 0, azimuth: 0 });
  const [gasTransmissionData, setGasTransmissionData] = useState(null);

  // Load gas transmission data on mount
  useEffect(() => {
    const loadGasTransmission = async () => {
      try {
        const response = await fetch('/data/gas_transmission.json');
        if (response.ok) {
          const data = await response.json();
          setGasTransmissionData(data);
          console.log('Gas transmission data loaded:', Object.keys(data.gases));
        }
      } catch (err) {
        console.error('Error loading gas transmission data:', err);
      }
    };
    loadGasTransmission();
  }, []);

  // Process data when component mounts or data changes - use useMemo for efficiency
  const processedData = useMemo(() => {
    if (!spectralData) return null;
    return processSpectralData(spectralData);
  }, [spectralData]);

  // Check if any gas transmission is selected
  const hasGasTransmission = useMemo(() => {
    return !plotMultiple && Object.values(transmissionToggles).some(v => v);
  }, [plotMultiple, transmissionToggles]);

  // Update actual angles separately via useEffect to avoid re-render loop
  useEffect(() => {
    if (!processedData) return;
    
    if (plotMultiple && Array.isArray(geoValues) && geoValues.length > 0) {
      const geoValue = geoValues[0];
      const pointIncidence = geoValue.incidence ?? 0;
      const pointEmission = geoValue.emis ?? 0;
      const pointAzimuth = geoValue.azimuth ?? 0;
      const actual = getActualAngles(processedData, pointIncidence, pointEmission, pointAzimuth);
      setActualAngles(actual);
    } else if (!plotMultiple && geoValues && !Array.isArray(geoValues)) {
      const actual = getActualAngles(processedData, incidenceAngle, emissionAngle, azimuthAngle);
      setActualAngles(actual);
    }
  }, [processedData, geoValues, plotMultiple, incidenceAngle, emissionAngle, azimuthAngle]);

  // Memoize plot data generation for performance
  const plotData = useMemo(() => {
    if (!processedData) return [];
    
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
            const intensities = data.intensities;
            
            const nameMap = {
              standard: 'CH₄ + Haze',
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
              yaxis: 'y',
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
            const intensities = data.intensities;
            
            const nameMap = {
              standard: 'CH₄ + Haze',
              no_ch4: 'No CH₄',
              no_haze: 'No haze'
            };
            traces.push({
              x: wavelengths,
              y: intensities,
              type: 'scattergl',
              mode: 'lines',
              name: nameMap[caseType] || caseType.replace('_', ' ').replace(/^\w/, c => c.toUpperCase()),
              yaxis: 'y',
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
      // Map from toggle keys to the JSON gas names
      const toggleToGasMap = {
        'ch4': 'CH4',
        'co': 'CO',
        'c2h2': 'C2H2',
        'c2h6': 'C2H6',
        'h2': 'Haze',  // H2 maps to Haze in the data
      };

      const gasColors = {
        'CH4': '#00bcd4',
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
            name: `${gasLabels[gasName] || gasName} Trans.`,
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
  }, [processedData, incidenceAngle, emissionAngle, azimuthAngle, selectedCases, plotMultiple, geoValues, transmissionToggles, gasTransmissionData]);

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
        text: 'Apparent Reflectance',
        font: { size: 14, color: '#ccc' }
      },
      type: 'linear',
      showgrid: true,
      gridcolor: 'rgba(255,255,255,0.1)',
      tickfont: { size: 11, color: '#999' }
    },
    // Secondary y-axis for transmission (only shown when gas transmission is active)
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
  }), [hasGasTransmission]);

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
            showTips: false
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
          
          // Show angle values only if a point is selected AND cases are selected
          const showAngles = geoValues && hasSelectedCases;
          
          return (
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
          );
        })()}
      </div>
    </div>
  );
};

export default SpectralPlot;