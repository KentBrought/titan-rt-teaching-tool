import React, { useState, useEffect } from 'react';
import Plot from 'react-plotly.js';

/**
 * GasAbundancePlot - Displays methane mole fraction vs altitude for Titan atmosphere
 * Based on Huygens GCMS measurements (Niemann et al. 2010)
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
        const response = await fetch('/data/methane_profile.json');
        if (!response.ok) {
          throw new Error('Failed to load methane profile data');
        }
        const data = await response.json();
        setProfileData(data);
        setError(null);
      } catch (err) {
        console.error('Error loading methane profile:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadProfileData();
  }, []);

  // Calculate scaled methane values based on abundance slider
  const getScaledMethane = () => {
    if (!profileData) return { x: [], y: [] };

    // methaneAbundance slider: 0-100, where 50 is the default/baseline
    // Scale factor: at 50 = 1.0, at 0 = 0.5, at 100 = 1.5
    const scaleFactor = 0.5 + (methaneAbundance / 100);

    const scaledCH4 = profileData.ch4_mole_fraction.map(val => val * scaleFactor);

    return {
      x: scaledCH4,
      y: profileData.altitude_km
    };
  };

  const plotData = profileData ? [{
    ...getScaledMethane(),
    type: 'scatter',
    mode: 'lines',
    name: 'CH₄',
    line: {
      color: '#00bcd4',
      width: 2.5
    },
    hovertemplate: 'CH₄: %{x:.3f}<br>Alt: %{y:.1f} km<extra></extra>'
  }] : [];

  const plotLayout = {
    xaxis: {
      title: {
        text: 'CH₄ Mole Fraction',
        font: { size: 11, color: '#ccc' },
        standoff: 5
      },
      type: 'log',
      showgrid: true,
      gridcolor: 'rgba(255,255,255,0.1)',
      tickfont: { size: 9, color: '#999' },
      tickformat: '.2f',
      range: [-2, -1], // log scale: 0.01 to 0.1
      dtick: 0.5,
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
      range: [0, 150],
      dtick: 30
    },
    margin: { l: 45, r: 10, t: 10, b: 40 },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(26,26,26,1)',
    showlegend: false,
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
        data={plotData}
        layout={plotLayout}
        config={plotConfig}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler={true}
      />
    </div>
  );
};

export default GasAbundancePlot;

