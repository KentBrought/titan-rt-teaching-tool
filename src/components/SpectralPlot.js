import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { processSpectralData, createSpectralPlotData } from '../utils/dataProcessing';

const SpectralPlot = ({ spectralData, incidenceAngle, emissionAngle, azimuthAngle, selectedCases }) => {
  const [processedData, setProcessedData] = useState(null);
  const [plotData, setPlotData] = useState([]);

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
      
      // Create traces for each selected case
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
            traces.push({
              x: data.map(d => d.wavelength),
              y: data.map(d => d.intensity),
              mode: 'lines',
              name: `${caseType.replace('_', ' ').toUpperCase()}`,
              line: {
                color: caseType === 'standard' ? '#1f77b4' : 
                       caseType === 'no_ch4' ? '#ff7f0e' : '#2ca02c',
                width: 2
              }
            });
          }
        }
      });

      setPlotData(traces);
    }
  }, [processedData, incidenceAngle, emissionAngle, azimuthAngle, selectedCases]);

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
        text: 'Brightness',
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
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading spectral data...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 0, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Plot */}
      <div style={{ flex: 1, border: '1px solid #dee2e6', borderRadius: '8px' }}>
        <Plot
          data={plotData}
          layout={plotLayout}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler={true}
          config={{
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
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
        color: '#495057'
      }}>
        <strong>Current Selection:</strong> Incidence: {incidenceAngle}°, Emission: {emissionAngle}°, Azimuth: {azimuthAngle}°
        {Object.entries(selectedCases).filter(([_, selected]) => selected).length === 0 && (
          <span style={{ color: '#dc3545', marginLeft: '10px' }}>
            ⚠️ Please select at least one case to display
          </span>
        )}
      </div>
    </div>
  );
};

export default SpectralPlot;
