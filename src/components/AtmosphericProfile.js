import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { processAtmosphericData, createAtmosphericPlotData } from '../utils/dataProcessing';

const AtmosphericProfile = ({ modelData }) => {
  const [processedData, setProcessedData] = useState(null);
  const [plotData, setPlotData] = useState(null);

  // Process data when component mounts or data changes
  useEffect(() => {
    if (modelData) {
      const processed = processAtmosphericData(modelData);
      setProcessedData(processed);
      
      if (processed) {
        const plotDataObj = createAtmosphericPlotData(processed);
        setPlotData(plotDataObj);
      }
    }
  }, [modelData]);

  if (!processedData || !plotData) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading atmospheric profile data...</p>
      </div>
    );
  }

  // Temperature profile plot
  const temperatureData = [{
    x: plotData.temperature.data.map(point => point.x),
    y: plotData.temperature.data.map(point => point.y),
    type: 'scatter',
    mode: 'lines',
    name: 'Temperature Profile',
    line: { color: '#1f77b4', width: 3 },
    hovertemplate: 'Temperature: %{x:.1f} K<br>Altitude: %{y:.2f} km<extra></extra>'
  }];

  const temperatureLayout = {
    title: {
      text: 'Atmospheric Temperature Profile',
      font: { size: 16 }
    },
    xaxis: {
      title: plotData.temperature.xLabel,
      titlefont: { size: 14 },
      tickfont: { size: 12 },
      gridcolor: '#e0e0e0',
      showgrid: true
    },
    yaxis: {
      title: plotData.temperature.yLabel,
      titlefont: { size: 14 },
      tickfont: { size: 12 },
      gridcolor: '#e0e0e0',
      showgrid: true
    },
    margin: { l: 80, r: 20, t: 60, b: 60 },
    plot_bgcolor: 'white',
    paper_bgcolor: 'white'
  };

  // Methane profile plot
  const methaneData = [{
    x: plotData.methane.data.map(point => point.x),
    y: plotData.methane.data.map(point => point.y),
    type: 'scatter',
    mode: 'lines',
    name: 'Methane Profile',
    line: { color: '#ff7f0e', width: 3 },
    hovertemplate: 'Methane: %{x:.2e}<br>log(Altitude): %{y:.2f}<extra></extra>'
  }];

  const methaneLayout = {
    title: {
      text: 'Atmospheric Methane Profile',
      font: { size: 16 }
    },
    xaxis: {
      title: plotData.methane.xLabel,
      titlefont: { size: 14 },
      tickfont: { size: 12 },
      gridcolor: '#e0e0e0',
      showgrid: true,
      type: 'log'
    },
    yaxis: {
      title: plotData.methane.yLabel,
      titlefont: { size: 14 },
      tickfont: { size: 12 },
      gridcolor: '#e0e0e0',
      showgrid: true
    },
    margin: { l: 80, r: 20, t: 60, b: 60 },
    plot_bgcolor: 'white',
    paper_bgcolor: 'white'
  };

  const plotConfig = {
    displayModeBar: true,
    displaylogo: false,
    modeBarButtonsToRemove: ['pan2d', 'lasso2d', 'select2d']
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ marginBottom: '20px' }}>
        <h3>Atmospheric Profiles</h3>
        <p style={{ color: '#666', fontSize: '14px' }}>
          Atmospheric temperature and methane concentration profiles from the PyDISORT model.
        </p>
      </div>

      {/* Temperature Profile */}
      <div style={{ marginBottom: '30px' }}>
        <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '10px' }}>
          <Plot
            data={temperatureData}
            layout={temperatureLayout}
            config={plotConfig}
            style={{ width: '100%', height: '400px' }}
          />
        </div>
      </div>

      {/* Methane Profile */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '10px' }}>
          <Plot
            data={methaneData}
            layout={methaneLayout}
            config={plotConfig}
            style={{ width: '100%', height: '400px' }}
          />
        </div>
      </div>

      {/* Data Summary */}
      <div style={{ marginTop: '20px', fontSize: '14px', color: '#666' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          <div>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Temperature Profile</h4>
            <p style={{ margin: '5px 0' }}>
              <strong>Altitude Range:</strong> {Math.min(...plotData.temperature.data.map(p => p.y)).toFixed(2)} - {Math.max(...plotData.temperature.data.map(p => p.y)).toFixed(2)} km
            </p>
            <p style={{ margin: '5px 0' }}>
              <strong>Temperature Range:</strong> {Math.min(...plotData.temperature.data.map(p => p.x)).toFixed(1)} - {Math.max(...plotData.temperature.data.map(p => p.x)).toFixed(1)} K
            </p>
          </div>
          <div>
            <h4 style={{ margin: '0 0 10px 0', color: '#333' }}>Methane Profile</h4>
            <p style={{ margin: '5px 0' }}>
              <strong>Altitude Range:</strong> {Math.min(...plotData.methane.data.map(p => Math.pow(10, p.y))).toFixed(2)} - {Math.max(...plotData.methane.data.map(p => Math.pow(10, p.y))).toFixed(2)} km
            </p>
            <p style={{ margin: '5px 0' }}>
              <strong>Methane Range:</strong> {Math.min(...plotData.methane.data.map(p => p.x)).toExponential(2)} - {Math.max(...plotData.methane.data.map(p => p.x)).toExponential(2)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AtmosphericProfile;
