import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { processSpectralData, createSpectralPlotData, getActualAngles } from '../utils/dataProcessing';
import { getSurfaceMaterialLabel } from '../utils/materialMapLoader';

// Helper function to adjust color brightness
const adjustColorBrightness = (hex, percent) => {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000FF) + percent));
  return '#' + (0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1);
};

// Helper function to format angles briefly for legend labels
const formatAngles = (incidence, emission, phase) => {
  const i = incidence != null ? incidence.toFixed(0) : '?';
  const e = emission != null ? emission.toFixed(0) : '?';
  const p = phase != null ? phase.toFixed(0) : '?';
  return `i:${i}° e:${e}° p:${p}°`;
};

const formatSurfaceMaterial = (materialClass, surfaceAlbedo) => {
  if (!Number.isFinite(materialClass)) return '';
  const name = getSurfaceMaterialLabel(materialClass);
  if (Number.isFinite(surfaceAlbedo)) return `${name} A:${surfaceAlbedo}`;
  return name;
};

const GAUSSIAN_SIGMA_INDEX = {
  high: 0.85,
  medium: 2.5,
  low: 6.5,
  verylow: 10,
};

const interpolateOntoGrid = (x, y, xq) => {
  if (!x?.length || !y?.length || x.length !== y.length || !xq?.length) return [];
  const out = new Array(xq.length);
  for (let i = 0; i < xq.length; i++) {
    const t = xq[i];
    if (t <= x[0]) {
      out[i] = y[0];
      continue;
    }
    if (t >= x[x.length - 1]) {
      out[i] = y[y.length - 1];
      continue;
    }
    let lo = 0;
    let hi = x.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (x[mid] <= t) lo = mid;
      else hi = mid;
    }
    const w1 = x[lo];
    const w2 = x[hi];
    const f = (t - w1) / (w2 - w1);
    out[i] = y[lo] + f * (y[hi] - y[lo]);
  }
  return out;
};

const convolveGaussian1D = (values, sigma) => {
  if (!values?.length) return [];
  if (sigma < 0.25) return values.slice();
  const n = values.length;
  const radius = Math.min(n - 1, Math.max(1, Math.ceil(3 * sigma)));
  const kernel = [];
  let kSum = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(w);
    kSum += w;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= kSum;
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -radius; k <= radius; k++) {
      const j = i + k;
      const v = j < 0 ? values[0] : j >= n ? values[n - 1] : values[j];
      acc += v * kernel[k + radius];
    }
    out[i] = acc;
  }
  return out;
};

const applySpectralResolution = (modelWl, modelI, gasWavelengths, resolution, numBinsTarget) => {
  if (!modelWl?.length || !modelI?.length) {
    return { wavelengths: [], intensities: [] };
  }
  if (!gasWavelengths?.length) {
    return downsampleSpectrum(modelWl, modelI, numBinsTarget);
  }

  const onGrid = interpolateOntoGrid(modelWl, modelI, gasWavelengths);
  const sigma = GAUSSIAN_SIGMA_INDEX[resolution] ?? GAUSSIAN_SIGMA_INDEX.high;
  const smoothed = convolveGaussian1D(onGrid, sigma);

  if (numBinsTarget >= gasWavelengths.length) {
    return { wavelengths: gasWavelengths.slice(), intensities: smoothed };
  }
  return downsampleSpectrum(gasWavelengths, smoothed, numBinsTarget);
};

const downsampleSpectrum = (wavelengths, intensities, numBins) => {
  if (!wavelengths || !intensities || wavelengths.length === 0) {
    return { wavelengths: [], intensities: [] };
  }

  if (wavelengths.length <= numBins) {
    return { wavelengths: Array.from(wavelengths), intensities: Array.from(intensities) };
  }

  const minWave = wavelengths[0];
  const maxWave = wavelengths[wavelengths.length - 1];
  const binWidth = (maxWave - minWave) / numBins;

  const binnedWavelengths = [];
  const binnedIntensities = [];

  for (let i = 0; i < numBins; i++) {
    const binStart = minWave + i * binWidth;
    const binEnd = binStart + binWidth;
    const binCenter = (binStart + binEnd) / 2;

    let sum = 0;
    let count = 0;

    for (let j = 0; j < wavelengths.length; j++) {
      const w = wavelengths[j];
      if (w >= binStart && w < binEnd) {
        sum += intensities[j];
        count++;
      }
    }

    if (i === numBins - 1) {
      for (let j = 0; j < wavelengths.length; j++) {
        const w = wavelengths[j];
        if (w === binEnd) {
          sum += intensities[j];
          count++;
        }
      }
    }

    if (count > 0) {
      binnedWavelengths.push(binCenter);
      binnedIntensities.push(sum / count);
    }
  }

  return { wavelengths: binnedWavelengths, intensities: binnedIntensities };
};

