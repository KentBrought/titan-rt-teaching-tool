import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import './App.css';
import SpectralPlot from './components/SpectralPlot';
import ClickableImage from './components/ClickableImage';
import GasAbundancePlot from './components/GasAbundancePlot';
import ErrorBoundary from './components/ErrorBoundary';
import UserGuide from './components/UserGuide';
import Header from './components/Header';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import Tooltip from './components/Tooltip';
import SphereView from './components/SphereView';
import { loadJsonFile, clearDataCache } from './utils/dataLoader';
import { loadPds4Image, getAvailablePhaseAngles, preloadAdjacentImages } from './utils/imageLoader';
import { extractGeoValues, getGeoCubeData, getGeoValue } from './utils/geoCubeLoader';
import { processSpectralData, createSpectralPlotData } from './utils/dataProcessing';
import {
  loadMaterialAlbedoMap,
  getMaterialClassAtPixel,
  mapMaterialClassToSpectralAlbedo,
  formatSurfaceMaterialWithSpectrumAlbedo,
  getSurfaceMaterialLabel,
} from './utils/materialMapLoader';

const FIXED_ALBEDO = 0.1;
const MAX_SELECTED_POINTS = 5;
const isFiniteNumber = (value) => Number.isFinite(value);
const toFiniteOrNull = (value) => (Number.isFinite(value) ? value : null);

// Memoized component for geoValues display to prevent unnecessary re-renders
const GeoValuesDisplay = memo(({ geoValues, plotMultiple, loadingGeo, showPointCoordinates = true }) => {
  const colors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
  const colorValues = ['#ff0000', '#ffa500', '#ffff00', '#00ff00', '#0000ff', '#800080'];
  if (!geoValues) return null;

  return (
    <div className="geo-values-box" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ fontSize: '18px', marginBottom: '15px', color: '#e0e0e0' }}>
        {plotMultiple ? 'Selected Points' : 'Selected Point'}
      </h3>
      <div className="geo-values-scroll" style={{ flex: '1 1 auto', overflowY: 'auto' }}>
        {Array.isArray(geoValues) ? (
          // Multiple positions mode
          geoValues.map((values, index) => {
            // Use colorIndex from geoValues if available, otherwise fall back to array index
            const colorIndex = values.colorIndex !== undefined ? values.colorIndex : index;
            const colorNames = colors[colorIndex] || 'Red';
            const colorValue = colorValues[colorIndex] || '#ff0000';
            return (
              <div key={`${values.x}-${values.y}-${index}`}>
                <div style={{ marginBottom: '10px' }}>
                  <h4 style={{ marginBottom: '5px', fontSize: '16px', color: '#e0e0e0' }}>
                    Point {index + 1} (<span style={{ color: colorValue }}>{colorNames}</span>)
                  </h4>
                  <p style={{ fontSize: '12px', color: '#999', marginBottom: '10px' }}>
                    (<span style={{ color: '#007acc', fontWeight: 'bold' }}>{values.x}, {values.y}</span>)
                  </p>
                </div>
                {values.error ? (
                  <p style={{ color: '#ff6b6b' }}>Error: {values.error}</p>
                ) : (
                  <div style={{ fontSize: '14px', color: '#ccc' }}>
                    <p><strong>Latitude:</strong> {isFiniteNumber(values.lat) ? `${values.lat.toFixed(4)}° ${values.lat < 0 ? 'N' : 'S'}` : 'N/A'}</p>
                    <p><strong>Longitude:</strong> {isFiniteNumber(values.lon) ? `${values.lon.toFixed(4)}° ${values.lon < 0 ? 'W' : 'E'}` : 'N/A'}</p>
                    <p><strong>Phase:</strong> {isFiniteNumber(values.phase) ? `${values.phase.toFixed(2)}°` : 'N/A'}</p>
                    <p><strong>Incidence:</strong> {isFiniteNumber(values.incidence) ? `${values.incidence.toFixed(2)}°` : 'N/A'}</p>
                    <p><strong>Emis:</strong> {isFiniteNumber(values.emis) ? `${values.emis.toFixed(2)}°` : 'N/A'}</p>
                    {Number.isFinite(values.materialClass) && (
                      <p><strong>Surface material:</strong> {formatSurfaceMaterialWithSpectrumAlbedo(values.materialClass, values.surfaceAlbedo)}</p>
                    )}
                  </div>
                )}
                {index < geoValues.length - 1 && (
                  <div style={{
                    borderTop: '1px solid #3a3a3a',
                    marginTop: '15px',
                    marginBottom: '15px'
                  }}></div>
                )}
              </div>
            );
          })
        ) : (
          // Single position mode
          <>
            {showPointCoordinates && (
              <h4 style={{ marginBottom: '10px', fontSize: '16px', color: '#e0e0e0' }}>
                Point at (<span style={{ color: '#007acc', fontWeight: 'bold' }}>{geoValues.x}, {geoValues.y}</span>)
              </h4>
            )}
            {geoValues.error ? (
              <p style={{ color: '#ff6b6b' }}>Error: {geoValues.error}</p>
            ) : (
              <div style={{ fontSize: '14px', color: '#ccc' }}>
                <p><strong>Latitude:</strong> {isFiniteNumber(geoValues.lat) ? `${geoValues.lat.toFixed(4)}° ${geoValues.lat < 0 ? 'N' : 'S'}` : 'N/A'}</p>
                <p><strong>Longitude:</strong> {isFiniteNumber(geoValues.lon) ? `${geoValues.lon.toFixed(4)}° ${geoValues.lon < 0 ? 'W' : 'E'}` : 'N/A'}</p>
                <p><strong>Phase:</strong> {isFiniteNumber(geoValues.phase) ? `${geoValues.phase.toFixed(2)}°` : 'N/A'}</p>
                <p><strong>Incidence:</strong> {isFiniteNumber(geoValues.incidence) ? `${geoValues.incidence.toFixed(2)}°` : 'N/A'}</p>
                <p><strong>Emis:</strong> {isFiniteNumber(geoValues.emis) ? `${geoValues.emis.toFixed(2)}°` : 'N/A'}</p>
                {Number.isFinite(geoValues.materialClass) && (
                  <p><strong>Surface material:</strong> {formatSurfaceMaterialWithSpectrumAlbedo(geoValues.materialClass, geoValues.surfaceAlbedo)}</p>
                )}
              </div>
            )}
          </>
        )}
        {loadingGeo && <p style={{ color: '#999', fontSize: '12px' }}>Loading...</p>}
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  // Only re-render if geoValues, plotMultiple, or loadingGeo actually changed
  if (prevProps.plotMultiple !== nextProps.plotMultiple) return false;
  if (prevProps.loadingGeo !== nextProps.loadingGeo) return false;
  if (prevProps.showPointCoordinates !== nextProps.showPointCoordinates) return false;

  // Deep comparison for geoValues
  const prev = prevProps.geoValues;
  const next = nextProps.geoValues;

  if (prev === next) return true; // Same reference
  if (!prev || !next) return false; // One is null/undefined

  // If both are arrays, compare length and key properties
  if (Array.isArray(prev) && Array.isArray(next)) {
    if (prev.length !== next.length) return false;
    // Compare each element by key properties
    return prev.every((p, i) => {
      const n = next[i];
      return p.x === n.x && p.y === n.y &&
        p.lat === n.lat && p.lon === n.lon &&
        p.incidence === n.incidence && p.emis === n.emis;
    });
  }

  // For single object, compare key properties
  if (!Array.isArray(prev) && !Array.isArray(next)) {
    return prev.x === next.x && prev.y === next.y &&
      prev.lat === next.lat && prev.lon === next.lon &&
      prev.incidence === next.incidence && prev.emis === next.emis;
  }

  return false; // Different types
});

GeoValuesDisplay.displayName = 'GeoValuesDisplay';

const SPECTRAL_RESOLUTION_LEVELS = ['verylow', 'low', 'medium', 'high'];
const SPECTRAL_RESOLUTION_LABELS = ['Very low', 'Low', 'Medium', 'High'];

