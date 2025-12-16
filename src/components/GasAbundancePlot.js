import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';

/**
 * GasAbundancePlot - Displays gas mole fractions vs altitude for Titan atmosphere
 * Gases: CH4, H2, CO, C2H6, C2H2
 * CH4 on linear scale (top x-axis) to show variability
 * Trace gases on log scale (bottom x-axis)
 */
const GasAbundancePlot = ({ methaneAbundance = 50 }) => {
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load profile data on mount
  useEffect(() => {
    const loadProfileData = async () => {
      try {
        setLoading(true);
        const response = await fetch('/data/gas_profiles.json');
        if (!response.ok) {
          throw new Error('Failed to load gas profile data');
        }
        const data = await response.json();
        setProfileData(data);
        setError(null);
      } catch (err) {
        console.error('Error loading gas profiles:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
  }, []);

  // Build plot traces for all gases
  const getPlotData = () => {
    if (!profileData) return [];

    // CH4 scale factor: at 50 = 1.0, at 0 = 0.5, at 100 = 1.5
    const ch4ScaleFactor = 0.5 + (methaneAbundance / 100);

    const traces = [];
    
    // CH4 on linear scale (x2 axis - top)
    const ch4Gas = profileData.gases['CH4'];
    if (ch4Gas) {
      const scaledCH4 = ch4Gas.mole_fraction.map(v => v * ch4ScaleFactor);
      traces.push({
        x: scaledCH4,
        y: profileData.altitude_km,
        type: 'scatter',
        mode: 'lines',
        name: 'CH₄',
        xaxis: 'x2',
        line: {
          color: ch4Gas.color,
          width: 2.5
        },
        hovertemplate: `CH₄<br>%{x:.3f}<br>%{y:.1f} km<extra></extra>`
      });
    }

    // Trace gases on log scale (x axis - bottom)
    const traceGases = ['H2', 'CO', 'C2H6', 'C2H2'];
    const gasNameMap = {
      'H2': 'H₂',
      'CO': 'CO',
      'C2H6': 'C₂H₆',
      'C2H2': 'C₂H₂'
    };
    traceGases.forEach(gasKey => {
      const gas = profileData.gases[gasKey];
      if (!gas) return;

      traces.push({
        x: gas.mole_fraction,
        y: profileData.altitude_km,
        type: 'scatter',
        mode: 'lines',
        name: gasNameMap[gasKey] || gasKey,
        xaxis: 'x',
        line: {
          color: gas.color,
          width: 2
        },
        hovertemplate: `${gas.name}<br>%{x:.2e}<br>%{y:.1f} km<extra></extra>`
      });
    });

    return traces;
  };

  // Get max altitude from data for y-axis scaling
  const maxAltitude = profileData ? Math.max(...profileData.altitude_km) : 50;

  const plotLayout = {
    // Bottom x-axis (log scale for trace gases)
    xaxis: {
      title: {
        text: 'Trace Gas Mole Fraction',
        font: { size: 10, color: '#999' },
        standoff: 2
      },
      type: 'log',
      showgrid: true,
      gridcolor: 'rgba(255,255,255,0.1)',
      tickfont: { size: 8, color: '#999' },
      tickformat: '.0e',
      range: [-7, -2],
      side: 'bottom',
      domain: [0, 1]
    },
    // Top x-axis (linear scale for CH4)
    xaxis2: {
      title: {
        text: 'CH₄ Mole Fraction',
        font: { size: 10, color: '#00bcd4' },
        standoff: 2
      },
      type: 'linear',
      showgrid: false,
      tickfont: { size: 8, color: '#00bcd4' },
      tickformat: '.3f',
      range: [0.02, 0.07],
      side: 'top',
      overlaying: 'x',
      anchor: 'y'
    },
    yaxis: {
      title: {
        text: 'Altitude (km)',
        font: { size: 11, color: '#ccc' },
        standoff: 5
      },
      showgrid: true,
      gridcolor: 'rgba(255,255,255,0.1)',
      tickfont: { size: 9, color: '#999' },
      range: [0, maxAltitude],
      dtick: 10
    },
    margin: { l: 50, r: 10, t: 40, b: 45 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(26,26,26,1)',
    showlegend: true,
    legend: {
      x: 0.98,
      y: 0.98,
      xanchor: 'right',
      yanchor: 'top',
      bgcolor: 'rgba(0,0,0,0.5)',
      bordercolor: '#444',
      borderwidth: 1,
      font: { size: 9, color: '#ccc' }
    },
    hovermode: 'closest'
  };

  const plotConfig = {
    displayModeBar: false,
    responsive: true
  };

  if (loading) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: '#666',
        fontSize: '12px'
      }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        color: '#ff6b6b',
        fontSize: '11px',
        textAlign: 'center',
        padding: '10px'
      }}>
        Error loading profile data
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Plot
        data={getPlotData()}
        layout={plotLayout}
        config={plotConfig}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler={true}
      />
    </div>
  );
};

export default GasAbundancePlot;