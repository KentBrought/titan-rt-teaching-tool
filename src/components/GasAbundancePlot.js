import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';

/**
 * GasAbundancePlot - Displays gas mole fractions vs altitude for Titan atmosphere
 * Gases: N2, CH4, H2, CO, C2H6, C2H2
 * CH4 profile based on Huygens GCMS measurements (Niemann et al. 2010)
 * Trace gases use constant values from PyDISORT model
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

    // bye bye nitrogen

    const gasOrder = ['CH4', 'H2', 'CO', 'C2H6', 'C2H2'];
    
    return gasOrder.map(gasKey => {
      const gas = profileData.gases[gasKey];
      if (!gas) return null;

      let moleFractions = gas.mole_fraction;
      
      // Apply scaling only to CH4
      if (gasKey === 'CH4') {
        moleFractions = moleFractions.map(v => v * ch4ScaleFactor);
      }

      return {
        x: moleFractions,
        y: profileData.altitude_km,
        type: 'scatter',
        mode: 'lines',
        name: gasKey,
        line: {
          color: gas.color,
          width: 2
        },
        hovertemplate: `${gas.name}<br>%{x:.2e}<br>%{y:.1f} km<extra></extra>`
      };
    }).filter(Boolean);
  };

  // Get max altitude from data for y-axis scaling
  const maxAltitude = profileData ? Math.max(...profileData.altitude_km) : 50;

  const plotLayout = {
    xaxis: {
      title: {
        text: 'Mole Fraction',
        font: { size: 11, color: '#ccc' },
        standoff: 5
      },
      type: 'log',
      showgrid: true,
      gridcolor: 'rgba(255,255,255,0.1)',
      tickfont: { size: 9, color: '#999' },
      tickformat: '.0e',
      range: [-7, 0], // log scale: 10^-7 to 1
      side: 'bottom'
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
    margin: { l: 50, r: 10, t: 10, b: 40 },
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