function SpherePage() {
  const [viewMode, setViewMode] = useState('default');
  const [coverageReport, setCoverageReport] = useState(null);

  const handleCoverage = useCallback((coverage) => {
    setCoverageReport(coverage);
  }, []);

  return (
    <div className="main-container" style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto', flexDirection: 'column', width: '100%' }}>
      <div style={{ marginBottom: '16px' }}>
        <Link to="/" style={{ color: '#66ccff', textDecoration: 'none', fontSize: '14px' }}>&larr; Back to main</Link>
      </div>
      <h2 style={{ marginBottom: '12px', color: '#e0e0e0' }}>Titan 3D sphere (phase 40&deg;, composite 5, 2, 1.3 µm)</h2>
      <div style={{ marginBottom: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
        <span style={{ color: '#999', fontSize: '14px' }}>View:</span>
        <button
          type="button"
          onClick={() => { setViewMode('default'); setCoverageReport(null); }}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #444',
            background: viewMode === 'default' ? '#2a4a6a' : '#1a1a2e',
            color: '#e0e0e0',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Default (front + back halves)
        </button>
        <button
          type="button"
          onClick={() => setViewMode('weightedPhase')}
          style={{
            padding: '6px 12px',
            borderRadius: '6px',
            border: '1px solid #444',
            background: viewMode === 'weightedPhase' ? '#2a4a6a' : '#1a1a2e',
            color: '#e0e0e0',
            cursor: 'pointer',
            fontSize: '14px',
          }}
        >
          Weighted phase (all phase angles)
        </button>
      </div>
      <div style={{ flex: 1, minHeight: '400px', width: '100%' }}>
        <SphereView
          phaseAngle={40}
          compositeType="5_2_1.3"
          viewMode={viewMode}
          onCoverage={handleCoverage}
        />
      </div>
      {viewMode === 'weightedPhase' && coverageReport && (
        <div style={{ marginTop: '16px', padding: '12px', background: '#1a1a2e', borderRadius: '8px', fontSize: '14px', color: '#ccc' }}>
          <strong style={{ color: '#e0e0e0' }}>Lat/Lon coverage:</strong>
          <p style={{ margin: '8px 0 0 0' }}>{coverageReport.summary}</p>
        </div>
      )}
    </div>
  );
}

function App() {
  const [activeTab, setActiveTab] = useState('tab1');
  const [sliders, setSliders] = useState({
    hazeAbundance: 50,
    methaneAbundance: 50,
    incidenceAngle: 45,
    emissionAngle: 45,
    phaseAngle: 0,
    titanYaw: 0,
    obliquity: 0,
  });


  const [toggles, setToggles] = useState({
    plotMultiple: false,
    spectralUnits: false,
    showAtmosphere: true,
  });

  const [spectralResolutionIndex, setSpectralResolutionIndex] = useState(3);
  const spectralResolution = SPECTRAL_RESOLUTION_LEVELS[spectralResolutionIndex];

  const [materialAlbedoMap, setMaterialAlbedoMap] = useState(null);

  const [transmissionToggles, setTransmissionToggles] = useState({
    ch4: false,
    haze: false,
    co: false,
    c2h6: false,
    c2h2: false,
  });

  const getHazeAbundanceValue = (sliderValue) => {
    // Map slider value to the three options (0, 0.5, 1)
    if (sliderValue <= 33) return 0;
    if (sliderValue <= 67) return 0.5;
    return 1;
  };

  const handleTransmissionToggleChange = (name) => {
    setTransmissionToggles(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Spectral data state
  const [spectralData, setSpectralData] = useState(null);
  const [spectralDataOld, setSpectralDataOld] = useState(null);
  const [spectralDataNew, setSpectralDataNew] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [angleOptions, setAngleOptions] = useState({ inc: [], emi: [], daz: [] });
  const [selectedCases, setSelectedCases] = useState({ standard: true, no_ch4: false, no_haze: false });
  const [selectedCasesByPoint, setSelectedCasesByPoint] = useState({}); // For multiple mode: { pointIndex: { standard: bool, no_ch4: bool, no_haze: bool } }
  const [currentImage, setCurrentImage] = useState(null);
  const [loadingImage, setLoadingImage] = useState(false);
  const [geoValues, setGeoValues] = useState(null);
  const [loadingGeo, setLoadingGeo] = useState(false);
  const [loadingSpectral, setLoadingSpectral] = useState(false); // Loading state for spectral plot updates
  const [hoverGeoValues, setHoverGeoValues] = useState(null); // Geo values for hover position
  const [clickedPosition, setClickedPosition] = useState(null); // Store clicked position persistently
  const [multiplePositions, setMultiplePositions] = useState([]); // Store multiple positions for plot multiple mode
  const geoValuesBoxRef = useRef(null);
  const geoValuesContainerRef = useRef(null);
  const atmosphericComponentsSectionRef = useRef(null);
  const atmosphericComponentsContentRef = useRef(null);
  const togglesBoxRef = useRef(null);
  const irColorImageRef = useRef(null);
  const prevGeoValuesRef = useRef(null);
  const geoValuesRequestIdRef = useRef(0); // Request counter for canceling in-flight geo value fetches
  const [compositeType, setCompositeType] = useState('5_2_1.3'); // '5_2_1.3' or '2_1.6_1.3'
  const [hazePropertiesModel, setHazePropertiesModel] = useState('doose');
  const [imageType, setImageType] = useState('irColor'); // 'irColor', 'incidence', 'emission', 'phase'
  const [irDisplayMode, setIrDisplayMode] = useState('2d'); // '2d' | '3d'
  const [selectionMode, setSelectionMode] = useState('vectorSelection'); // 'vectorSelection' | 'multipleVectorSelection' | 'plotPoint' | 'plotMultiplePoints'
  const [cameraPreset3d, setCameraPreset3d] = useState(''); // '' | 'cassini' | 'sun'
  const [cameraCenter3d, setCameraCenter3d] = useState('titan'); // 'titan' | 'spacecraft' | 'overhead'
  const [geometryInteractionMode3d, setGeometryInteractionMode3d] = useState('camera'); // 'camera' | 'editTitan' | 'editCassini'
  const [irGridEnabled2d, setIrGridEnabled2d] = useState(false);
  const [sphereGridEnabled3d, setSphereGridEnabled3d] = useState(false);
  const [geometryGridEnabled3d, setGeometryGridEnabled3d] = useState(false);
  const [rotationAxisEnabled3d, setRotationAxisEnabled3d] = useState(false);
  const [showAngleArcs3d, setShowAngleArcs3d] = useState(false);
  const [showVectorLabels3d, setShowVectorLabels3d] = useState(true);
  const [showVectorGuideLines3d, setShowVectorGuideLines3d] = useState(false);
  const [allowMultipleVectors3d, setAllowMultipleVectors3d] = useState(false);
  const [tutorialMode, setTutorialMode] = useState(null);
  /** Left-panel vertical profile: gases vs T/P/haze (dropdown next to plot title) */
  const [verticalProfileView, setVerticalProfileView] = useState('gases');

  const handleSliderChange = (name, value) => {
    const numericValue = parseFloat(value);
    setSliders(prev => ({ ...prev, [name]: numericValue }));
  };

  const handleGeometryInteractionModeChange = (mode) => {
    setGeometryInteractionMode3d(mode);
  };

  const handleGeometryChangeFrom3d = useCallback((geometry) => {
    if (!geometry || typeof geometry !== 'object') return;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const normalize360 = (v) => {
      const n = v % 360;
      return n < 0 ? n + 360 : n;
    };

    setSliders(prev => {
      const next = { ...prev };
      let changed = false;

      if (Number.isFinite(geometry.phaseDeg)) {
        const phaseSlider = Math.round(clamp(geometry.phaseDeg, 0, 355) / 5);
        if (next.phaseAngle !== phaseSlider) {
          next.phaseAngle = phaseSlider;
          changed = true;
        }
      }
      if (Number.isFinite(geometry.incidenceDeg)) {
        const incidence = clamp(geometry.incidenceDeg, 0, 180);
        if (next.incidenceAngle !== incidence) {
          next.incidenceAngle = incidence;
          changed = true;
        }
      }
      if (Number.isFinite(geometry.emissionDeg)) {
        const emission = clamp(geometry.emissionDeg, 0, 180);
        if (next.emissionAngle !== emission) {
          next.emissionAngle = emission;
          changed = true;
        }
      }
      if (Number.isFinite(geometry.titanYawDeg)) {
        const titanYaw = normalize360(geometry.titanYawDeg);
        if (next.titanYaw !== titanYaw) {
          next.titanYaw = titanYaw;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, []);

  const handleToggleChange = (name) => {
    if (name === 'plotMultiple') {
      setToggles(prev => {
        const newValue = !prev[name];
        if (newValue) {
          // Switching to multiple mode: clear single position
          setClickedPosition(null);
          setGeoValues(null);
          setSelectedCasesByPoint({});
          // Unselect all transmission gasses
          setTransmissionToggles({
            ch4: false,
            haze: false,
            co: false,
            c2h6: false,
            c2h2: false,
          });
        } else {
          // Switching to single mode: clear multiple positions
          setMultiplePositions([]);
          setGeoValues(null);
          setSelectedCasesByPoint({});
        }
        return { ...prev, [name]: newValue };
      });
    } else {
      setToggles(prev => ({ ...prev, [name]: !prev[name] }));
    }
  };

  const handleSelectionModeChange = (mode) => {
    if (selectionMode === mode) return;

    const isMultipleMode = mode === 'plotMultiplePoints' || mode === 'multipleVectorSelection';
    setSelectionMode(mode);
    setToggles(prev => ({ ...prev, plotMultiple: isMultipleMode }));

    if (isMultipleMode) {
      // Switching to multiple mode: clear single selection and transmission overlays.
      setClickedPosition(null);
      setGeoValues(null);
      setSelectedCasesByPoint({});
      setTransmissionToggles({
        ch4: false,
        haze: false,
        co: false,
        c2h6: false,
        c2h2: false,
      });
      return;
    }

    // Leaving multiple mode: clear multi-point state.
    setMultiplePositions([]);
    setSelectedCasesByPoint({});
    if (mode === 'vectorSelection') {
      setClickedPosition(null);
      setGeoValues(null);
    }
  };

  // Handle case selection change for single mode
  const handleCaseChange = (caseKey) => {
    setSelectedCases(prev => ({ ...prev, [caseKey]: !prev[caseKey] }));
  };

  // Handle case selection change for multiple mode (per point)
  const handleCaseChangeForPoint = (pointIndex, caseKey) => {
    setSelectedCasesByPoint(prev => ({
      ...prev,
      [pointIndex]: {
        ...(prev[pointIndex] || { standard: true, no_ch4: false, no_haze: false }),
        [caseKey]: !(prev[pointIndex]?.[caseKey] ?? false)
      }
    }));
  };

  // Fetch geo values for a given position
  const fetchGeoValues = useCallback(async (x, y, phaseAngleOverride = null) => {
    geoValuesRequestIdRef.current += 1;
    const currentRequestId = geoValuesRequestIdRef.current;

    try {
      setLoadingGeo(true);
      setLoadingSpectral(true);
      const phaseAngle = phaseAngleOverride !== null ? phaseAngleOverride : (sliders.phaseAngle * 5);
      const values = await extractGeoValues(phaseAngle, x, y);

      if (currentRequestId !== geoValuesRequestIdRef.current) {
        return;
      }

      const hasValidSurfaceData =
        Number.isFinite(values?.lat) &&
        Number.isFinite(values?.lon) &&
        Number.isFinite(values?.incidence) &&
        Number.isFinite(values?.emis);
      const materialClass = hasValidSurfaceData ? getMaterialClassAtPixel(materialAlbedoMap, x, y) : null;
      const surfaceAlbedo = Number.isFinite(materialClass)
        ? mapMaterialClassToSpectralAlbedo(materialClass)
        : null;
      setGeoValues({
        ...values,
        lat: toFiniteOrNull(values?.lat),
        lon: toFiniteOrNull(values?.lon),
        phase: toFiniteOrNull(phaseAngle),
        incidence: toFiniteOrNull(values?.incidence),
        emis: toFiniteOrNull(values?.emis),
        azimuth: toFiniteOrNull(values?.azimuth),
        materialClass,
        surfaceAlbedo,
      });
      console.log('Extracted geo values:', values);
    } catch (error) {
      if (currentRequestId !== geoValuesRequestIdRef.current) {
        return;
      }
      console.error('Error extracting geo values:', error);
      setGeoValues({
        error: error.message,
        x,
        y
      });
    } finally {
      if (currentRequestId === geoValuesRequestIdRef.current) {
        setLoadingGeo(false);
        setTimeout(() => setLoadingSpectral(false), 100);
      }
    }
  }, [sliders.phaseAngle, materialAlbedoMap]);

  // Fetch geo values for multiple positions
  const fetchMultipleGeoValues = useCallback(async (positions, phaseAngleOverride = null) => {
    geoValuesRequestIdRef.current += 1;
    const currentRequestId = geoValuesRequestIdRef.current;

    try {
      setLoadingGeo(true);
      setLoadingSpectral(true);
      const phaseAngle = phaseAngleOverride !== null ? phaseAngleOverride : (sliders.phaseAngle * 5);
      const colorNames = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
      const geoValuesPromises = positions.map(async (pos, index) => {
        try {
          const values = await extractGeoValues(phaseAngle, pos.x, pos.y);

          if (currentRequestId !== geoValuesRequestIdRef.current) {
            return null;
          }

          const colorIndex = pos.colorIndex !== undefined ? pos.colorIndex : index;

          const hasValidSurfaceData =
            Number.isFinite(values?.lat) &&
            Number.isFinite(values?.lon) &&
            Number.isFinite(values?.incidence) &&
            Number.isFinite(values?.emis);
          const materialClass = hasValidSurfaceData
            ? getMaterialClassAtPixel(materialAlbedoMap, pos.x, pos.y)
            : null;
          const surfaceAlbedo = Number.isFinite(materialClass)
            ? mapMaterialClassToSpectralAlbedo(materialClass)
            : null;
          return {
            ...values,
            lat: toFiniteOrNull(values?.lat),
            lon: toFiniteOrNull(values?.lon),
            phase: toFiniteOrNull(phaseAngle),
            incidence: toFiniteOrNull(values?.incidence),
            emis: toFiniteOrNull(values?.emis),
            azimuth: toFiniteOrNull(values?.azimuth),
            x: pos.x,
            y: pos.y,
            materialClass,
            surfaceAlbedo,
            index,
            colorIndex,
            color: colorNames[colorIndex] || 'red'
          };
        } catch (error) {
          if (currentRequestId !== geoValuesRequestIdRef.current) {
            return null;
          }
          const colorIndex = pos.colorIndex !== undefined ? pos.colorIndex : index;
          return {
            error: error.message,
            x: pos.x,
            y: pos.y,
            index,
            colorIndex,
            color: colorNames[colorIndex] || 'red'
          };
        }
      });
      const allGeoValues = await Promise.all(geoValuesPromises);

      if (currentRequestId !== geoValuesRequestIdRef.current) {
        return;
      }

      const validGeoValues = allGeoValues.filter(v => v !== null);
      setGeoValues(validGeoValues.length > 0 ? validGeoValues : null);
    } catch (error) {
      if (currentRequestId !== geoValuesRequestIdRef.current) {
        return;
      }
      console.error('Error extracting geo values:', error);
      setGeoValues(null);
    } finally {
      if (currentRequestId === geoValuesRequestIdRef.current) {
        setLoadingGeo(false);
        setTimeout(() => setLoadingSpectral(false), 100);
      }
    }
  }, [sliders.phaseAngle, materialAlbedoMap]);

  const findNearestGeoPixelByLatLon = useCallback(async (targetLat, targetLon, phaseAngleDeg) => {
    const geoData = await getGeoCubeData(phaseAngleDeg);
    const numSamples = 681;
    const numLines = 681;
    const bandSize = numSamples * numLines;
    const latOffset = 0;
    const lonOffset = bandSize;
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let idx = 0; idx < bandSize; idx += 1) {
      const lat = geoData[latOffset + idx];
      const lon = geoData[lonOffset + idx];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 360) continue;
      const dLat = lat - targetLat;
      const dLonRaw = Math.abs(lon - targetLon);
      const dLon = Math.min(dLonRaw, 360 - dLonRaw);
      const score = (dLat * dLat) + (dLon * dLon);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = idx;
      }
    }

    if (bestIndex < 0) return null;
    return {
      x: bestIndex % numSamples,
      y: Math.floor(bestIndex / numSamples),
    };
  }, []);

  // Cache for geo cube data (by phase angle)
  const geoCubeDataRef = useRef(null);
  const currentPhaseAngleRef = useRef(null);
  // Debounce timer ref for hover handler
  const hoverDebounceTimerRef = useRef(null);
  const lastHoverPixelRef = useRef({ x: null, y: null });
  // Debounce timer ref for image loading
  const imageLoadTimerRef = useRef(null);

  // Preload geo cube data when phase angle changes
  useEffect(() => {
    const loadGeoCube = async () => {
      const phaseAngle = sliders.phaseAngle * 5;
      if (currentPhaseAngleRef.current !== phaseAngle) {
        try {
          const geoData = await getGeoCubeData(phaseAngle);
          geoCubeDataRef.current = geoData;
          currentPhaseAngleRef.current = phaseAngle;
        } catch (error) {
          console.error('Error loading geo cube data:', error);
          geoCubeDataRef.current = null;
        }
      }
    };
    loadGeoCube();
  }, [sliders.phaseAngle]);

  // Handle image hover to extract geo values (throttled + cached lookups)
  const handleImageHover = useCallback((x, y, position) => {
    // Clear any existing timer
    if (hoverDebounceTimerRef.current) {
      clearTimeout(hoverDebounceTimerRef.current);
    }

    if (x === null || y === null) {
      lastHoverPixelRef.current = { x: null, y: null };
      setHoverGeoValues(null);
      return;
    }

    // Skip no-op updates for the same hovered pixel.
    if (lastHoverPixelRef.current.x === x && lastHoverPixelRef.current.y === y) {
      return;
    }
    lastHoverPixelRef.current = { x, y };

    // Use cached data for instant lookups (no async needed)
    hoverDebounceTimerRef.current = setTimeout(() => {
      const geoData = geoCubeDataRef.current;
      if (!geoData) {
        // If data not loaded yet, fall back to async call
        const phaseAngle = sliders.phaseAngle * 5;
        extractGeoValues(phaseAngle, x, y).then(values => {
          setHoverGeoValues(prev => {
            if (
              prev &&
              prev.x === values.x &&
              prev.y === values.y &&
              prev.incidence === values.incidence &&
              prev.emis === values.emis &&
              prev.phase === values.phase
            ) {
              return prev;
            }
            return values;
          });
        }).catch(error => {
          console.error('Error extracting hover geo values:', error);
          setHoverGeoValues(null);
        });
        return;
      }

      // Fast synchronous lookup from cached data
      try {
        const lat = getGeoValue(geoData, x, y, 0);
        const lon = getGeoValue(geoData, x, y, 1);
        const phase = getGeoValue(geoData, x, y, 4);
        const incidence = getGeoValue(geoData, x, y, 5);
        const emis = getGeoValue(geoData, x, y, 6);

        const nextHover = {
          lat: toFiniteOrNull(lat),
          lon: toFiniteOrNull(lon),
          phase: toFiniteOrNull(phase),
          incidence: toFiniteOrNull(incidence),
          emis: toFiniteOrNull(emis),
          x,
          y
        };
        setHoverGeoValues(prev => {
          if (
            prev &&
            prev.x === nextHover.x &&
            prev.y === nextHover.y &&
            prev.incidence === nextHover.incidence &&
            prev.emis === nextHover.emis &&
            prev.phase === nextHover.phase
          ) {
            return prev;
          }
          return nextHover;
        });
      } catch (error) {
        console.error('Error extracting hover geo values:', error);
        setHoverGeoValues(null);
      }
    }, 60);
  }, [sliders.phaseAngle]);

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      if (hoverDebounceTimerRef.current) {
        clearTimeout(hoverDebounceTimerRef.current);
      }
      if (imageLoadTimerRef.current) {
        clearTimeout(imageLoadTimerRef.current);
      }
    };
  }, []);

  // Handle image click to extract geo values
  const handleImageClick = async (x, y, position) => {
    if (x === null || y === null) {
      if (toggles.plotMultiple) {
        // Clear all positions in multiple mode
        setMultiplePositions([]);
        setGeoValues(null);
      } else {
        setGeoValues(null);
        setClickedPosition(null);
      }
      return;
    }

    if (toggles.plotMultiple) {
      // Multiple mode: add or remove position
      setMultiplePositions(prev => {
        // Check if clicking on an existing position (within 10 pixels)
        const existingIndex = prev.findIndex(pos =>
          position && pos.position &&
          Math.abs(pos.position.displayX - position.displayX) < 10 &&
          Math.abs(pos.position.displayY - position.displayY) < 10
        );

        if (existingIndex >= 0) {
          // Remove existing position - keep color indices of remaining positions unchanged
          const removedPosition = prev[existingIndex];
          const newPositions = prev.filter((_, idx) => idx !== existingIndex);
          // Reindex case selections: map old array indices to new array indices
          setSelectedCasesByPoint(prevCases => {
            const newCases = {};
            // For each position in the new array, find its corresponding old array index
            newPositions.forEach((newPos, newArrayIndex) => {
              // Find the old array index by matching position coordinates
              const oldArrayIndex = prev.findIndex(oldPos =>
                oldPos.x === newPos.x && oldPos.y === newPos.y &&
                oldPos.position && newPos.position &&
                Math.abs(oldPos.position.displayX - newPos.position.displayX) < 1 &&
                Math.abs(oldPos.position.displayY - newPos.position.displayY) < 1
              );
              if (oldArrayIndex >= 0 && prevCases[oldArrayIndex]) {
                newCases[newArrayIndex] = { ...prevCases[oldArrayIndex] };
              }
            });
            return newCases;
          });
          if (newPositions.length === 0) {
            setGeoValues(null);
            setSelectedCasesByPoint({});
          } else {
            fetchMultipleGeoValues(newPositions);
          }
          return newPositions;
        } else if (prev.length < MAX_SELECTED_POINTS) {
          // Add new position - assign next available color index
          const usedColorIndices = prev.map(pos => pos.colorIndex !== undefined ? pos.colorIndex : prev.indexOf(pos));
          let nextColorIndex = 0;
          while (usedColorIndices.includes(nextColorIndex) && nextColorIndex < MAX_SELECTED_POINTS) {
            nextColorIndex++;
          }
          const newPositions = [...prev, { x, y, position, colorIndex: nextColorIndex }];
          const newArrayIndex = newPositions.length - 1;
          // Initialize case selections for new point (default: methane + haze)
          setSelectedCasesByPoint(prevCases => ({
            ...prevCases,
            [newArrayIndex]: { standard: true, no_ch4: false, no_haze: false }
          }));
          fetchMultipleGeoValues(newPositions);
          return newPositions;
        }
        // Max 6 positions reached
        return prev;
      });
    } else {
      // Single mode: store the clicked position
      setClickedPosition({ x, y, position });
      setMultiplePositions([]);

      // Extract values immediately
      await fetchGeoValues(x, y);
    }
  };

  const handleSpherePlotPoint = useCallback(async (point) => {
    if (!point) return;
    const phaseAngle = sliders.phaseAngle * 5;
    let targetX = point.x;
    let targetY = point.y;

    if (targetX == null || targetY == null) return;

    if (selectionMode === 'plotMultiplePoints' || selectionMode === 'multipleVectorSelection') {
      setMultiplePositions(prev => {
        const existingIndex = prev.findIndex(pos =>
          Math.abs((pos.x ?? -9999) - targetX) <= 3 &&
          Math.abs((pos.y ?? -9999) - targetY) <= 3
        );

        if (existingIndex >= 0) {
          const newPositions = prev.filter((_, idx) => idx !== existingIndex);
          setSelectedCasesByPoint(prevCases => {
            const newCases = {};
            newPositions.forEach((newPos, newArrayIndex) => {
              const oldArrayIndex = prev.findIndex(oldPos =>
                Math.abs((oldPos.x ?? -9999) - (newPos.x ?? -9999)) <= 1 &&
                Math.abs((oldPos.y ?? -9999) - (newPos.y ?? -9999)) <= 1
              );
              if (oldArrayIndex >= 0 && prevCases[oldArrayIndex]) {
                newCases[newArrayIndex] = { ...prevCases[oldArrayIndex] };
              }
            });
            return newCases;
          });
          if (newPositions.length === 0) {
            setGeoValues(null);
            setSelectedCasesByPoint({});
          } else {
            fetchMultipleGeoValues(newPositions, phaseAngle);
          }
          return newPositions;
        }

        if (prev.length >= MAX_SELECTED_POINTS) return prev;

        const usedColorIndices = prev.map(pos => pos.colorIndex !== undefined ? pos.colorIndex : prev.indexOf(pos));
        let nextColorIndex = 0;
        while (usedColorIndices.includes(nextColorIndex) && nextColorIndex < MAX_SELECTED_POINTS) {
          nextColorIndex++;
        }

        const newPositions = [...prev, {
          x: targetX,
          y: targetY,
          lat: toFiniteOrNull(point.lat),
          lon: toFiniteOrNull(point.lon),
          position: {
            naturalX: targetX,
            naturalY: targetY,
            displayX: targetX,
            displayY: targetY,
            is3d: true,
          },
          colorIndex: nextColorIndex,
        }];
        const newArrayIndex = newPositions.length - 1;
        setSelectedCasesByPoint(prevCases => ({
          ...prevCases,
          [newArrayIndex]: { standard: true, no_ch4: false, no_haze: false }
        }));
        fetchMultipleGeoValues(newPositions, phaseAngle);
        return newPositions;
      });
      setClickedPosition(null);
      setToggles(prev => ({ ...prev, plotMultiple: true }));
      return;
    }

    setToggles(prev => ({ ...prev, plotMultiple: false }));
    setMultiplePositions([]);
    setClickedPosition({
      x: targetX,
      y: targetY,
      position: {
        naturalX: targetX,
        naturalY: targetY,
        displayX: targetX,
        displayY: targetY,
        is3d: true,
      }
    });
    await fetchGeoValues(targetX, targetY, phaseAngle);
  }, [fetchGeoValues, fetchMultipleGeoValues, selectionMode, sliders.phaseAngle]);

  const syncedSelectionPointsFor3d = useMemo(() => {
    if (toggles.plotMultiple) return Array.isArray(multiplePositions) ? multiplePositions : [];
    return clickedPosition ? [clickedPosition] : [];
  }, [toggles.plotMultiple, multiplePositions, clickedPosition]);

  // Tutorial mode presets
  const tutorialPresets = {
    1: {
      name: "Methane Explorer",
      description: "See how methane affects Titan's spectrum",
      sliders: {
        hazeAbundance: 50,
        methaneAbundance: 75,
        phaseAngle: 20
      },
      hazePropertiesModel: 'tomasko',
      selectedCases: { standard: true, no_ch4: true, no_haze: false },
      transmissionToggles: { ch4: true, haze: false, co: false, c2h6: false, c2h2: false },
      clickPosition: { x: 32, y: 32 },
      plotMultiple: false
    },
    2: {
      name: "Haze Comparison",
      description: "Compare spectra with and without haze",
      sliders: {
        hazeAbundance: 100,
        methaneAbundance: 50,
        phaseAngle: 40
      },
      hazePropertiesModel: 'doose',
      selectedCases: { standard: true, no_ch4: false, no_haze: true },
      transmissionToggles: { ch4: false, haze: true, co: false, c2h6: false, c2h2: false },
      clickPosition: { x: 40, y: 25 },
      plotMultiple: false
    },
    3: {
      name: "Multi-Point Analysis",
      description: "Compare multiple locations on Titan",
      sliders: {
        hazeAbundance: 50,
        methaneAbundance: 50,
        phaseAngle: 10
      },
      hazePropertiesModel: 'tomasko',
      selectedCasesByPoint: {
        0: { standard: true, no_ch4: false, no_haze: false },
        1: { standard: true, no_ch4: false, no_haze: false },
        2: { standard: true, no_ch4: false, no_haze: false }
      },
      multipleClickPositions: [
        { x: 25, y: 30 },
        { x: 35, y: 35 },
        { x: 45, y: 25 }
      ],
      plotMultiple: true
    }
  };

  const applyTutorialMode = async (modeNumber) => {
    if (!modeNumber) {
      // Reset to defaults
      setTutorialMode(null);
      setSliders({
        hazeAbundance: 50,
        methaneAbundance: 50,
        incidenceAngle: 45,
        emissionAngle: 45,
        phaseAngle: 0,
        titanYaw: 0,
        obliquity: 0,
      });
      setHazePropertiesModel('doose');
      handleSelectionModeChange('plotPoint');
      setTransmissionToggles({
        ch4: false,
        haze: false,
        co: false,
        c2h6: false,
        c2h2: false,
      });
      setSelectedCases({ standard: true, no_ch4: false, no_haze: false });
      setClickedPosition(null);
      setMultiplePositions([]);
      setGeoValues(null);
      setSelectedCasesByPoint({});
      return;
    }
    const preset = tutorialPresets[modeNumber];
    if (!preset) return;

    setTutorialMode(modeNumber);

    // Apply sliders
    setSliders(prev => ({ ...prev, ...preset.sliders }));

    // Apply haze model
    if (preset.hazePropertiesModel) {
      setHazePropertiesModel(preset.hazePropertiesModel);
    }

    // Apply selection mode
    handleSelectionModeChange(preset.plotMultiple ? 'plotMultiplePoints' : 'plotPoint');

    // Clear existing selections
    setClickedPosition(null);
    setMultiplePositions([]);
    setGeoValues(null);

    // Small delay to let state settle
    await new Promise(resolve => setTimeout(resolve, 100));

    if (preset.plotMultiple && preset.multipleClickPositions) {
      // Multiple mode
      setTransmissionToggles({ ch4: false, haze: false, co: false, c2h6: false, c2h2: false });

      const positions = preset.multipleClickPositions.map((pos, index) => ({
        x: pos.x,
        y: pos.y,
        position: { displayX: pos.x * 5, displayY: pos.y * 5 }
      }));
      setMultiplePositions(positions);

      if (preset.selectedCasesByPoint) {
        setSelectedCasesByPoint(preset.selectedCasesByPoint);
      }

      // Fetch geo values for all positions
      fetchMultipleGeoValues(positions);
    } else if (preset.clickPosition) {
      // Single mode
      if (preset.transmissionToggles) {
        setTransmissionToggles(preset.transmissionToggles);
      }
      if (preset.selectedCases) {
        setSelectedCases(preset.selectedCases);
      }

      const pos = preset.clickPosition;
      setClickedPosition({
        x: pos.x,
        y: pos.y,
        position: { displayX: pos.x * 5, displayY: pos.y * 5 }
      });

      // Fetch geo values
      fetchGeoValues(pos.x, pos.y);
    }
  };

  const hazeAbundanceSetting = getHazeAbundanceValue(sliders.hazeAbundance);
  const activeAlbedoValue = FIXED_ALBEDO;
  const activeGridEnabled = irDisplayMode === '3d' ? sphereGridEnabled3d : irGridEnabled2d;
  const optionsPanelTitle = irDisplayMode === '3d' ? 'Observing Geometry Options' : 'IR Image Options';
  const panelMatchHeightPx = 760;
  const handleActiveGridToggle = (enabled) => {
    if (irDisplayMode === '3d') setSphereGridEnabled3d(enabled);
    else setIrGridEnabled2d(enabled);
  };
  const hazeFolderName = `${hazePropertiesModel}_${hazeAbundanceSetting.toFixed(1)}`;
  const methaneImageSetting = Number(sliders.methaneAbundance) < 50 ? 0.25 : 1;
  const imageFolderName = hazePropertiesModel === 'doose'
    ? `${hazeFolderName}_meth${methaneImageSetting}`
    : hazeFolderName;

  // Processed spectral data for checking if a point has spectral plot data
  const processedSpectralData = useMemo(() => {
    return spectralData ? processSpectralData(spectralData) : null;
  }, [spectralData]);

  // For each selected point, whether it has associated spectral plot data (so we show/hide atmospheric components per point)
  const hasSpectralDataForSelection = useMemo(() => {
    const albedo = FIXED_ALBEDO;
    if (!processedSpectralData) {
      return toggles.plotMultiple ? [] : false;
    }
    if (toggles.plotMultiple && Array.isArray(geoValues) && geoValues.length > 0) {
      return geoValues.map((gv) => {
        if (gv && gv.error) return false;
        const inc = gv?.incidence ?? 0;
        const emi = gv?.emis ?? 0;
        const result = createSpectralPlotData(processedSpectralData, inc, emi, 0, 'standard', albedo);
        return result && result.wavelengths && result.wavelengths.length > 0;
      });
    }
    if (!toggles.plotMultiple && geoValues) {
      if (geoValues.error) return false;
      const inc = Number.isFinite(geoValues.incidence) ? geoValues.incidence : NaN;
      const emi = Number.isFinite(geoValues.emis) ? geoValues.emis : NaN;
      const result = createSpectralPlotData(processedSpectralData, inc, emi, 0, 'standard', albedo);
      return result && result.wavelengths && result.wavelengths.length > 0;
    }
    return toggles.plotMultiple ? [] : false;
  }, [processedSpectralData, geoValues, toggles.plotMultiple]);
  // Load image when relevant parameters change (with debouncing for smoother slider interaction)
  useEffect(() => {
    // Clear any existing timer
    if (imageLoadTimerRef.current) {
      clearTimeout(imageLoadTimerRef.current);
    }

    // Set loading state immediately when phase angle changes
    setLoadingImage(true);

    // Debounce image loading to avoid excessive requests during slider dragging
    imageLoadTimerRef.current = setTimeout(async () => {
      try {
        const phaseAngle = sliders.phaseAngle * 5; // Convert slider value to degrees
        // Determine which image type to load
        let imageTypeToLoad;
        if (imageType === 'irColor') {
          imageTypeToLoad = compositeType;
        } else {
          // For incidence, emission, or phase, use the imageType directly
          imageTypeToLoad = imageType;
        }

        const requestedAlbedo = FIXED_ALBEDO;
        const result = await loadPds4Image(phaseAngle, imageTypeToLoad, imageFolderName, requestedAlbedo);
        setCurrentImage(result.url);

        preloadAdjacentImages(
          phaseAngle,
          imageTypeToLoad,
          result?.actualFolder || imageFolderName,
          2,
          result?.actualAlbedo ?? requestedAlbedo
        );
      } catch (error) {
        console.error('Error loading image:', error);
        setCurrentImage(null);
      } finally {
        setLoadingImage(false);
      }
    }, 50); // 50ms debounce - fast enough for responsive feel, slow enough to reduce requests

    // Cleanup function
    return () => {
      if (imageLoadTimerRef.current) {
        clearTimeout(imageLoadTimerRef.current);
      }
    };
  }, [sliders.phaseAngle, compositeType, imageFolderName, imageType]);

  // Update geo values live when phase angle changes and there is an active selection.
  useEffect(() => {
    if (toggles.plotMultiple && multiplePositions.length > 0) {
      fetchMultipleGeoValues(multiplePositions);
    } else if (!toggles.plotMultiple && clickedPosition) {
      fetchGeoValues(clickedPosition.x, clickedPosition.y);
    }
  }, [sliders.phaseAngle, clickedPosition, multiplePositions, toggles.plotMultiple, fetchGeoValues, fetchMultipleGeoValues]);

  // Set fixed height on geo-values-box to prevent it from changing
  useEffect(() => {
    const setFixedHeight = () => {
      if (geoValuesContainerRef.current && geoValuesBoxRef.current) {
        const container = geoValuesContainerRef.current;
        const compositeSelector = container.querySelector('.composite-selector');
        const geoBox = geoValuesBoxRef.current;

        if (compositeSelector) {
          const containerHeight = container.offsetHeight;
          const compositeHeight = compositeSelector.offsetHeight;
          const gap = 20; // gap between elements
          const calculatedHeight = containerHeight - compositeHeight - gap;

          // Set fixed height (only if it's positive)
          if (calculatedHeight > 0) {
            geoBox.style.height = `${calculatedHeight}px`;
            geoBox.style.maxHeight = `${calculatedHeight}px`;
            geoBox.style.minHeight = `${calculatedHeight}px`;
            geoBox.style.flex = '0 0 auto';
            geoBox.style.overflow = 'hidden';
          }
        } else {
          // When composite-selector doesn't exist, let geo-values-box take full height
          geoBox.style.height = '100%';
          geoBox.style.maxHeight = '100%';
          geoBox.style.minHeight = '0';
          geoBox.style.flex = '1 1 auto';
          geoBox.style.overflow = 'hidden';
        }
      }
    };

    // Set height initially and on resize
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(setFixedHeight);
    }, 0);

    window.addEventListener('resize', setFixedHeight);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', setFixedHeight);
    };
  }, [geoValues, imageType]); // Re-run when geoValues appears/disappears or imageType changes

  // Auto-scroll geo values box to bottom when new points are added
  useEffect(() => {
    if (geoValuesBoxRef.current && Array.isArray(geoValues) && geoValues.length > 0) {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        const scrollContainer = geoValuesBoxRef.current?.querySelector('.geo-values-scroll');
        if (scrollContainer) {
          scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
      });
    }
  }, [geoValues]);

  // Auto-scroll atmospheric components content to bottom when new points are added
  useEffect(() => {
    if (atmosphericComponentsContentRef.current && toggles.plotMultiple && Array.isArray(multiplePositions) && multiplePositions.length > 0) {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      requestAnimationFrame(() => {
        if (atmosphericComponentsContentRef.current) {
          atmosphericComponentsContentRef.current.scrollTop = atmosphericComponentsContentRef.current.scrollHeight;
        }
      });
    }
  }, [multiplePositions, toggles.plotMultiple]);

  // Set fixed height on atmospheric-components-section to prevent it from changing
  useEffect(() => {
    const setFixedHeight = () => {
      if (togglesBoxRef.current && atmosphericComponentsSectionRef.current && atmosphericComponentsContentRef.current) {
        const togglesBox = togglesBoxRef.current;
        const section = atmosphericComponentsSectionRef.current;
        const content = atmosphericComponentsContentRef.current;

        const togglesBoxHeight = togglesBox.offsetHeight;
        const header = section.querySelector('.atmospheric-components-header');
        const sliderGroup = togglesBox.querySelector('.slider-group');
        const toggleGroup = togglesBox.querySelector('.toggle-group');
        const h2 = togglesBox.querySelector('h2');
        const transmissionBox = togglesBox.querySelector('.transmission-box');

        if (header && sliderGroup && toggleGroup && h2) {
          const headerHeight = h2.offsetHeight;
          const sliderGroupHeight = sliderGroup.offsetHeight;
          const toggleGroupHeight = toggleGroup.offsetHeight;
          const sectionHeaderHeight = header.offsetHeight;
          const transmissionHeight = transmissionBox ? transmissionBox.offsetHeight : 0;
          const padding = 20 * 2; // top and bottom padding of control-box
          const gaps = 15 + 12 + 20 + 20; // gaps between elements (including margin-top of atmospheric section)

          const calculatedHeight = togglesBoxHeight - headerHeight - sliderGroupHeight - toggleGroupHeight - sectionHeaderHeight - transmissionHeight - padding - gaps;

          // Reduce height by 30% to make it smaller
          const reducedHeight = calculatedHeight * 0.7;

          // Set minimum height to ensure content is visible (at least enough for 3 checkboxes)
          const minHeight = 120; // Minimum height to show 3 checkboxes comfortably

          // Always set a height (use minimum if calculation fails)
          const finalHeight = Math.max(reducedHeight, minHeight);
          content.style.height = `${finalHeight}px`;
          content.style.maxHeight = `${finalHeight}px`;
          content.style.minHeight = `${finalHeight}px`;
          content.style.flex = '0 0 auto';
          content.style.visibility = 'visible';
          content.style.display = 'block';
        }
      }
    };

    // Set height initially and on resize
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(setFixedHeight);
    }, 0);

    window.addEventListener('resize', setFixedHeight);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', setFixedHeight);
    };
  }, [toggles, selectedCasesByPoint, geoValues, multiplePositions, transmissionToggles]); // Re-run when content changes

  // Reset selectedCases when no points are selected in single mode
  // But preserve the state when a point is selected (don't reset to all false)
  useEffect(() => {
    if (!toggles.plotMultiple && !geoValues) {
      // Only reset if we're going from having a point to not having one
      // Don't reset if we never had a point
      setSelectedCases(prev => {
        // If we had selections before, keep them but they won't show until a point is selected
        // Actually, let's reset to default state when no point is selected
        return { standard: true, no_ch4: false, no_haze: false };
      });
    }
  }, [toggles.plotMultiple, geoValues]);

  // Auto-select "Methane + Haze" when a point is selected in single mode
  useEffect(() => {
    if (!toggles.plotMultiple && geoValues && !Array.isArray(geoValues)) {
      // Check if geoValues just changed from null to a value (new point selected)
      const wasNull = prevGeoValuesRef.current === null;
      const isNowSet = geoValues !== null;

      if (wasNull && isNowSet) {
        // Point just selected - auto-select "Methane + Haze"
        setSelectedCases({ standard: true, no_ch4: false, no_haze: false });
      }

      // Update ref for next comparison
      prevGeoValuesRef.current = geoValues;
    } else {
      // Update ref even when conditions aren't met
      prevGeoValuesRef.current = geoValues;
    }
  }, [toggles.plotMultiple, geoValues]);

  // Responsive sizing for IR color image and markers div
  useEffect(() => {
    const calculateAndApplyWidth = () => {
      const MIN_WIDTH = 200; // Hardcoded minimum limit
      const screenWidth = window.innerWidth;

      // Calculate available width for the display row
      // Account for padding, gaps, and other elements
      const mainContainerPadding = 40; // 20px on each side
      const displayRowGap = 40; // gap between elements (20px between image and markers, 20px between markers and sliders)
      const slidersBoxMinWidth = 250; // min-width of sliders-box
      const availableWidth = screenWidth - mainContainerPadding - displayRowGap - slidersBoxMinWidth;

      // Calculate target width - make it as small as reasonably possible
      // while respecting the minimum width
      let targetWidth;
      if (screenWidth < 1200) {
        // For smaller screens, calculate the minimum needed width
        // Use the smaller of: available width or a reasonable max
        // But always respect MIN_WIDTH
        const maxReasonableWidth = Math.min(availableWidth * 0.6, 400);
        targetWidth = Math.max(MIN_WIDTH, maxReasonableWidth);
      } else {
        // For large screens, let it grow naturally (don't restrict)
        targetWidth = null; // null means use default flex behavior
      }

      // Apply to IR color image container
      if (irColorImageRef.current) {
        if (targetWidth !== null) {
          irColorImageRef.current.style.width = `${targetWidth}px`;
          irColorImageRef.current.style.minWidth = `${MIN_WIDTH}px`;
          irColorImageRef.current.style.maxWidth = `${targetWidth}px`;
          irColorImageRef.current.style.flexShrink = '1';
        } else {
          // Reset to default for large screens
          irColorImageRef.current.style.width = '';
          irColorImageRef.current.style.minWidth = '';
          irColorImageRef.current.style.maxWidth = '';
          irColorImageRef.current.style.flexShrink = '';
        }
      }

      // Apply to markers div (geoValuesContainerRef)
      if (geoValuesContainerRef.current) {
        if (targetWidth !== null) {
          geoValuesContainerRef.current.style.width = `${targetWidth}px`;
          geoValuesContainerRef.current.style.minWidth = `${MIN_WIDTH}px`;
          geoValuesContainerRef.current.style.maxWidth = `${targetWidth}px`;
        } else {
          // Reset to default for large screens
          geoValuesContainerRef.current.style.width = '';
          geoValuesContainerRef.current.style.minWidth = '';
          geoValuesContainerRef.current.style.maxWidth = '';
        }
      }
    };

    // Calculate and apply initially
    const timeoutId = setTimeout(() => {
      requestAnimationFrame(calculateAndApplyWidth);
    }, 0);

    // Recalculate on resize
    window.addEventListener('resize', calculateAndApplyWidth);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateAndApplyWidth);
    };
  }, []);

  // Load default spectral library on mount.
  useEffect(() => {
    let isCancelled = false;

    const loadSpectralData = async () => {
      try {
        setLoading(true);
        setError(null);

        const oldDataPath = `/assets/dt/tomasko_1.0/init_gui_library.json`;
        try {
          const oldSpectralJson = await loadJsonFile(oldDataPath);
          if (isCancelled) return;
          if (
            oldSpectralJson &&
            oldSpectralJson.wavelength &&
            (oldSpectralJson.standard || oldSpectralJson.data)
          ) {
            setSpectralDataOld(oldSpectralJson);
          }
        } catch (oldErr) {
          /* optional init_gui library missing or invalid */
        }

      } catch (err) {
        if (isCancelled) return;
        console.error('Error loading spectral data:', err);
        const errorMessage = err.message || String(err);
        if (errorMessage.toLowerCase().includes('memory') || errorMessage.toLowerCase().includes('out of')) {
          setError('Out of memory error. The spectral dataset is too large for your browser. Please try refreshing the page or use a more powerful machine.');
        } else {
          setError(`Unable to load spectral data. ${err.message}`);
        }
        setSpectralData(null);
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    };

    loadSpectralData();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const albedo = activeAlbedoValue;

    if (albedo === 0.1 && spectralDataOld) {
      setSpectralData(spectralDataOld);
    } else if (spectralDataNew) {
      setSpectralData(spectralDataNew);
    } else if (spectralDataOld) {
      setSpectralData(spectralDataOld);
    }

    if (spectralDataOld || spectralDataNew) {
      const activeData = (albedo === 0.1 && spectralDataOld) ? spectralDataOld : (spectralDataNew || spectralDataOld);
      if (activeData) {
        const inc = activeData.inc || [];
        const emi = activeData.emi || [];
        const daz = activeData.daz || [];
        setAngleOptions({ inc, emi, daz });
      }
    }
  }, [activeAlbedoValue, spectralDataOld, spectralDataNew]);

  // Lazy-load multi-albedo spectral library only when needed.
  useEffect(() => {
    if (activeAlbedoValue === 0.1 || spectralDataNew) return;

    let isCancelled = false;
    const loadCompLibrary = async () => {
      try {
        const newDataPath = `/assets/dt/tomasko_1.0/init_comp_library.json`;
        const newSpectralJson = await loadJsonFile(newDataPath);
        if (isCancelled) return;
        if (newSpectralJson && newSpectralJson.wavelength && newSpectralJson.data) {
          setSpectralDataNew(newSpectralJson);
        }
      } catch (newErr) {
        if (isCancelled) return;
        console.error('Error loading multi-albedo spectral data:', newErr);
      }
    };

    loadCompLibrary();
    return () => {
      isCancelled = true;
    };
  }, [activeAlbedoValue, spectralDataNew]);

  useEffect(() => {
    loadMaterialAlbedoMap()
      .then(setMaterialAlbedoMap)
      .catch(() => setMaterialAlbedoMap(null));
  }, []);

  // Cleanup effect
  useEffect(() => {
    return () => {
      clearDataCache();
    };
  }, []);

  return (
    <Router>
      <ScrollToTop />
      <div className="App">
        <Header />
        <main className="app-body">
          <Routes>
            <Route path="/user-guide" element={<UserGuide />} />
            <Route path="/" element={
              <div className="main-container">
                {/* Left side - Display panels */}
                <div className="left-panel">
                  <div className="display-row">
                    {irDisplayMode !== '3d' && (
                    <div className="skinny-plot">
                      <div className="skinny-plot-header">
                        <div className="skinny-plot-header-top">
                          <h3>
                            <Tooltip content={
                              verticalProfileView === 'gases' ? (
                                <>
                                  <strong>Gas Abundance</strong>
                                  Shows the vertical distribution of atmospheric gases (CH₄, H₂, CO, C₂H₆, C₂H₂) as a function of altitude.
                                  CH₄ (methane) is displayed on a linear scale to show its variability, while trace gases use a logarithmic scale.
                                  Adjusting the methane abundance slider scales the CH₄ profile, helping you understand how methane concentration
                                  affects Titan&apos;s atmospheric composition and radiative transfer properties.
                                </>
                              ) : verticalProfileView === 'temperature_pressure' ? (
                                <>
                                  <strong>Temperature and pressure</strong>
                                  HASI L4 in situ temperature and pressure vs altitude on dual horizontal axes (linear K
                                  below, log Pa above). Dotted lines mark radiative-transfer model layer interfaces.
                                </>
                              ) : (
                                <>
                                  <strong>Haze profile</strong>
                                  Haze optical depth τ from the radiative-transfer model (<code>layers.tau.haze</code>) at
                                  three wavelength bins (~0.93, ~2.0, ~5.1 µm), for the Doose / Tomasko haze scenario and
                                  haze abundance selected in the main panel — same configuration as the spectra and IR images.
                                </>
                              )
                            }>
                              {verticalProfileView === 'gases' && 'Gas Abundance'}
                              {verticalProfileView === 'temperature_pressure' && 'Temperature & pressure'}
                              {verticalProfileView === 'haze' && 'Haze profile'}
                            </Tooltip>
                          </h3>
                          <select
                            id="vertical-profile-select"
                            className="skinny-plot-select"
                            aria-label="Atmospheric profile type"
                            value={verticalProfileView}
                            onChange={(e) => setVerticalProfileView(e.target.value)}
                          >
                            <option value="gases">Gas abundances</option>
                            <option value="temperature_pressure">Temperature &amp; pressure</option>
                            <option value="haze">Haze profile</option>
                          </select>
                        </div>
                      </div>
                      <div className="skinny-plot-content">
                        <GasAbundancePlot
                          methaneAbundance={sliders.methaneAbundance}
                          profile={verticalProfileView}
                          hazeScenarioKey={hazeFolderName}
                        />
                      </div>
                    </div>
                    )}
                    <div
                      ref={irColorImageRef}
                      className="display-box ir-color"
                      style={{ position: 'relative', alignSelf: 'stretch' }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setIrDisplayMode(prev => {
                            const next = prev === '2d' ? '3d' : '2d';
                            if (next === '3d') {
                              setSelectionMode(toggles.plotMultiple ? 'multipleVectorSelection' : 'vectorSelection');
                            }
                            return next;
                          });
                        }}
                        style={{
                          position: 'absolute',
                          top: '12px',
                          right: '12px',
                          zIndex: 5,
                          padding: '6px 10px',
                          borderRadius: '6px',
                          border: '1px solid #66ccff',
                          backgroundColor: '#1a1a1a',
                          color: '#e0e0e0',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        {irDisplayMode === '2d' ? 'Show 3D' : 'Show 2D'}
                      </button>
                      <h2>
                        <Tooltip content={
                          irDisplayMode === '3d' ? (
                            <>
                              <strong>Observing Geometry</strong>
                              Interactive 3D observing geometry view showing Titan, Cassini, and Sun positions.
                              Click on Titan to visualize vectors from your selected surface location to the Sun and spacecraft,
                              plus the local surface normal vector.
                            </>
                          ) : (
                            <>
                              <strong>IR Color</strong>
                              A false-color composite image of Titan created by combining three infrared wavelengths.
                              This visualization helps identify different surface and atmospheric features based on their spectral signatures.
                              Click on locations in this image to extract geophysical values (latitude, longitude, viewing angles) and
                              generate corresponding spectral plots that show how light interacts with Titan's atmosphere at that location.
                            </>
                          )
                        }>
                          {irDisplayMode === '3d' ? 'Observing Geometry' : 'IR Color'}
                        </Tooltip>
                      </h2>
                      {irDisplayMode === '3d' ? (
                        <>
                          <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <div style={{ width: '100%', height: `${panelMatchHeightPx}px`, borderRadius: '4px', overflow: 'hidden' }}>
                              <SphereView
                                phaseAngle={sliders.phaseAngle * 5}
                                compositeType={compositeType}
                                viewMode="weightedPhase"
                                minHeight={0}
                                incidenceDeg={sliders.incidenceAngle}
                                emissionDeg={sliders.emissionAngle}
                                phaseDeg={sliders.phaseAngle * 5}
                                titanYawDeg={sliders.titanYaw}
                                obliquityDeg={sliders.obliquity}
                                cameraPreset={cameraPreset3d || 'none'}
                                cameraCenter={cameraCenter3d}
                                geometryInteractionMode={geometryInteractionMode3d}
                                onGeometryChange={handleGeometryChangeFrom3d}
                                onCameraPresetRelease={() => setCameraPreset3d('')}
                                onVectorPlaced={() => {
                                  setCameraPreset3d('');
                                }}
                                introAnimation={true}
                                showLatLonGrid={sphereGridEnabled3d}
                                showGeometryGrid={geometryGridEnabled3d}
                                showRotationAxis={rotationAxisEnabled3d}
                                showAngleArcs={showAngleArcs3d}
                                showVectorLabels={showVectorLabels3d}
                                showExtendedVectorLines={showVectorGuideLines3d}
                                allowMultipleVectors={allowMultipleVectors3d || selectionMode === 'multipleVectorSelection'}
                                showAtmosphere={toggles.showAtmosphere}
                                interactionMode={
                                  selectionMode === 'plotPoint'
                                    ? 'plotPoint'
                                    : (selectionMode === 'plotMultiplePoints' ? 'plotMultiple' : 'vector')
                                }
                                onSurfacePointSelect={handleSpherePlotPoint}
                                multiplePoints={syncedSelectionPointsFor3d}
                              />
                            </div>
                          </div>
                        </>
                      ) : currentImage ? (
                        <>
                          <div style={{ position: 'relative', width: '100%', flex: '1', display: 'flex', flexDirection: 'column' }}>
                            <ClickableImage
                              src={currentImage}
                              alt="Titan IR Color Image"
                              onImageClick={handleImageClick}
                              onImageHover={handleImageHover}
                              className="ir-color-image"
                              style={{ width: '100%' }}
                              initialPosition={toggles.plotMultiple ? null : clickedPosition}
                              multiplePositions={toggles.plotMultiple ? multiplePositions : []}
                              plotMultiple={toggles.plotMultiple}
                              showLatLonGrid={irGridEnabled2d}
                              phaseAngleDeg={sliders.phaseAngle * 5}
                            />
                            {loadingImage && (
                              <div className="loading-indicator">
                                <div className="loading-spinner"></div>
                                <p>Loading image...</p>
                              </div>
                            )}
                          </div>
                          <div style={{
                            marginTop: '15px',
                            padding: '10px',
                            backgroundColor: '#2a2a2a',
                            borderRadius: '4px',
                            border: '1px solid #66ccff',
                            fontSize: '14px',
                            color: '#e0e0e0',
                            width: '100%',
                            maxWidth: '100%',
                            boxSizing: 'border-box'
                          }}>
                            {hoverGeoValues ? (
                              <>
                                <strong>Hover Position:</strong> Coordinates: (<span style={{ color: '#007acc', fontWeight: 'bold' }}>{hoverGeoValues.x}, {hoverGeoValues.y}</span>), Incidence: {isFiniteNumber(hoverGeoValues.incidence) ? `${hoverGeoValues.incidence.toFixed(2)}°` : 'N/A'}, Emission: {isFiniteNumber(hoverGeoValues.emis) ? `${hoverGeoValues.emis.toFixed(2)}°` : 'N/A'}, Phase: {isFiniteNumber(hoverGeoValues.phase) ? `${hoverGeoValues.phase.toFixed(2)}°` : 'N/A'}
                              </>
                            ) : (
                              <span>Hover over the image to see coordinates and angles</span>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="ir-image-placeholder" aria-label="IR image loading placeholder"></div>
                      )}
                    </div>
                    <div ref={geoValuesContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '200px', maxWidth: '250px', alignSelf: 'stretch' }}>
{geoValues && (
                        <div ref={geoValuesBoxRef} style={{ flex: imageType === 'irColor' ? '1 1 auto' : '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                          <GeoValuesDisplay
                            geoValues={geoValues}
                            plotMultiple={toggles.plotMultiple}
                            loadingGeo={loadingGeo}
                            showPointCoordinates={irDisplayMode !== '3d'}
                          />
                        </div>
                      )}
                    </div>
                    {/* Quick Start */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '250px', maxWidth: '300px', alignSelf: 'stretch' }}>
                      {/* Quick Start Presets */}
                      <div className="control-box" style={{ height: 'auto', border: '2px solid #66ccff' }}>
                        <h2>
                          <Tooltip content={
                            <>
                              <strong>Quick Start</strong>
                              Pre-configured presets to help you explore Titan's atmosphere.
                            </>
                          }>
                            Quick Start
                          </Tooltip>
                        </h2>
                        <select
                          value={tutorialMode || ''}
                          onChange={(e) => applyTutorialMode(e.target.value ? parseInt(e.target.value) : null)}
                          style={{
                            width: '100%',
                            padding: '10px',
                            backgroundColor: '#1a1a1a',
                            color: '#e0e0e0',
                            border: '1px solid #66ccff',
                            borderRadius: '4px',
                            fontSize: '14px',
                            cursor: 'pointer'
                          }}
                        >
                          <option value="">Select a preset...</option>
                          <option value="1">Methane Explorer</option>
                          <option value="2">Haze Comparison</option>
                        </select>
                      </div>
                      {/* IR/Geometry Options */}
                      <div className="control-box sliders-box" style={{ flex: '1', display: 'flex', flexDirection: 'column', maxHeight: `${panelMatchHeightPx}px` }}>
                        <h2>
                          <Tooltip content={
                            <>
                              <strong>{optionsPanelTitle}</strong>
                              Controls that modify the infrared image display and atmospheric parameters.
                              These settings affect both the visible image and the underlying radiative transfer calculations
                              used to generate spectral plots. Adjusting these parameters helps you explore how different
                              atmospheric conditions and viewing geometries affect what we observe on Titan.
                            </>
                          }>
                            {optionsPanelTitle}
                          </Tooltip>
                        </h2>
                        <div className="sliders-scroll">
                        <div className="slider-group">
                          {irDisplayMode !== '3d' && (
                          <>
                          {/* Haze Model Section */}
                          <div style={{ marginBottom: '0', display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal', textAlign: 'left', color: '#ccc', display: 'block', width: '100%' }}>
                              <Tooltip content={
                                <>
                                  <strong>Haze Model</strong>
                                  Selects the physical model used to describe Titan's atmospheric haze particles.
                                  The Doose and Tomasko models use different assumptions about particle size, shape, and optical properties.
                                  These differences affect how light scatters through Titan's atmosphere, influencing both the appearance
                                  of images and the shape of spectral reflectance curves.
                                </>
                              }>
                                Haze Model
                              </Tooltip>
                            </h3>
                            <div className="radio-group" style={{ flexDirection: 'row', gap: '20px' }}>
                              <label className="radio-label">
                                <input
                                  type="radio"
                                  name="hazePropertiesModel"
                                  value="doose"
                                  checked={hazePropertiesModel === 'doose'}
                                  onChange={(e) => setHazePropertiesModel(e.target.value)}
                                />
                                <span style={{ float: 'none', color: 'inherit', fontWeight: 'normal' }}>Doose</span>
                              </label>
                              <label className="radio-label">
                                <input
                                  type="radio"
                                  name="hazePropertiesModel"
                                  value="tomasko"
                                  checked={hazePropertiesModel === 'tomasko'}
                                  onChange={(e) => setHazePropertiesModel(e.target.value)}
                                />
                                <span style={{ float: 'none', color: 'inherit', fontWeight: 'normal' }}>Tomasko</span>
                              </label>
                            </div>
                          </div>
                          <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>

                          <label style={{ color: '#ccc' }}>
                            <Tooltip content={
                              <>
                                <strong>Haze Abundance</strong>
                                Controls the amount of atmospheric haze particles in the radiative transfer model.
                                Values range from 0 (no haze) to 1 (maximum haze). Haze particles scatter and absorb light,
                                affecting both the brightness and color of Titan's surface as seen from space.
                                Higher haze abundance increases atmospheric scattering, making the surface appear brighter
                                and more uniform, while lower values reveal more surface detail.
                              </>
                            }>
                              Haze abundance
                            </Tooltip>
                            <input
                              type="range"
                              min="0"
                              max="2"
                              step="1"
                              value={sliders.hazeAbundance / 50}
                              onChange={(e) => {
                                const stepValue = parseInt(e.target.value);
                                const sliderValue = stepValue * 50;
                                handleSliderChange('hazeAbundance', sliderValue);
                              }}
                            />
                            <span>{hazeAbundanceSetting}</span>
                          </label>

                          <label style={{ color: '#ccc' }}>
                            <Tooltip content={
                              <>
                                <strong>Methane Abundance</strong>
                                Adjusts the methane (CH₄) concentration in Titan's atmosphere, scaling the vertical profile
                                from 50% (slider at 0) to 150% (slider at 100) of the baseline value. Methane is a major
                                atmospheric constituent that affects both radiative transfer and spectral features.
                                Changing methane abundance modifies how light is absorbed at specific wavelengths,
                                particularly in the near-infrared, which directly impacts the spectral reflectance curves
                                shown in the spectral plot.
                              </>
                            }>
                              Methane abundance
                            </Tooltip>
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={sliders.methaneAbundance}
                              onChange={(e) => handleSliderChange('methaneAbundance', e.target.value)}
                            />
                            <span>{sliders.methaneAbundance}</span>
                          </label>

                          </>
                          )}
                          <label style={{ color: '#ccc' }}>
                            <Tooltip content={
                              <>
                                <strong>Phase Angle</strong>
                                The angle between the Sun, Titan's surface, and the observer (0-355° in 5° steps).
                                Phase angle determines the geometry of illumination and viewing, affecting how light
                                scatters through the atmosphere and reflects off the surface. At low phase angles
                                (near 0°), you see Titan in a "full moon" configuration with maximum brightness.
                                Higher phase angles show more atmospheric scattering and surface shadows, revealing
                                different surface and atmospheric properties.
                              </>
                            }>
                              Phase angle
                            </Tooltip>
                            <input
                              type="range"
                              min="0"
                              max="71"
                              step="1"
                              value={sliders.phaseAngle}
                              onChange={(e) => handleSliderChange('phaseAngle', e.target.value)}
                            />
                            <span>{sliders.phaseAngle * 5}°</span>
                          </label>

                          {irDisplayMode === '3d' && (
                            <label style={{ color: '#ccc' }}>
                              <Tooltip content={
                                <>
                                  <strong>Obliquity</strong>
                                  Tilts Titan around the Z-axis in the 3D view.
                                </>
                              }>
                                Obliquity
                              </Tooltip>
                              <input
                                type="range"
                                min="-23"
                                max="23"
                                step="1"
                                value={sliders.obliquity}
                                onChange={(e) => handleSliderChange('obliquity', e.target.value)}
                              />
                              <span>{sliders.obliquity}°</span>
                            </label>
                          )}

                        </div>
                        <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>
                        <div style={{ marginTop: '0' }}>
                          <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>Display Overlays</h3>
                          <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <input
                              type="checkbox"
                              checked={activeGridEnabled}
                              onChange={(e) => handleActiveGridToggle(e.target.checked)}
                            />
                            <span>Lat/Lon Grid + Labels</span>
                          </label>
                          {irDisplayMode === '3d' && (
                            <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                              <input
                                type="checkbox"
                                checked={geometryGridEnabled3d}
                                onChange={(e) => setGeometryGridEnabled3d(e.target.checked)}
                              />
                              <span>Show Geometry Angle Grid</span>
                            </label>
                          )}
                          {irDisplayMode === '3d' && (
                            <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
                              <input
                                type="checkbox"
                                checked={toggles.showAtmosphere}
                                onChange={() => handleToggleChange('showAtmosphere')}
                              />
                              <span>Show Gas Layer</span>
                            </label>
                          )}
                        </div>
                        {irDisplayMode === '3d' && (
                          <>
                            <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>
                            <div style={{ marginTop: '0' }}>
                              <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>
                                <Tooltip content={
                                  <>
                                    <strong>3D Camera Presets</strong>
                                    Switches the camera to perspective views (Cassini or Sun) that stay synced as the slider geometry changes.
                                  </>
                                }>
                                  3D Perspective Presets
                                </Tooltip>
                              </h3>
                              <div className="radio-group">
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="cameraPreset3d"
                                    value="cassini"
                                    checked={cameraPreset3d === 'cassini'}
                                    onChange={(e) => setCameraPreset3d(e.target.value)}
                                  />
                                  <span>Perspective (Cassini)</span>
                                </label>
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="cameraPreset3d"
                                    value="sun"
                                    checked={cameraPreset3d === 'sun'}
                                    onChange={(e) => setCameraPreset3d(e.target.value)}
                                  />
                                  <span>Perspective (Sun)</span>
                                </label>
                              </div>
                            </div>
                            <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>
                            <div style={{ marginTop: '0' }}>
                              <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>
                                <Tooltip content={
                                  <>
                                    <strong>3D Geometry Controls</strong>
                                    Choose whether drag gestures orbit the camera, rotate Titan, or move Cassini to update phase and emission.
                                  </>
                                }>
                                  3D Geometry Controls
                                </Tooltip>
                              </h3>
                              <div className="radio-group">
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="geometryInteractionMode3d"
                                    value="camera"
                                    checked={geometryInteractionMode3d === 'camera'}
                                    onChange={(e) => handleGeometryInteractionModeChange(e.target.value)}
                                  />
                                  <span style={{ float: 'none', color: 'inherit', fontWeight: 'normal' }}>Camera Orbit</span>
                                </label>
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="geometryInteractionMode3d"
                                    value="editTitan"
                                    checked={geometryInteractionMode3d === 'editTitan'}
                                    onChange={(e) => handleGeometryInteractionModeChange(e.target.value)}
                                  />
                                  <span style={{ float: 'none', color: 'inherit', fontWeight: 'normal' }}>Edit Titan</span>
                                </label>
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="geometryInteractionMode3d"
                                    value="editCassini"
                                    checked={geometryInteractionMode3d === 'editCassini'}
                                    onChange={(e) => handleGeometryInteractionModeChange(e.target.value)}
                                  />
                                  <span style={{ float: 'none', color: 'inherit', fontWeight: 'normal' }}>Edit Cassini</span>
                                </label>
                              </div>
                            </div>
                            <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>
                            <div style={{ marginTop: '0' }}>
                              <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>
                                <Tooltip content={
                                  <>
                                    <strong>Camera Center</strong>
                                    Sets the orbit/look target to Titan's center or the spacecraft location.
                                  </>
                                }>
                                  Camera Center
                                </Tooltip>
                              </h3>
                              <div className="radio-group">
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="cameraCenter3d"
                                    value="titan"
                                    checked={cameraCenter3d === 'titan'}
                                    onChange={(e) => setCameraCenter3d(e.target.value)}
                                  />
                                  <span style={{ float: 'none', color: 'inherit', fontWeight: 'normal' }}>Titan Center</span>
                                </label>
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="cameraCenter3d"
                                    value="spacecraft"
                                    checked={cameraCenter3d === 'spacecraft'}
                                    onChange={(e) => setCameraCenter3d(e.target.value)}
                                  />
                                  <span style={{ float: 'none', color: 'inherit', fontWeight: 'normal' }}>Spacecraft</span>
                                </label>
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="cameraCenter3d"
                                    value="overhead"
                                    checked={cameraCenter3d === 'overhead'}
                                    onChange={(e) => setCameraCenter3d(e.target.value)}
                                  />
                                  <span style={{ float: 'none', color: 'inherit', fontWeight: 'normal' }}>Overhead</span>
                                </label>
                              </div>
                              <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '12px', marginBottom: '12px' }}></div>
                              <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>View Aids</h3>
                              <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                  type="checkbox"
                                  checked={rotationAxisEnabled3d}
                                  onChange={(e) => setRotationAxisEnabled3d(e.target.checked)}
                                />
                                <span>Show Axis of Rotation</span>
                              </label>
                              <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                <input
                                  type="checkbox"
                                  checked={showAngleArcs3d}
                                  onChange={(e) => setShowAngleArcs3d(e.target.checked)}
                                />
                                <span>Show Angle Arcs + Labels</span>
                              </label>

                              <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '12px', marginBottom: '12px' }}></div>
                              <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>Vector Display</h3>
                              <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input
                                  type="checkbox"
                                  checked={showVectorLabels3d}
                                  onChange={(e) => setShowVectorLabels3d(e.target.checked)}
                                />
                                <span>Show Vector Labels</span>
                              </label>
                              <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                <input
                                  type="checkbox"
                                  checked={showVectorGuideLines3d}
                                  onChange={(e) => setShowVectorGuideLines3d(e.target.checked)}
                                />
                                <span>Show Full Vector Guide Lines</span>
                              </label>
                              <label className="radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                <input
                                  type="checkbox"
                                  checked={allowMultipleVectors3d}
                                  onChange={(e) => setAllowMultipleVectors3d(e.target.checked)}
                                />
                                <span>Add Multiple Vectors</span>
                              </label>
                            </div>
                          </>
                        )}
                        <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>
                        <div style={{ marginTop: '0' }}>
                          <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>
                            <Tooltip content={
                              <>
                                <strong>Selection Mode</strong>
                                Chooses single or multiple vector interaction in 3D, and single or multiple point selection in 2D.
                              </>
                            }>
                              Selection Mode
                            </Tooltip>
                          </h3>
                          <div className="radio-group">
                            {irDisplayMode === '3d' && (
                              <>
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="selectionMode"
                                    value="vectorSelection"
                                    checked={selectionMode === 'vectorSelection'}
                                    onChange={(e) => handleSelectionModeChange(e.target.value)}
                                  />
                                  <span>Vector Selection</span>
                                </label>
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="selectionMode"
                                    value="multipleVectorSelection"
                                    checked={selectionMode === 'multipleVectorSelection'}
                                    onChange={(e) => handleSelectionModeChange(e.target.value)}
                                  />
                                  <span>Multiple Vector Selection</span>
                                </label>
                              </>
                            )}
                            {irDisplayMode !== '3d' && (
                              <>
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="selectionMode"
                                    value="plotPoint"
                                    checked={selectionMode === 'plotPoint'}
                                    onChange={(e) => handleSelectionModeChange(e.target.value)}
                                  />
                                  <span>Plot Point</span>
                                </label>
                                <label className="radio-label">
                                  <input
                                    type="radio"
                                    name="selectionMode"
                                    value="plotMultiplePoints"
                                    checked={selectionMode === 'plotMultiplePoints'}
                                    onChange={(e) => handleSelectionModeChange(e.target.value)}
                                  />
                                  <span>Plot Multiple Points</span>
                                </label>
                              </>
                            )}
                          </div>
                        </div>
                        <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>
                        {/* Image Type Section */}
                        {irDisplayMode !== '3d' && (
                        <div style={{ marginTop: '0' }}>
                          <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>
                            <Tooltip content={
                              <>
                                <strong>Image Type</strong>
                                Switches between different visualization modes: IR Color (false-color composite),
                                Incidence (angle between surface normal and sunlight), Emission (angle between surface
                                normal and observer), and Phase (phase angle map). These different views reveal
                                different aspects of Titan's surface and atmospheric properties, helping you understand
                                how viewing geometry affects observations.
                              </>
                            }>
                              Image Type
                            </Tooltip>
                          </h3>
                          <div className="radio-group">
                            <label className="radio-label">
                              <input
                                type="radio"
                                name="imageType"
                                value="irColor"
                                checked={imageType === 'irColor'}
                                onChange={(e) => setImageType(e.target.value)}
                              />
                              <span>IR Color</span>
                            </label>
                            <label className="radio-label">
                              <input
                                type="radio"
                                name="imageType"
                                value="incidence"
                                checked={imageType === 'incidence'}
                                onChange={(e) => setImageType(e.target.value)}
                              />
                              <span>Incidence</span>
                            </label>
                            <label className="radio-label">
                              <input
                                type="radio"
                                name="imageType"
                                value="emission"
                                checked={imageType === 'emission'}
                                onChange={(e) => setImageType(e.target.value)}
                              />
                              <span>Emission</span>
                            </label>
                            <label className="radio-label">
                              <input
                                type="radio"
                                name="imageType"
                                value="phase"
                                checked={imageType === 'phase'}
                                onChange={(e) => setImageType(e.target.value)}
                              />
                              <span>Phase</span>
                            </label>
                          </div>
                          {imageType === 'irColor' && (
                            <>
                              <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>
                              <div style={{ marginTop: '0' }}>
                                <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>
                                  <Tooltip content={
                                    <>
                                      <strong>Composite Type</strong>
                                      Selects which three infrared wavelengths are combined for the false-color image.
                                      "5, 2, 1.3 um" emphasizes deeper atmospheric penetration, while "2, 1.6, 1.3 um"
                                      is more surface-sensitive.
                                    </>
                                  }>
                                    Composite Type
                                  </Tooltip>
                                </h3>
                                <div className="radio-group">
                                  <label className="radio-label">
                                    <input
                                      type="radio"
                                      name="compositeType"
                                      value="5_2_1.3"
                                      checked={compositeType === '5_2_1.3'}
                                      onChange={(e) => setCompositeType(e.target.value)}
                                    />
                                    <span>5, 2, 1.3 um</span>
                                  </label>
                                  <label className="radio-label">
                                    <input
                                      type="radio"
                                      name="compositeType"
                                      value="2_1.6_1.3"
                                      checked={compositeType === '2_1.6_1.3'}
                                      onChange={(e) => setCompositeType(e.target.value)}
                                    />
                                    <span>2, 1.6, 1.3 um</span>
                                  </label>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                        )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="spectral-row">
                    <div className="spectral-plot" style={{ position: 'relative' }}>
                      <h2>
                        <Tooltip variant="green" content={
                          <>
                            <strong>Spectral Plot</strong>
                            Displays the spectral reflectance (or radiance) as a function of wavelength for the selected
                            location(s) on Titan. This plot shows how different wavelengths of light interact with
                            Titan's atmosphere and surface. The spectral shape reveals information about atmospheric
                            composition (methane, haze, other gases), surface composition, and viewing geometry.
                            Click on the IR image to select a location and generate its spectral signature.
                          </>
                        }>
                          Spectral Plot
                        </Tooltip>
                      </h2>
                      {loading ? (
                        <div style={{
                          padding: '40px',
                          textAlign: 'center',
                          backgroundColor: '#f8f9fa',
                          borderRadius: '8px',
                          margin: '10px'
                        }}>
                          <div style={{ fontSize: '18px', marginBottom: '10px' }}>🔄</div>
                          <p>Loading spectral data...</p>
                        </div>
                      ) : error ? (
                        <div style={{
                          padding: '40px',
                          textAlign: 'center',
                          backgroundColor: '#f8d7da',
                          borderRadius: '8px',
                          margin: '10px',
                          border: '1px solid #f5c6cb'
                        }}>
                          <div style={{ fontSize: '24px', marginBottom: '15px' }}>⚠️</div>
                          <h3 style={{ color: '#721c24', marginBottom: '10px' }}>Memory Error</h3>
                          <p style={{ color: '#721c24', marginBottom: '15px' }}>{error}</p>
                          <p style={{ color: '#856404', fontSize: '14px' }}>
                            The PyDISORT spectral dataset is too large for the browser to handle safely.
                            Consider using a more powerful machine or a different browser for this visualization.
                          </p>
                        </div>
                      ) : spectralData ? (
                        <>
                          <div style={{ width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box', position: 'relative' }}>
                            {loadingSpectral && (
                              <div className="loading-indicator">
                                <div className="loading-spinner"></div>
                                <p>Updating plot...</p>
                              </div>
                            )}
                            <ErrorBoundary>
                              <SpectralPlot
                                spectralData={spectralData}
                                incidenceAngle={geoValues
                                  ? (Array.isArray(geoValues)
                                    ? (Number.isFinite(geoValues[0]?.incidence) ? geoValues[0].incidence : NaN)
                                    : (Number.isFinite(geoValues.incidence) ? geoValues.incidence : NaN))
                                  : NaN}
                                emissionAngle={geoValues
                                  ? (Array.isArray(geoValues)
                                    ? (Number.isFinite(geoValues[0]?.emis) ? geoValues[0].emis : NaN)
                                    : (Number.isFinite(geoValues.emis) ? geoValues.emis : NaN))
                                  : NaN}
                                selectedCases={toggles.plotMultiple ? selectedCasesByPoint : selectedCases}
                                plotMultiple={toggles.plotMultiple}
                                multiplePositions={toggles.plotMultiple ? multiplePositions : null}
                                geoValues={geoValues}
                                transmissionToggles={transmissionToggles}
                                spectralUnits={toggles.spectralUnits}
                                spectralResolution={spectralResolution}
                                albedo={FIXED_ALBEDO}
                              />
                            </ErrorBoundary>
                            {geoValues && (
                              <div style={{ fontSize: '12px', color: '#666', marginTop: '10px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                                {Array.isArray(geoValues) ? (
                                  `Multiple points selected (${geoValues.length})`
                                ) : (
                                  <>
                                    Using geo-extracted angles:
                                    Inc={isFiniteNumber(geoValues.incidence) ? `${geoValues.incidence.toFixed(2)}°` : 'N/A'},
                                    Emi={isFiniteNumber(geoValues.emis) ? `${geoValues.emis.toFixed(2)}°` : 'N/A'}
                                    {Number.isFinite(geoValues.materialClass) ? (
                                      <>
                                        {' | '}
                                        Surface: {getSurfaceMaterialLabel(geoValues.materialClass)}
                                        {' | '}Spectrum albedo={geoValues.surfaceAlbedo}
                                      </>
                                    ) : null}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          {!geoValues && !Object.values(transmissionToggles).some(v => v) && (
                            <div style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              zIndex: 1000,
                              backgroundColor: 'rgba(42, 42, 42, 0.95)',
                              border: '2px solid #ffa500',
                              borderRadius: '8px',
                              padding: '20px 30px',
                              textAlign: 'center',
                              pointerEvents: 'none',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                              maxWidth: '80%'
                            }}>
                              <p style={{
                                color: '#ffa500',
                                fontSize: '16px',
                                fontWeight: '500',
                                margin: 0
                              }}>
                                Click on the IR image to plot a point and view the corresponding spectral plot data
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="plot-placeholder">
                          <p>No spectral data available</p>
                        </div>
                      )}
                    </div>
                    {/* Spectral Plot Options */}
                    <div ref={togglesBoxRef} className="control-box toggles-box">
                      <h2>
                        <Tooltip variant="green" content={
                          <>
                            <strong>Spectral Plot Options</strong>
                            Controls that modify how the spectral data is displayed and calculated. These options
                            allow you to change units (reflectance vs. radiance), adjust spectral resolution,
                            overlay gas transmission curves, and configure atmospheric components for different
                            model scenarios. These settings help you explore how different parameters affect
                            the observed spectral signatures.
                          </>
                        }>
                          Spectral Plot Options
                        </Tooltip>
                      </h2>
                      <div className="toggle-group">
                        {/* Existing non-functional toggles */}
                        {Object.entries(toggles)
                          .filter(([key]) => key !== 'plotMultiple' && key !== 'showAtmosphere')
                          .map(([key, value]) => {
                            const labelMap = {
                              spectralUnits: 'Spectral units',
                            };
                            const label = labelMap[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                            return (
                              <label key={key} className="toggle-label">
                                <input
                                  type="checkbox"
                                  checked={value}
                                  onChange={() => handleToggleChange(key)}
                                />
                                <span>
                                  {key === 'spectralUnits' ? (
                                    <Tooltip variant="green" content={
                                      <>
                                        <strong>Spectral Units</strong>
                                        Toggles between reflectance (normalized by solar flux) and radiance (absolute
                                        energy units). Reflectance is useful for comparing spectral shapes and identifying
                                        absorption features, while radiance shows the actual energy received at the detector.
                                        This helps understand both the relative spectral features and the absolute brightness
                                        of different wavelengths.
                                      </>
                                    }>
                                      {label}
                                    </Tooltip>
                                  ) : label}
                                </span>
                              </label>
                            );
                          })}
                      </div>
                      {/* Resolution Selection */}
                      <div style={{ marginTop: '20px', marginBottom: '20px', paddingTop: '12px', borderTop: '1px solid #3a3a3a' }}>
                        <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>
                          <Tooltip variant="green" content={
                            <>
                              <strong>Resolution</strong>
                              Spectra are interpolated to the same wavelength grid as gas transmission
                              (/data/gas_transmission.json), smoothed with a Gaussian (narrower toward the right,
                              wider toward the left), then binned when fewer points are shown. Gas overlays use the
                              same smoothing so curves stay comparable.
                            </>
                          }>
                            Resolution
                          </Tooltip>
                        </h3>
                        <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#ccc' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888' }}>
                            <span>Smoother</span>
                            <span>More detail</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={3}
                            step={1}
                            value={spectralResolutionIndex}
                            onChange={(e) => setSpectralResolutionIndex(parseInt(e.target.value, 10))}
                            aria-valuetext={SPECTRAL_RESOLUTION_LABELS[spectralResolutionIndex]}
                          />
                          <span style={{ fontSize: '13px' }}>
                            {SPECTRAL_RESOLUTION_LABELS[spectralResolutionIndex]}
                          </span>
                        </label>
                      </div>
                      {!toggles.plotMultiple && (
                        <div className="transmission-box" style={{ marginTop: '20px', marginBottom: '20px', paddingTop: '12px', borderTop: '1px solid #3a3a3a' }}>
                          <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>
                            <Tooltip variant="green" content={
                              <>
                                <strong>Transmission</strong>
                                Overlays gas transmission curves on the spectral plot, showing how much light passes
                                through the atmosphere at each wavelength for different atmospheric constituents
                                (CH₄, CO, C₂H₆, C₂H₂, Haze). These curves help identify which gases are responsible
                                for specific absorption features in the reflectance spectrum. Transmission values
                                near 1.0 indicate little absorption, while lower values show strong absorption bands.
                              </>
                            }>
                              Transmission
                            </Tooltip>
                          </h3>
                          <div className="transmission-toggle-group" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '8px' }}>
                            {Object.entries(transmissionToggles).map(([key, value]) => {
                              const labelMap = {
                                ch4: 'CH₄',
                                haze: 'Haze',
                                co: 'CO',
                                c2h6: 'C₂H₆',
                                c2h2: 'C₂H₂',
                              };
                              const label = labelMap[key] || key.toUpperCase();
                              return (
                                <label key={key} className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <input
                                    type="checkbox"
                                    checked={value}
                                    onChange={() => handleTransmissionToggleChange(key)}
                                  />
                                  <span>{label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '0', marginBottom: '0' }}></div>
                      {/* Atmospheric Components Section - only show when selected point(s) have associated spectral plot data */}
                      {(toggles.plotMultiple
                        ? Array.isArray(hasSpectralDataForSelection) && hasSpectralDataForSelection.some(Boolean)
                        : hasSpectralDataForSelection === true
                      ) && (
                          <div ref={atmosphericComponentsSectionRef} className="atmospheric-components-section">
                            <h3 className="atmospheric-components-header">
                              <Tooltip variant="green" content={
                                <>
                                  <strong>Atmospheric Components</strong>
                                  Configures which atmospheric constituents are included in the radiative transfer calculation
                                  for each selected point. Options include: "CH₄ + Haze" (standard case with both methane and
                                  haze), "No CH₄" (removes methane absorption), and "No haze" (removes haze scattering).
                                  Comparing these cases helps you understand the relative contributions of different atmospheric
                                  components to the observed spectral signature.
                                </>
                              }>
                                Atmospheric Components
                              </Tooltip>
                            </h3>
                            <div ref={atmosphericComponentsContentRef} className="atmospheric-components-content">
                              {toggles.plotMultiple && Array.isArray(geoValues) && geoValues.length > 0 ? (
                                // Multiple mode: show per-point options only for points that have spectral data
                                multiplePositions.map((pos, pointIndex) => {
                                  if (!hasSpectralDataForSelection[pointIndex]) return null;
                                  const colors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
                                  const colorValues = ['#ff0000', '#ffa500', '#ffff00', '#00ff00', '#0000ff', '#800080'];
                                  // Use colorIndex from position or geoValue if available, otherwise fall back to array index
                                  const geoValue = geoValues[pointIndex];
                                  const colorIndex = pos.colorIndex !== undefined ? pos.colorIndex :
                                    (geoValue && geoValue.colorIndex !== undefined ? geoValue.colorIndex : pointIndex);
                                  const colorNames = colors[colorIndex] || 'Red';
                                  const colorValue = colorValues[colorIndex] || '#ff0000';
                                  const pointCases = selectedCasesByPoint[pointIndex] || { standard: true, no_ch4: false, no_haze: false };
                                  // Format angles briefly for display
                                  const formatAngles = (incidence, emission, phase) => {
                                    const i = incidence != null ? incidence.toFixed(0) : '?';
                                    const e = emission != null ? emission.toFixed(0) : '?';
                                    const p = phase != null ? phase.toFixed(0) : '?';
                                    return `i:${i}° e:${e}° p:${p}°`;
                                  };
                                  const angleStr = geoValue ? formatAngles(geoValue.incidence, geoValue.emis, geoValue.phase) : '';

                                  return (
                                    <div key={pointIndex} className="point-atmospheric-options">
                                      <h4 className="point-atmospheric-header">
                                        Point {pointIndex + 1} (<span style={{ color: colorValue }}>{angleStr}</span>)
                                      </h4>
                                      <div className="case-toggle-options">
                                        {['standard', 'no_ch4', 'no_haze'].map((caseKey) => {
                                          const labelMap = {
                                            standard: 'CH₄ + Haze',
                                            no_ch4: 'No CH₄',
                                            no_haze: 'No haze'
                                          };
                                          const label = labelMap[caseKey] || caseKey.replace('_', ' ').replace(/^\w/, c => c.toUpperCase());
                                          return (
                                            <label key={caseKey} className="toggle-label case-toggle-label">
                                              <input
                                                type="checkbox"
                                                checked={!!pointCases[caseKey]}
                                                onChange={() => handleCaseChangeForPoint(pointIndex, caseKey)}
                                              />
                                              <span>{label}</span>
                                            </label>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  );
                                })
                              ) : !toggles.plotMultiple ? (
                                // Single mode: show single set of options (only rendered when hasSpectralDataForSelection is true)
                                <div className="case-toggle-options">
                                  {['standard', 'no_ch4', 'no_haze'].map((caseKey) => {
                                    const labelMap = {
                                      standard: 'CH₄ + Haze',
                                      no_ch4: 'No CH₄',
                                      no_haze: 'No haze'
                                    };
                                    const label = labelMap[caseKey] || caseKey.replace('_', ' ').replace(/^\w/, c => c.toUpperCase());
                                    const isDisabled = !geoValues;
                                    return (
                                      <label
                                        key={caseKey}
                                        className="toggle-label case-toggle-label"
                                        style={isDisabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isDisabled ? false : !!selectedCases[caseKey]}
                                          onChange={() => handleCaseChange(caseKey)}
                                          disabled={isDisabled}
                                        />
                                        <span style={isDisabled ? { color: '#666' } : {}}>{label}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              ) : (
                                <p style={{ color: '#999', fontSize: '12px', fontStyle: 'italic' }}>
                                  Select points on the image to configure atmospheric components
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                    </div>
                  </div>
                </div>
              </div>
            } />
          </Routes>
        </main>
        <Footer />
      </div>
    </Router>
  );
}

export default App;
