import React, { useState, useEffect } from 'react';
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

const SpectralPlot = ({ spectralData, incidenceAngle, emissionAngle, azimuthAngle, selectedCases, plotMultiple, multiplePositions, geoValues }) => {
  const [processedData, setProcessedData] = useState(null);
  const [plotData, setPlotData] = useState([]);
  const [actualAngles, setActualAngles] = useState({ incidence: 0, emission: 0, azimuth: 0 });

  // Process data when component mounts or data changes
  useEffect(() => {
    if (spectralData) {
      const processed = processSpectralData(spectralData);
      setProcessedData(processed);
    }
  }, [spectralData]);

  // Update plot data when parameters change
  useEffect(() => {
    if (processedData) {
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
          
          // Get actual angles for first point (for display)
          if (pointIndex === 0) {
            const actual = getActualAngles(processedData, pointIncidence, pointEmission, pointAzimuth);
            setActualAngles(actual);
          }
          
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
            
            if (data.length > 0) {
              const nameMap = {
                standard: 'Methane + haze',
                no_ch4: 'No methane',
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
                x: data.map(d => d.wavelength),
                y: data.map(d => d.intensity),
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
      } else {
        // Single mode: use the original logic
        const actual = getActualAngles(processedData, incidenceAngle, emissionAngle, azimuthAngle);
        setActualAngles(actual);
        
        Object.entries(selectedCases).forEach(([caseType, isSelected]) => {
          if (isSelected) {
            const data = createSpectralPlotData(
              processedData, 
              incidenceAngle, 
              emissionAngle, 
              azimuthAngle, 
              caseType
            );
            
            if (data.length > 0) {
              const nameMap = {
                standard: 'Methane + haze',
                no_ch4: 'No methane',
                no_haze: 'No haze'
              };
              traces.push({
                x: data.map(d => d.wavelength),
                y: data.map(d => d.intensity),
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

      setPlotData(traces);
    }
  }, [processedData, incidenceAngle, emissionAngle, azimuthAngle, selectedCases, plotMultiple, multiplePositions, geoValues]);

  const plotLayout = {
    xaxis: {
      title: {
        text: 'Wavelength (μm)',
        font: { size: 14, color: '#374151' }
      },
      showgrid: true,
      gridcolor: '#e0e0e0'
    },
          yaxis: {
            title: {
              text: 'Apparent Reflectance',
              font: { size: 14, color: '#374151' }
            },
            type: 'linear',
            showgrid: true,
            gridcolor: '#e0e0e0'
          },
    margin: { l: 60, r: 30, t: 60, b: 60 },
    hovermode: 'closest',
    showlegend: true,
    legend: {
      x: 0.02,
      y: 0.98,
      bgcolor: 'rgba(255,255,255,0.8)'
    }
  };

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
            <div style={{ flex: 1, border: '1px solid #dee2e6', borderRadius: '8px', height: '500px', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', overflow: 'hidden', backgroundColor: 'white' }}>
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
        backgroundColor: '#e9ecef', 
        borderRadius: '4px',
        fontSize: '14px',
        color: '#495057',
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
                <span style={{ color: '#dc3545', marginLeft: '10px' }}>
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
