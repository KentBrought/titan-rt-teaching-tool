import React, { useState, useEffect, useMemo, memo } from 'react';
import Plot from './PlotlyPlot';

const ATMOSPHERE_URL = '/data/atmosphere_vertical_profiles.json';
const HASI_URL = '/data/hasi_atmosphere_profile.json';
const GAS_URL = '/data/gas_profiles.json';
const HAZE_PROFILE_URL = '/data/rt_model_haze_tau.json';

const HAZE_CHANNELS = [3, 68, 255];
const HAZE_TRACE_COLORS = ['#81c784', '#aed581', '#dce775'];

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.json();
}

const plotConfig = {
  displayModeBar: false,
  responsive: true,
  notifications: false
};

const baseLayout = {
  margin: { l: 50, r: 10, t: 28, b: 40 },
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor: 'rgba(26,26,26,1)',
  hovermode: 'closest'
};

function layerBoundaryShapes(boundariesKm, xAxisId = 'x') {
  if (!boundariesKm?.length) return [];
  return boundariesKm.map((b) => ({
    type: 'line',
    layer: 'below',
    xref: 'paper',
    x0: 0,
    x1: 1,
    yref: 'y',
    y0: b,
    y1: b,
    line: { color: 'rgba(255,255,255,0.35)', width: 1, dash: 'dot' }
  }));
}

