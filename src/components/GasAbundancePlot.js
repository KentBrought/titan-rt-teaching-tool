import React, { useState, useEffect, useMemo } from 'react';
import Plot from 'react-plotly.js';

const ATMOSPHERE_URL = '/data/atmosphere_vertical_profiles.json';
const HASI_URL = '/data/hasi_atmosphere_profile.json';
const RT_HAZE_URL = '/data/rt_model_haze_tau.json';
const GAS_URL = '/data/gas_profiles.json';

const HAZE_CHANNELS = ['3', '68', '255'];
const HAZE_TRACE_COLORS = ['#81c784', '#aed581', '#dce775'];

/** True when RT JSON has τ_haze arrays for the scenario, aligned to layer centers. */
function canRenderHazePlot(data, scenarioKey) {
  if (!data?.layer_center_km?.length) return false;
  const block = data.models?.[scenarioKey];
  if (!block?.tau_haze) return false;
  const n = data.layer_center_km.length;
  return HAZE_CHANNELS.every((ch) => {
    const arr = block.tau_haze[ch];
    return Array.isArray(arr) && arr.length === n;
  });
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

/** Horizontal lines at model layer interfaces (altitude = y) */
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

/**
 * Gas abundances + vertical profiles (T, P, haze) vs altitude.
 * Dropdown in App selects `profile` (gases | temperature_pressure | haze). HASI T+P share one dual-axis plot.
 * Haze uses RT model export rt_model_haze_tau.json (layers.tau.haze); `hazeScenarioKey` matches App haze folder id.
 */
const GasAbundancePlot = ({
  methaneAbundance = 50,
  profile = 'gases',
  hazeScenarioKey = 'tomasko_1.0'
}) => {
  const [gasData, setGasData] = useState(null);
  const [atmData, setAtmData] = useState(null);
  const [hasiData, setHasiData] = useState(null);
  const [rtHazeData, setRtHazeData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gasError, setGasError] = useState(false);
  const [hasiError, setHasiError] = useState(false);
  const [rtHazeError, setRtHazeError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setGasError(false);
      setHasiError(false);
      setRtHazeError(false);
      try {
        const [gasRes, atmRes, hasiRes, rtHazeRes] = await Promise.all([
          fetch(GAS_URL),
          fetch(ATMOSPHERE_URL),
          fetch(HASI_URL),
          fetch(RT_HAZE_URL)
        ]);
        if (!cancelled) {
          if (gasRes.ok) setGasData(await gasRes.json());
          else setGasError(true);
          if (atmRes.ok) setAtmData(await atmRes.json());
          if (hasiRes.ok) setHasiData(await hasiRes.json());
          else setHasiError(true);
          if (rtHazeRes.ok) setRtHazeData(await rtHazeRes.json());
          else setRtHazeError(true);
        }
      } catch {
        if (!cancelled) {
          setGasError(true);
          setHasiError(true);
          setRtHazeError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const maxAltitude = useMemo(() => {
    if (profile === 'gases' && gasData?.altitude_km) {
      return Math.max(...gasData.altitude_km);
    }
    if (profile === 'temperature_pressure' && hasiData?.altitude_km?.length) {
      return Math.max(...hasiData.altitude_km);
    }
    if (profile === 'haze' && rtHazeData?.layer_center_km?.length) {
      return Math.max(...rtHazeData.layer_center_km);
    }
    if (atmData?.altitude_km) {
      return Math.max(...atmData.altitude_km);
    }
    return 50;
  }, [profile, gasData, atmData, hasiData, rtHazeData]);

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
      xaxis: {
        title: { text: 'Trace Gas Mole Fraction', font: { size: 10, color: '#999' }, standoff: 2 },
        type: 'log',
        showgrid: true,
        gridcolor: 'rgba(255,255,255,0.1)',
        tickfont: { size: 8, color: '#999' },
        tickformat: '.0e',
        range: [-7, -2],
        side: 'bottom',
        domain: [0, 1]
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
        anchor: 'y'
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
        ? {
            title: { text: 'Altitude (km)', font: { size: 11, color: '#ccc' }, standoff: 5 },
            showgrid: true,
            gridcolor: 'rgba(255,255,255,0.1)',
            tickfont: { size: 9, color: '#999' },
            range: [0, Math.max(...altHasi, 50)],
            dtick: yAxisDtick
          }
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

    if (profile === 'haze' && canRenderHazePlot(rtHazeData, hazeScenarioKey)) {
      const layerY = rtHazeData.layer_center_km;
      const hazBound = rtHazeData.layer_boundaries_km || [];
      const hzShapes = layerBoundaryShapes(hazBound);
      const block = rtHazeData.models[hazeScenarioKey];
      const wlMap = rtHazeData.channel_index_to_um_approx || {};

      const traces = HAZE_CHANNELS.map((ch, i) => {
        const tauArr = block.tau_haze[ch];
        if (!tauArr?.length) return null;
        const um = wlMap[ch];
        const wlLabel = um != null ? `${Number(um).toFixed(2)} µm` : `ch ${ch}`;
        return {
          x: tauArr,
          y: layerY,
          type: 'scatter',
          mode: 'lines+markers',
          name: `τ (${wlLabel})`,
          line: { color: HAZE_TRACE_COLORS[i] || '#aed581', width: 2 },
          marker: { size: 5, color: HAZE_TRACE_COLORS[i] || '#aed581' },
          hovertemplate: `τ %{x:.4f}<br>%{y:.1f} km (${wlLabel})<extra></extra>`
        };
      }).filter(Boolean);

      if (!traces.length) return null;

      const yMax = Math.max(...layerY, 50);
      return {
        traces,
        layout: {
          ...baseLayout,
          shapes: hzShapes,
          xaxis: {
            title: { text: 'Haze optical depth τ (model layers.tau.haze)', font: { size: 10, color: '#ccc' } },
            showgrid: true,
            gridcolor: 'rgba(255,255,255,0.1)',
            tickfont: { size: 9, color: '#999' },
            exponentformat: 'e'
          },
          yaxis: {
            title: { text: 'Altitude (km)', font: { size: 11, color: '#ccc' }, standoff: 5 },
            showgrid: true,
            gridcolor: 'rgba(255,255,255,0.1)',
            tickfont: { size: 9, color: '#999' },
            range: [0, yMax],
            dtick: 10
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
              text: `RT model haze (scenario: ${hazeScenarioKey}); dotted lines: layer interfaces`,
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
  }, [atmData, profile, hasiData, yAxisDtick, rtHazeData, hazeScenarioKey]);

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

  if (profile === 'haze' && (rtHazeError || !rtHazeData)) {
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
        Could not load model haze data ({RT_HAZE_URL})
      </div>
    );
  }

  if (profile === 'haze' && rtHazeData && !canRenderHazePlot(rtHazeData, hazeScenarioKey)) {
    const keys = rtHazeData.models ? Object.keys(rtHazeData.models) : [];
    const keysNote = keys.length ? ` Scenarios in file: ${keys.join(', ')}.` : '';
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
        Haze profile uses model data only. Add <code style={{ color: '#bbb' }}>layers.tau.haze</code> for
        scenario <strong style={{ color: '#ccc' }}>{hazeScenarioKey}</strong> to{' '}
        <code style={{ color: '#bbb' }}>{RT_HAZE_URL}</code>
        (see <code style={{ color: '#bbb' }}>scripts/build_rt_model_haze_tau_json.py</code>).
        {keysNote}
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

export default GasAbundancePlot;