const RESOLUTION_BINS = {
  'high': 256,
  'medium': 64,
  'low': 16,
  'verylow': 8
};

const SpectralPlot = ({
  spectralData,
  incidenceAngle,
  emissionAngle,
  azimuthAngle: propAzimuthAngle,
  selectedCases,
  plotMultiple,
  multiplePositions,
  geoValues,
  transmissionToggles = {},
  spectralUnits = false,
  albedo = 0.1,
  spectralResolution = 'high',
  selectedPhaseAngle = null,
  spectralLoading = false
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

  // Get the number of bins for current resolution
  const numBins = RESOLUTION_BINS[spectralResolution] || RESOLUTION_BINS['high'];
  const azimuthAngle = Number.isFinite(propAzimuthAngle)
    ? propAzimuthAngle
    : (!plotMultiple && geoValues && !Array.isArray(geoValues)
      ? (geoValues.azimuth ?? 0)
      : 0);

  // Memoize plot data generation for performance - use useMemo to prevent blocking
  const plotData = useMemo(() => {
    if (!processedData) return [];

    const traces = [];
    const colors = ['#ff0000', '#ffa500', '#ffff00', '#00ff00', '#0000ff', '#800080'];
    const colorNames = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];

    if (plotMultiple && Array.isArray(geoValues) && geoValues.length > 0) {
      // Multiple mode: create traces for each point and each selected case
      geoValues.forEach((geoValue, pointIndex) => {
        const pointCases = selectedCases[pointIndex] || { standard: true, no_ch4: false, no_haze: false };
        const pointIncidence = Number.isFinite(geoValue.incidence) ? geoValue.incidence : NaN;
        const pointEmission = Number.isFinite(geoValue.emis) ? geoValue.emis : NaN;
        const pointAzimuth = Number.isFinite(geoValue.azimuth) ? geoValue.azimuth : NaN;
        const pointAlbedo = Number.isFinite(geoValue?.surfaceAlbedo) ? geoValue.surfaceAlbedo : albedo;

        // Count how many cases are selected for this point to determine shade variations
        const selectedCaseTypes = Object.entries(pointCases)
          .filter(([_, isSelected]) => isSelected)
          .map(([caseType, _]) => caseType);
        // Use colorIndex from geoValue if available, otherwise fall back to array index
        const colorIndex = geoValue.colorIndex !== undefined ? geoValue.colorIndex : pointIndex;
        const baseColor = colors[colorIndex] || '#ff0000';
        const pointColor = colorNames[colorIndex] || 'Red';

        // Create traces for each selected case with different shades
        selectedCaseTypes.forEach((caseType, caseIndex) => {
          const data = createSpectralPlotData(
            processedData,
            pointIncidence,
            pointEmission,
            pointAzimuth,
            caseType,
            pointAlbedo
          );

          if (data && data.wavelengths && data.wavelengths.length > 0) {
            // Apply resolution downsampling
            let wavelengths = data.wavelengths;
            let intensities = data.intensities;

            // Convert to flux units if spectralUnits is enabled (before downsampling)
            if (spectralUnits && solarSpectrum) {
              intensities = intensities.map((reflectance, idx) => {
                const wavelength = wavelengths[idx];
                const solarFlux = getSolarFlux(wavelength);
                return reflectance * solarFlux;
              });
            }

            const resolved = applySpectralResolution(
              wavelengths,
              intensities,
              gasTransmissionData?.wavelength,
              spectralResolution,
              numBins
            );
            wavelengths = resolved.wavelengths;
            intensities = resolved.intensities;

            const nameMap = {
              standard: 'CH₄ + haze',
              no_ch4: 'No CH₄',
              no_haze: 'No haze'
            };
            const caseName = nameMap[caseType] || caseType.replace('_', ' ').replace(/^\w/, c => c.toUpperCase());
            // Get actual angles for this point
            const actual = getActualAngles(processedData, pointIncidence, pointEmission, pointAzimuth);
            const phase = Number.isFinite(selectedPhaseAngle)
              ? selectedPhaseAngle
              : (geoValue.phase ?? (actual.incidence + actual.emission));
            const materialTag = formatSurfaceMaterial(geoValue?.materialClass, pointAlbedo);
            const traceName = `${caseName}${materialTag ? ` [${materialTag}]` : ''} (${formatAngles(actual.incidence, actual.emission, phase)})`;

            // Use different shades of the same color for multiple components
            let lineColor = baseColor;
            if (selectedCaseTypes.length > 1) {
              if (caseType === 'standard') {
                lineColor = baseColor;
              } else if (caseType === 'no_ch4') {
                lineColor = adjustColorBrightness(baseColor, -80);
              } else if (caseType === 'no_haze') {
                lineColor = adjustColorBrightness(baseColor, 80);
              }
            } else {
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
              mode: 'lines+markers',
              name: traceName,
              meta: {
                pointIndex,
                simLat: Number.isFinite(geoValue?.lat) ? geoValue.lat : null,
                simLon: Number.isFinite(geoValue?.lon) ? geoValue.lon : null,
                simIncidence: Number.isFinite(actual?.incidence) ? actual.incidence : null,
                simEmission: Number.isFinite(actual?.emission) ? actual.emission : null,
                simPhase: Number.isFinite(phase) ? phase : null,
              },
              line: {
                color: lineColor,
                width: 2,
                dash: dashStyle
              },
              marker: {
                size: numBins < 64 ? 6 : 0,
                color: lineColor
              }
            });
          }
        });
      });
    } else if (!plotMultiple && geoValues) {
      // Single mode: use the original logic
      const surfaceAlbedo = Number.isFinite(geoValues?.surfaceAlbedo) ? geoValues.surfaceAlbedo : albedo;
      const selectedIncidence = Number.isFinite(incidenceAngle) ? incidenceAngle : NaN;
      const selectedEmission = Number.isFinite(emissionAngle) ? emissionAngle : NaN;
      const selectedAzimuth = Number.isFinite(azimuthAngle) ? azimuthAngle : NaN;
      Object.entries(selectedCases).forEach(([caseType, isSelected]) => {
        if (isSelected) {
          const data = createSpectralPlotData(
            processedData,
            selectedIncidence,
            selectedEmission,
            selectedAzimuth,
            caseType,
            surfaceAlbedo
          );

          if (data && data.wavelengths && data.wavelengths.length > 0) {
            let wavelengths = data.wavelengths;
            let intensities = data.intensities;

            // Convert to flux units if spectralUnits is enabled (before downsampling)
            if (spectralUnits && solarSpectrum) {
              intensities = intensities.map((reflectance, idx) => {
                const wavelength = wavelengths[idx];
                const solarFlux = getSolarFlux(wavelength);
                return reflectance * solarFlux;
              });
            }

            const resolved = applySpectralResolution(
              wavelengths,
              intensities,
              gasTransmissionData?.wavelength,
              spectralResolution,
              numBins
            );
            wavelengths = resolved.wavelengths;
            intensities = resolved.intensities;

            const nameMap = {
              standard: 'CH₄ + haze',
              no_ch4: 'No CH₄',
              no_haze: 'No haze'
            };
            const caseName = nameMap[caseType] || caseType.replace('_', ' ').replace(/^\w/, c => c.toUpperCase());
            const actual = getActualAngles(processedData, incidenceAngle, emissionAngle, azimuthAngle);
            const phase = Number.isFinite(selectedPhaseAngle)
              ? selectedPhaseAngle
              : (geoValues.phase ?? (actual.incidence + actual.emission));
            const materialTag = formatSurfaceMaterial(geoValues?.materialClass, surfaceAlbedo);
            const traceName = `${caseName}${materialTag ? ` [${materialTag}]` : ''} (${formatAngles(actual.incidence, actual.emission, phase)})`;
            traces.push({
              x: wavelengths,
              y: intensities,
              type: 'scattergl',
              mode: 'lines+markers',
              name: traceName,
              line: {
                color: caseType === 'standard' ? '#1f77b4' :
                  caseType === 'no_ch4' ? '#ff7f0e' : '#2ca02c',
                width: 2
              },
              marker: {
                size: numBins < 64 ? 6 : 0,
                color: caseType === 'standard' ? '#1f77b4' :
                  caseType === 'no_ch4' ? '#ff7f0e' : '#2ca02c'
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

          let gasWavelengths = gasTransmissionData.wavelength;
          let gasTransmission = gasData.transmission;
          const gasResolved = applySpectralResolution(
            gasWavelengths,
            gasTransmission,
            gasWavelengths,
            spectralResolution,
            numBins
          );
          gasWavelengths = gasResolved.wavelengths;
          gasTransmission = gasResolved.intensities;

          traces.push({
            x: gasWavelengths,
            y: gasTransmission,
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
  }, [processedData, incidenceAngle, emissionAngle, azimuthAngle, selectedCases, plotMultiple, geoValues, transmissionToggles, gasTransmissionData, spectralUnits, solarSpectrum, getSolarFlux, albedo, numBins, spectralResolution, selectedPhaseAngle]);

  // Update actualAngles in a separate effect to avoid infinite loop
  useEffect(() => {
    if (!processedData || !geoValues) return;

    if (plotMultiple && Array.isArray(geoValues) && geoValues.length > 0) {
      const geoValue = geoValues[0];
      const actual = getActualAngles(processedData, geoValue.incidence ?? 0, geoValue.emis ?? 0, 0);
      setActualAngles(actual);
    } else if (!plotMultiple && !Array.isArray(geoValues)) {
      const actual = getActualAngles(processedData, incidenceAngle, emissionAngle, 0);
      setActualAngles(actual);
    }
  }, [processedData, geoValues, plotMultiple, incidenceAngle, emissionAngle]);

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
      <div style={{ padding: '20px', textAlign: 'center', height: '100%', minHeight: '320px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p>Loading spectral data...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 0, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      {/* Plot */}
      <div style={{ flex: '1 1 auto', minHeight: '320px', border: '1px solid #444', borderRadius: '8px', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', overflow: 'hidden', backgroundColor: '#1a1a1a' }}>
        <Plot
          data={plotData}
          layout={plotLayout}
          style={{ width: '100%', height: '100%', maxWidth: '100%' }}
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
        marginTop: '10px',
        padding: '8px',
        backgroundColor: '#2a2a2a',
        borderRadius: '4px',
        border: '1px solid #4a9d4a',
        fontSize: '13px',
        color: '#e0e0e0',
        width: '100%',
        maxWidth: '100%',
        boxSizing: 'border-box'
      }}>
        {(() => {
          // Check if cases are selected
          let hasSelectedCases = false;
          const pointColors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
          if (geoValues) {
            if (plotMultiple && Array.isArray(geoValues)) {
              hasSelectedCases = geoValues.some((_, idx) => {
                const pointCases = selectedCases[idx] || {};
                return Object.values(pointCases).some(v => v === true);
              });
            } else if (!plotMultiple) {
              hasSelectedCases = selectedCases && Object.values(selectedCases).some(v => v === true);
            }
          }

          const hasDataToPlot = plotData && plotData.some(trace =>
            !trace.yaxis &&
            trace.x && trace.x.length > 0 && trace.y && trace.y.length > 0
          );

          const showAngles = geoValues && hasSelectedCases;
          const pointsWithSpectrum = (plotMultiple && Array.isArray(geoValues))
            ? new Set(
              (plotData || [])
                .filter((trace) =>
                  !trace?.yaxis &&
                  Array.isArray(trace?.x) && trace.x.length > 0 &&
                  Array.isArray(trace?.y) && trace.y.length > 0 &&
                  Number.isFinite(trace?.meta?.pointIndex)
                )
                .map((trace) => trace.meta.pointIndex)
            )
            : new Set();
          const pointSimMetaByIndex = (plotMultiple && Array.isArray(geoValues))
            ? (() => {
              const map = new Map();
              (plotData || []).forEach((trace) => {
                if (trace?.yaxis) return;
                if (!Array.isArray(trace?.x) || trace.x.length === 0) return;
                if (!Array.isArray(trace?.y) || trace.y.length === 0) return;
                const idx = trace?.meta?.pointIndex;
                if (!Number.isFinite(idx) || map.has(idx)) return;
                map.set(idx, trace.meta || {});
              });
              return map;
            })()
            : new Map();
          const multiPointSummaries = (plotMultiple && Array.isArray(geoValues))
            ? geoValues.map((gv, idx) => {
              const colorIndex = Number.isFinite(gv?.colorIndex) ? gv.colorIndex : idx;
              const colorName = pointColors[colorIndex] || `#${idx + 1}`;
              const simMeta = pointSimMetaByIndex.get(idx);
              const nearestFromData = processedData
                ? getActualAngles(
                  processedData,
                  Number.isFinite(gv?.incidence) ? gv.incidence : NaN,
                  Number.isFinite(gv?.emis) ? gv.emis : NaN,
                  Number.isFinite(gv?.azimuth) ? gv.azimuth : NaN,
                )
                : null;
              const latVal = Number.isFinite(simMeta?.simLat) ? simMeta.simLat : gv?.lat;
              const lonVal = Number.isFinite(simMeta?.simLon) ? simMeta.simLon : gv?.lon;
              const incVal = Number.isFinite(simMeta?.simIncidence) ? simMeta.simIncidence : nearestFromData?.incidence;
              const emiVal = Number.isFinite(simMeta?.simEmission) ? simMeta.simEmission : nearestFromData?.emission;
              const phaseVal = Number.isFinite(selectedPhaseAngle)
                ? selectedPhaseAngle
                : Number.isFinite(simMeta?.simPhase)
                  ? simMeta.simPhase
                  : (
                    Number.isFinite(nearestFromData?.incidence) && Number.isFinite(nearestFromData?.emission)
                      ? (nearestFromData.incidence + nearestFromData.emission)
                      : NaN
                  );
              const lat = Number.isFinite(latVal) ? latVal.toFixed(2) : 'N/A';
              const lon = Number.isFinite(lonVal) ? lonVal.toFixed(2) : 'N/A';
              const inc = Number.isFinite(incVal) ? incVal.toFixed(1) : 'N/A';
              const emi = Number.isFinite(emiVal) ? emiVal.toFixed(1) : 'N/A';
              const phase = Number.isFinite(phaseVal) ? phaseVal.toFixed(1) : 'N/A';
              const pxX = Number.isFinite(gv?.x) ? gv.x : 'N/A';
              const pxY = Number.isFinite(gv?.y) ? gv.y : 'N/A';
              const status = spectralLoading
                ? 'updating'
                : (pointsWithSpectrum.has(idx) ? 'loaded' : 'no spectrum');
              return {
                key: `summary-${idx}`,
                idx,
                colorName,
                lat,
                lon,
                inc,
                emi,
                phase,
                pxX,
                pxY,
                status,
              };
            })
            : [];

          return (
            <>
              {!hasDataToPlot && geoValues && hasSelectedCases ? (
                <span style={{ color: '#ff6b6b' }}>
                  No spectrum within 10° of this point — click closer on the image.
                </span>
              ) : (
                <>
                  <strong>Current Selection:</strong> {
                    !geoValues ? (
                      null
                    ) : showAngles ? (
                      plotMultiple && Array.isArray(geoValues) && geoValues.length > 1 ? (
                        `Multiple points selected (${geoValues.length})`
                      ) : (
                        <>Incidence: {(actualAngles.incidence ?? 0).toFixed(2)}°, Emission: {(actualAngles.emission ?? 0).toFixed(2)}°, Azimuth: {(actualAngles.azimuth ?? 0).toFixed(2)}°, Albedo: {albedo}</>
                      )
                    ) : (
                      null
                    )
                  }
                  {plotMultiple && multiPointSummaries.length > 0 && (
                    <div style={{ marginTop: '4px', maxHeight: '96px', overflowY: 'auto' }}>
                      {multiPointSummaries.map((summary) => (
                        <div
                          key={summary.key}
                          style={{
                            margin: 0,
                            fontSize: '11px',
                            lineHeight: 1.25,
                            color: '#c9d8e7',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}
                          title={`P${summary.idx + 1} (${summary.colorName}); lat: ${summary.lat}; lon: ${summary.lon}; i: ${summary.inc}; e: ${summary.emi}; p: ${summary.phase}; px: (${summary.pxX},${summary.pxY}); ${summary.status}`}
                        >
                          P{summary.idx + 1} ({summary.colorName}); lat: {summary.lat}; lon: {summary.lon}; i: {summary.inc}; e: {summary.emi}; p: {summary.phase}; px: ({summary.pxX},{summary.pxY}); {summary.status}
                        </div>
                      ))}
                    </div>
                  )}
                  {!hasSelectedCases && (
                    <span style={{ color: '#ff6b6b', marginLeft: '10px' }}>
                      ⚠️ Please select at least one case to display
                    </span>
                  )}
                  {showAngles && numBins < 256 && (
                    <span style={{ color: '#999', marginLeft: '10px' }}>
                      | Resolution: {numBins} bins
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