const GasAbundancePlot = ({
  methaneAbundance = 50,
  profile = 'gases',
  hazeScenarioKey = 'tomasko_1.0',
  hazeScale = 1
}) => {
  const [gasData, setGasData] = useState(null);
  const [atmData, setAtmData] = useState(null);
  const [hasiData, setHasiData] = useState(null);
  const [hazeProfileData, setHazeProfileData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gasError, setGasError] = useState(false);
  const [hasiError, setHasiError] = useState(false);
  const [modelError, setModelError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadForActiveProfile = async () => {
      if (profile === 'gases') {
        if (gasData) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setGasError(false);
        try {
          const data = await fetchJson(GAS_URL);
          if (!cancelled) setGasData(data);
        } catch {
          if (!cancelled) setGasError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      if (profile === 'temperature_pressure') {
        if (atmData && hasiData) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setHasiError(false);
        try {
          const [nextAtmData, nextHasiData] = await Promise.all([
            atmData ? Promise.resolve(atmData) : fetchJson(ATMOSPHERE_URL),
            hasiData ? Promise.resolve(hasiData) : fetchJson(HASI_URL)
          ]);
          if (!cancelled) {
            setAtmData(nextAtmData);
            setHasiData(nextHasiData);
          }
        } catch {
          if (!cancelled) setHasiError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
        return;
      }

      if (profile === 'haze') {
        if (hazeProfileData) {
          setLoading(false);
          return;
        }

        setLoading(true);
        setModelError(false);
        try {
          const data = await fetchJson(HAZE_PROFILE_URL);
          if (!cancelled) setHazeProfileData(data);
        } catch {
          if (!cancelled) setModelError(true);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    };

    loadForActiveProfile();

    return () => {
      cancelled = true;
    };
  }, [profile, gasData, atmData, hasiData, hazeProfileData]);

  const maxAltitude = useMemo(() => {
    if (profile === 'gases' && gasData?.altitude_km) {
      return Math.max(...gasData.altitude_km);
    }
    if (profile === 'temperature_pressure' && hasiData?.altitude_km?.length) {
      return Math.max(...hasiData.altitude_km);
    }
    if (profile === 'haze' && hazeProfileData?.layer_center_km?.length) {
      return Math.max(...hazeProfileData.layer_center_km);
    }
    if (atmData?.altitude_km) {
      return Math.max(...atmData.altitude_km);
    }
    return 50;
  }, [profile, gasData, atmData, hasiData, hazeProfileData]);

  const yAxisDtick = maxAltitude > 120 ? 100 : 10;

  const gasesPlot = useMemo(() => {
    if (!gasData) return null;
    const ch4ScaleFactor = 0.5 + methaneAbundance / 100;
    const traces = [];

    const ch4Gas = gasData.gases['CH4'];
    if (ch4Gas) {
      const scaledCH4 = ch4Gas.mole_fraction.map((v) => v * ch4ScaleFactor);
      traces.push({
        x: scaledCH4,
        y: gasData.altitude_km,
        type: 'scatter',
        mode: 'lines',
        name: 'CH₄',
        xaxis: 'x2',
        line: { color: ch4Gas.color, width: 2.5 },
        hovertemplate: 'CH₄<br>%{x:.3f}<br>%{y:.1f} km<extra></extra>'
      });
    }

    const traceGases = ['H2', 'CO', 'C2H6', 'C2H2'];
    const gasNameMap = { H2: 'H₂', CO: 'CO', C2H6: 'C₂H₆', C2H2: 'C₂H₂' };
    traceGases.forEach((gasKey) => {
      const gas = gasData.gases[gasKey];
      if (!gas) return;
      traces.push({
        x: gas.mole_fraction,
        y: gasData.altitude_km,
        type: 'scatter',
        mode: 'lines',
        name: gasNameMap[gasKey] || gasKey,
        xaxis: 'x',
        line: { color: gas.color, width: 2 },
        hovertemplate: `${gas.name}<br>%{x:.2e}<br>%{y:.1f} km<extra></extra>`
      });
    });

    const layout = {
      ...baseLayout,
      margin: { ...baseLayout.margin, b: 26 },
      xaxis: {
        title: { text: 'Trace Gas Mole Fraction', font: { size: 10, color: '#999' }, standoff: 0 },
        type: 'log',
        showgrid: true,
        gridcolor: 'rgba(255,255,255,0.1)',
        tickfont: { size: 8, color: '#999' },
        tickformat: '.0e',
        range: [-7, -2],
        side: 'bottom',
        domain: [0, 1],
        automargin: false,
      },
      xaxis2: {
        title: { text: 'CH₄ Mole Fraction', font: { size: 10, color: '#00bcd4' }, standoff: 2 },
        type: 'linear',
        showgrid: false,
        tickfont: { size: 8, color: '#00bcd4' },
        tickformat: '.3f',
        range: [0.02, 0.07],
        side: 'top',
        overlaying: 'x',
        anchor: 'y',
        automargin: false,
      },
      yaxis: {
        title: { text: 'Altitude (km)', font: { size: 11, color: '#ccc' }, standoff: 5 },
        showgrid: true,
        gridcolor: 'rgba(255,255,255,0.1)',
        tickfont: { size: 9, color: '#999' },
        range: [0, maxAltitude],
        dtick: yAxisDtick
      },
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
      }
    };

    return { traces, layout };
  }, [gasData, methaneAbundance, maxAltitude, yAxisDtick]);

  const verticalPlot = useMemo(() => {
    const tpBoundaries = atmData?.layer_boundaries_km || [];
    const tpShapes = layerBoundaryShapes(tpBoundaries);

    const altHasi = hasiData?.altitude_km;
    const commonYHasi =
      altHasi?.length > 0
        ? (() => {
            const altMin = Math.min(...altHasi);
            const altMax = Math.max(...altHasi);
            const tpDtick = altMax > 120 ? 100 : 10;
            return {
              title: { text: 'Altitude (km)', font: { size: 11, color: '#ccc' }, standoff: 5 },
              showgrid: true,
              gridcolor: 'rgba(255,255,255,0.1)',
              tickfont: { size: 9, color: '#999' },
              range: [altMin, altMax],
              dtick: tpDtick
            };
          })()
        : null;

    if (profile === 'temperature_pressure' && hasiData && altHasi?.length) {
      return {
        traces: [
          {
            x: hasiData.temperature_K,
            y: altHasi,
            type: 'scatter',
            mode: 'lines',
            name: 'Temperature',
            xaxis: 'x',
            line: { color: '#ff7043', width: 2.5 },
            hovertemplate: '%{x:.1f} K<br>%{y:.1f} km<extra></extra>'
          },
          {
            x: hasiData.pressure_Pa,
            y: altHasi,
            type: 'scatter',
            mode: 'lines',
            name: 'Pressure',
            xaxis: 'x2',
            line: { color: '#7e57c2', width: 2.5 },
            hovertemplate: '%{x:.2e} Pa<br>%{y:.1f} km<extra></extra>'
          }
        ],
        layout: {
          ...baseLayout,
          margin: { ...baseLayout.margin, t: 36 },
          shapes: tpShapes,
          xaxis: {
            title: { text: 'Temperature (K)', font: { size: 10, color: '#ff7043' } },
            showgrid: true,
            gridcolor: 'rgba(255,255,255,0.1)',
            tickfont: { size: 9, color: '#ffab91' },
            domain: [0, 1]
          },
          xaxis2: {
            title: { text: 'Pressure (Pa)', font: { size: 10, color: '#b39ddb' } },
            type: 'log',
            showgrid: false,
            tickfont: { size: 9, color: '#b39ddb' },
            exponentformat: 'e',
            side: 'top',
            overlaying: 'x',
            anchor: 'y'
          },
          yaxis: commonYHasi,
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
          annotations: [
            {
              text: 'HASI L4 in situ profile; dotted lines: radiative-transfer model layer interfaces',
              xref: 'paper',
              yref: 'paper',
              x: 0,
              y: 1.06,
              xanchor: 'left',
              yanchor: 'bottom',
              showarrow: false,
              font: { size: 9, color: '#777' }
            }
          ]
        }
      };
    }

    if (profile === 'haze' && hazeProfileData?.layer_center_km?.length && hazeProfileData?.models) {
      const rawY = hazeProfileData.layer_center_km;
      const fallbackModel = hazeProfileData.models['tomasko_1.0'] || Object.values(hazeProfileData.models)[0];
      const hazeModel = hazeProfileData.models[hazeScenarioKey] || fallbackModel;
      const hazeTauByChannel = hazeModel?.tau_haze || {};
      if (!hazeModel) return null;
      const reversedY = [...rawY].reverse();
      const traces = HAZE_CHANNELS.map((channelIndex, i) => {
        const rawX = hazeTauByChannel[String(channelIndex)] || [];
        const reversedX = [...rawX].reverse().map((v) => (Number.isFinite(v) ? v * hazeScale : null));
        const hasFinite = reversedX.some((v) => Number.isFinite(v));
        if (!hasFinite) return null;
        const labelMap = { 3: '0.93 µm', 68: '2.00 µm', 255: '5.12 µm' };
        return {
          x: reversedX,
          y: reversedY,
          type: 'scatter',
          mode: 'lines+markers',
          name: `τ (${labelMap[channelIndex] || `ch ${channelIndex}`})`,
          line: { color: HAZE_TRACE_COLORS[i] || '#aed581', width: 2 },
          marker: { size: 4, color: HAZE_TRACE_COLORS[i] || '#aed581' },
          hovertemplate: `τ %{x:.4f}<br>%{y:.1f} km<extra></extra>`
        };
      }).filter(Boolean);
      if (!traces.length) return null;
      const y = reversedY;
      const yMin = Math.min(...y);
      const yMax = Math.max(...y);
      const hazeDtick = yMax > 120 ? 100 : 10;
      return {
        traces,
        layout: {
          ...baseLayout,
          xaxis: {
            title: { text: 'Haze optical depth τ (model)', font: { size: 10, color: '#ccc' } },
            showgrid: true,
            gridcolor: 'rgba(255,255,255,0.1)',
            tickfont: { size: 9, color: '#999' }
          },
          yaxis: {
            title: { text: 'Altitude (km)', font: { size: 11, color: '#ccc' }, standoff: 5 },
            showgrid: true,
            gridcolor: 'rgba(255,255,255,0.1)',
            tickfont: { size: 9, color: '#999' },
            range: [yMin, yMax],
            dtick: hazeDtick
          },
          showlegend: true,
          legend: {
            x: 0.98,
            y: 0.98,
            xanchor: 'right',
            yanchor: 'top',
            bgcolor: 'rgba(0,0,0,0.5)',
            bordercolor: '#444',
            borderwidth: 1,
            font: { size: 8, color: '#ccc' }
          },
          annotations: [
            {
              text: `Model haze τ by channel (${hazeScenarioKey}, scale ${hazeScale})`,
              xref: 'paper',
              yref: 'paper',
              x: 0,
              y: 1.04,
              xanchor: 'left',
              yanchor: 'bottom',
              showarrow: false,
              font: { size: 9, color: '#777' }
            }
          ]
        }
      };
    }

    return null;
  }, [atmData, profile, hasiData, hazeScenarioKey, hazeProfileData, hazeScale]);

  if (loading) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#666',
          fontSize: '12px'
        }}
      >
        Loading...
      </div>
    );
  }

  if (profile === 'gases') {
    if (gasError || !gasData) {
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ff6b6b',
            fontSize: '11px',
            textAlign: 'center',
            padding: '10px'
          }}
        >
          Could not load gas profile data ({GAS_URL})
        </div>
      );
    }
    return (
      <div style={{ width: '100%', height: '100%' }}>
        <Plot
          data={gasesPlot.traces}
          layout={gasesPlot.layout}
          config={plotConfig}
          style={{ width: '100%', height: '100%' }}
          useResizeHandler={true}
        />
      </div>
    );
  }

  if (profile === 'temperature_pressure' && (hasiError || !hasiData)) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ff6b6b',
          fontSize: '11px',
          textAlign: 'center',
          padding: '10px'
        }}
      >
        Could not load HASI T/P profile ({HASI_URL})
      </div>
    );
  }

  if (profile === 'haze' && modelError && !hazeProfileData) {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#999',
          fontSize: '11px',
          textAlign: 'center',
          padding: '12px',
          lineHeight: 1.45
        }}
      >
        Could not load haze profile data from the atmospheric model ({HAZE_PROFILE_URL}).
      </div>
    );
  }

  if (!verticalPlot) {
    return null;
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Plot
        data={verticalPlot.traces}
        layout={verticalPlot.layout}
        config={plotConfig}
        style={{ width: '100%', height: '100%' }}
        useResizeHandler={true}
      />
    </div>
  );
};

export default memo(GasAbundancePlot);
