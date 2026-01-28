import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import SpectralPlot from './components/SpectralPlot';
import ClickableImage from './components/ClickableImage';
import GasAbundancePlot from './components/GasAbundancePlot';
import ErrorBoundary from './components/ErrorBoundary';
import UserGuide from './components/UserGuide';
import Header from './components/Header';
import ScrollToTop from './components/ScrollToTop';
import Tooltip from './components/Tooltip';
import { loadJsonFile, clearDataCache, getMemoryInfo } from './utils/dataLoader';
import { loadPds4Image, getAvailablePhaseAngles, preloadAdjacentImages } from './utils/imageLoader';
import { extractGeoValues, getGeoCubeData, getGeoValue } from './utils/geoCubeLoader';

// Memoized component for geoValues display to prevent unnecessary re-renders
const GeoValuesDisplay = memo(({ geoValues, plotMultiple, loadingGeo }) => {
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
                    <p><strong>Latitude:</strong> {values.lat != null ? `${values.lat.toFixed(4)}° ${values.lat < 0 ? 'N' : 'S'}` : 'N/A'}</p>
                    <p><strong>Longitude:</strong> {values.lon != null ? `${values.lon.toFixed(4)}° ${values.lon < 0 ? 'W' : 'E'}` : 'N/A'}</p>
                    <p><strong>Phase:</strong> {values.phase != null ? `${values.phase.toFixed(2)}°` : 'N/A'}</p>
                    <p><strong>Incidence:</strong> {values.incidence != null ? `${values.incidence.toFixed(2)}°` : 'N/A'}</p>
                    <p><strong>Emis:</strong> {values.emis != null ? `${values.emis.toFixed(2)}°` : 'N/A'}</p>
                    <p><strong>Azimuth:</strong> {values.azimuth != null ? `${values.azimuth.toFixed(2)}°` : 'N/A'}</p>
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
            <h4 style={{ marginBottom: '10px', fontSize: '16px', color: '#e0e0e0' }}>
              Point at (<span style={{ color: '#007acc', fontWeight: 'bold' }}>{geoValues.x}, {geoValues.y}</span>)
            </h4>
            {geoValues.error ? (
              <p style={{ color: '#ff6b6b' }}>Error: {geoValues.error}</p>
            ) : (
              <div style={{ fontSize: '14px', color: '#ccc' }}>
                <p><strong>Latitude:</strong> {geoValues.lat != null ? `${geoValues.lat.toFixed(4)}° ${geoValues.lat < 0 ? 'N' : 'S'}` : 'N/A'}</p>
                <p><strong>Longitude:</strong> {geoValues.lon != null ? `${geoValues.lon.toFixed(4)}° ${geoValues.lon < 0 ? 'W' : 'E'}` : 'N/A'}</p>
                <p><strong>Phase:</strong> {geoValues.phase != null ? `${geoValues.phase.toFixed(2)}°` : 'N/A'}</p>
                <p><strong>Incidence:</strong> {geoValues.incidence != null ? `${geoValues.incidence.toFixed(2)}°` : 'N/A'}</p>
                <p><strong>Emis:</strong> {geoValues.emis != null ? `${geoValues.emis.toFixed(2)}°` : 'N/A'}</p>
                <p><strong>Azimuth:</strong> {geoValues.azimuth != null ? `${geoValues.azimuth.toFixed(2)}°` : 'N/A'}</p>
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
             p.incidence === n.incidence && p.emis === n.emis && p.azimuth === n.azimuth;
    });
  }
  
  // For single object, compare key properties
  if (!Array.isArray(prev) && !Array.isArray(next)) {
    return prev.x === next.x && prev.y === next.y &&
           prev.lat === next.lat && prev.lon === next.lon &&
           prev.incidence === next.incidence && prev.emis === next.emis && prev.azimuth === next.azimuth;
  }
  
  return false; // Different types
});

GeoValuesDisplay.displayName = 'GeoValuesDisplay';

function App() {
  const [activeTab, setActiveTab] = useState('tab1');
  const [sliders, setSliders] = useState({
    hazeAbundance: 50,
    methaneAbundance: 50,
    incidenceAngle: 45,
    emissionAngle: 45,
    phaseAngle: 0
  });


  const [toggles, setToggles] = useState({
    plotMultiple: false,
    spectralUnits: false,
  });

  const [spectralResolution, setSpectralResolution] = useState('high');

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

  const handleResolutionChange = (resolution) => {
    setSpectralResolution(resolution);
  };

  // Spectral data state
  const [spectralData, setSpectralData] = useState(null);
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
  const [isDraggingPhaseAngle, setIsDraggingPhaseAngle] = useState(false); // Track if phase angle slider is being dragged
  const [committedPhaseAngle, setCommittedPhaseAngle] = useState(0); // Committed phase angle for geo value fetching (initialized to match initial phaseAngle)
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
  const [tutorialMode, setTutorialMode] = useState(null);

  const handleSliderChange = (name, value) => {
    setSliders(prev => ({ ...prev, [name]: parseFloat(value) }));
  };

  // Handle phase angle slider drag start
  const handlePhaseAngleDragStart = () => {
    setIsDraggingPhaseAngle(true);
    // Invalidate any in-flight geo value fetches by incrementing the request ID
    geoValuesRequestIdRef.current += 1;
  };

  // Handle phase angle slider drag end
  const handlePhaseAngleDragEnd = () => {
    setIsDraggingPhaseAngle(false);
    // Update committed phase angle, which will trigger geo value fetch
    setCommittedPhaseAngle(sliders.phaseAngle);
  };

  // Handle phase angle slider blur (for keyboard input)
  const handlePhaseAngleBlur = () => {
    if (isDraggingPhaseAngle) {
      // If we were dragging, commit the value
      setIsDraggingPhaseAngle(false);
      setCommittedPhaseAngle(sliders.phaseAngle);
    }
  };

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
    // Increment request ID to invalidate any in-flight requests
    geoValuesRequestIdRef.current += 1;
    const currentRequestId = geoValuesRequestIdRef.current;
    
    try {
      setLoadingGeo(true);
      setLoadingSpectral(true); // Also set spectral loading state
      const phaseAngle = phaseAngleOverride !== null ? phaseAngleOverride : (committedPhaseAngle * 5); // Convert slider value to degrees
      const values = await extractGeoValues(phaseAngle, x, y);
      
      // Check if this request is still valid (not superseded by a newer request)
      if (currentRequestId !== geoValuesRequestIdRef.current) {
        return; // This request is stale, ignore the result
      }
      
      setGeoValues(values);
      console.log('Extracted geo values:', values);
    } catch (error) {
      // Check if this request is still valid
      if (currentRequestId !== geoValuesRequestIdRef.current) {
        return; // This request is stale, ignore the error
      }
      console.error('Error extracting geo values:', error);
      setGeoValues({
        error: error.message,
        x,
        y
      });
    } finally {
      // Only update loading state if this request is still valid
      if (currentRequestId === geoValuesRequestIdRef.current) {
        setLoadingGeo(false);
        // Delay clearing spectral loading to allow plot to update
        setTimeout(() => setLoadingSpectral(false), 100);
      }
    }
  }, [committedPhaseAngle]);

  // Fetch geo values for multiple positions
  const fetchMultipleGeoValues = useCallback(async (positions, phaseAngleOverride = null) => {
    // Increment request ID to invalidate any in-flight requests
    geoValuesRequestIdRef.current += 1;
    const currentRequestId = geoValuesRequestIdRef.current;
    
    try {
      setLoadingGeo(true);
      setLoadingSpectral(true); // Also set spectral loading state
      const phaseAngle = phaseAngleOverride !== null ? phaseAngleOverride : (committedPhaseAngle * 5);
      const colorNames = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
      const geoValuesPromises = positions.map(async (pos, index) => {
        try {
          const values = await extractGeoValues(phaseAngle, pos.x, pos.y);
          
          // Check if this request is still valid (not superseded by a newer request)
          if (currentRequestId !== geoValuesRequestIdRef.current) {
            return null; // This request is stale, ignore the result
          }
          
          // Use stored colorIndex if available, otherwise fall back to array index
          const colorIndex = pos.colorIndex !== undefined ? pos.colorIndex : index;
          
          return {
            ...values,
            x: pos.x,
            y: pos.y,
            index,
            colorIndex,
            color: colorNames[colorIndex] || 'red'
          };
        } catch (error) {
          // Check if this request is still valid
          if (currentRequestId !== geoValuesRequestIdRef.current) {
            return null; // This request is stale, ignore the error
          }
          // Use stored colorIndex if available, otherwise fall back to array index
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
      
      // Check if this request is still valid
      if (currentRequestId !== geoValuesRequestIdRef.current) {
        return; // This request is stale, ignore the result
      }
      
      // Filter out null values (from stale requests)
      const validGeoValues = allGeoValues.filter(v => v !== null);
      setGeoValues(validGeoValues.length > 0 ? validGeoValues : null);
    } catch (error) {
      // Check if this request is still valid
      if (currentRequestId !== geoValuesRequestIdRef.current) {
        return; // This request is stale, ignore the error
      }
      console.error('Error extracting geo values:', error);
      setGeoValues(null);
    } finally {
      // Only update loading state if this request is still valid
      if (currentRequestId === geoValuesRequestIdRef.current) {
        setLoadingGeo(false);
        // Delay clearing spectral loading to allow plot to update
        setTimeout(() => setLoadingSpectral(false), 100);
      }
    }
  }, [committedPhaseAngle]);

  // Cache for geo cube data (by phase angle)
  const geoCubeDataRef = useRef(null);
  const currentPhaseAngleRef = useRef(null);
  
  // Debounce timer ref for hover handler
  const hoverDebounceTimerRef = useRef(null);
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

  // Handle image hover to extract geo values (with debouncing and cached data)
  const handleImageHover = useCallback((x, y, position) => {
    // Clear any existing timer
    if (hoverDebounceTimerRef.current) {
      clearTimeout(hoverDebounceTimerRef.current);
    }

    if (x === null || y === null) {
      setHoverGeoValues(null);
      return;
    }

    // Use cached data for instant lookups (no async needed)
    hoverDebounceTimerRef.current = setTimeout(() => {
      const geoData = geoCubeDataRef.current;
      if (!geoData) {
        // If data not loaded yet, fall back to async call
        const phaseAngle = sliders.phaseAngle * 5;
        extractGeoValues(phaseAngle, x, y).then(values => {
          setHoverGeoValues(values);
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
        const azimuth = getGeoValue(geoData, x, y, 7);

        setHoverGeoValues({
          lat: lat !== null ? lat : null,
          lon: lon !== null ? lon : null,
          phase: phase !== null ? phase : null,
          incidence: incidence !== null ? incidence : null,
          emis: emis !== null ? emis : null,
          azimuth: azimuth !== null ? azimuth : null,
          x,
          y
        });
      } catch (error) {
        console.error('Error extracting hover geo values:', error);
        setHoverGeoValues(null);
      }
    }, 10); // Reduced debounce delay to 10ms since lookups are now instant
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
        } else if (prev.length < 6) {
          // Add new position - assign next available color index
          const usedColorIndices = prev.map(pos => pos.colorIndex !== undefined ? pos.colorIndex : prev.indexOf(pos));
          let nextColorIndex = 0;
          while (usedColorIndices.includes(nextColorIndex) && nextColorIndex < 6) {
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
    setTutorialMode(null);
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

  // Apply plot multiple mode
  setToggles(prev => ({ ...prev, plotMultiple: preset.plotMultiple }));

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
  const hazeFolderName = `${hazePropertiesModel}_${hazeAbundanceSetting.toFixed(1)}`;

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
        
        // Load the current image
        const imageDataUrl = await loadPds4Image(phaseAngle, imageTypeToLoad, hazeFolderName);
        setCurrentImage(imageDataUrl);
        
        // Preload adjacent images in the background for smoother transitions
        preloadAdjacentImages(phaseAngle, imageTypeToLoad, hazeFolderName, 2);
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
  }, [sliders.phaseAngle, compositeType, hazeFolderName, imageType]);

  // Update geo values when committed phase angle changes (if position is marked)
  // This only runs when the phase angle slider is released, not during dragging
  useEffect(() => {
    if (toggles.plotMultiple && multiplePositions.length > 0) {
      fetchMultipleGeoValues(multiplePositions);
    } else if (!toggles.plotMultiple && clickedPosition) {
      fetchGeoValues(clickedPosition.x, clickedPosition.y);
    }
  }, [committedPhaseAngle, clickedPosition, multiplePositions, toggles.plotMultiple, fetchGeoValues, fetchMultipleGeoValues]);

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

  // Load spectral data when haze configuration changes
  useEffect(() => {
    let isCancelled = false;

    const loadSpectralData = async () => {
      try {
        setLoading(true);
        setError(null);
        const dataPath = `/assets/dt/tomasko_1.0/init_gui_library.json`;
        console.log(`Loading spectral data from ${dataPath}...`);

        const spectralJson = await loadJsonFile(dataPath);
        if (isCancelled) return;

        console.log('Spectral data loaded successfully:', Object.keys(spectralJson));
        console.log('Memory usage after loading:', getMemoryInfo());

        if (!spectralJson || !spectralJson.wavelength || !spectralJson.standard) {
          throw new Error('Invalid spectral data structure');
        }

        setSpectralData(spectralJson);
        const inc = spectralJson.inc || [];
        const emi = spectralJson.emi || [];
        const daz = spectralJson.daz || [];
        console.log('Angle arrays:', { inc: inc.length, emi: emi.length, daz: daz.length });
        setAngleOptions({ inc, emi, daz });
      } catch (err) {
        if (isCancelled) return;
        console.error('Error loading spectral data:', err);
        
        // Check if it's a memory error
        const errorMessage = err.message || String(err);
        if (errorMessage.toLowerCase().includes('memory') || errorMessage.toLowerCase().includes('out of')) {
          setError('Out of memory error. The spectral dataset is too large for your browser. Please try refreshing the page or use a more powerful machine.');
        } else {
          setError(`Unable to load spectral data from ${hazeFolderName}. ${err.message}`);
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
  }, [hazeFolderName]);

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
        <Routes>
          <Route path="/user-guide" element={<UserGuide />} />
          <Route path="/" element={
            <div className="main-container">
        {/* Left side - Display panels */}
        <div className="left-panel">       
          <div className="display-row">
            {/* Gas Abundance Plot (Methane vs Altitude) */}
            <div className="skinny-plot">
              <h3>
                <Tooltip content={
                  <>
                    <strong>Gas Abundance</strong>
                    Shows the vertical distribution of atmospheric gases (CH₄, H₂, CO, C₂H₆, C₂H₂) as a function of altitude. 
                    CH₄ (methane) is displayed on a linear scale to show its variability, while trace gases use a logarithmic scale. 
                    Adjusting the methane abundance slider scales the CH₄ profile, helping you understand how methane concentration 
                    affects Titan's atmospheric composition and radiative transfer properties.
                  </>
                }>
                  Gas Abundance
                </Tooltip>
              </h3>
              <div className="skinny-plot-content">
                <GasAbundancePlot methaneAbundance={sliders.methaneAbundance} />
              </div>
            </div>
            <div ref={irColorImageRef} className="display-box ir-color" style={{ position: 'relative' }}>
              <h2>
                <Tooltip content={
                  <>
                    <strong>IR Color</strong>
                    A false-color composite image of Titan created by combining three infrared wavelengths. 
                    This visualization helps identify different surface and atmospheric features based on their spectral signatures. 
                    Click on locations in this image to extract geophysical values (latitude, longitude, viewing angles) and 
                    generate corresponding spectral plots that show how light interacts with Titan's atmosphere at that location.
                  </>
                }>
                  IR Color
                </Tooltip>
              </h2>
              {currentImage ? (
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
                        <strong>Hover Position:</strong> Coordinates: (<span style={{ color: '#007acc', fontWeight: 'bold' }}>{hoverGeoValues.x}, {hoverGeoValues.y}</span>), Incidence: {hoverGeoValues.incidence != null ? `${hoverGeoValues.incidence.toFixed(2)}°` : 'N/A'}, Emission: {hoverGeoValues.emis != null ? `${hoverGeoValues.emis.toFixed(2)}°` : 'N/A'}, Phase: {hoverGeoValues.phase != null ? `${hoverGeoValues.phase.toFixed(2)}°` : 'N/A'}
                      </>
                    ) : (
                      <span>Hover over the image to see coordinates and angles</span>
                    )}
                  </div>
                </>
              ) : (
                <div className="placeholder-circle"></div>
              )}
            </div>
            <div ref={geoValuesContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '200px', maxWidth: '250px', alignSelf: 'stretch' }}>
              
              {imageType === 'irColor' && (
                <div className="composite-selector" style={!geoValues ? { flex: '1 1 auto' } : {}}>
                  <h3 style={{ fontSize: '18px', marginBottom: '15px', color: '#e0e0e0' }}>
                    <Tooltip content={
                      <>
                        <strong>Composite Type</strong>
                        Selects which three infrared wavelengths are combined to create the false-color image. 
                        "5, 2, 1.3 µm" uses longer wavelengths that penetrate deeper into the atmosphere, 
                        while "2, 1.6, 1.3 µm" uses shorter wavelengths that are more sensitive to surface features. 
                        Different composite types reveal different aspects of Titan's surface and atmospheric scattering properties.
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
                      <span>5, 2, 1.3 µm</span>
                    </label>
                    <label className="radio-label">
                      <input
                        type="radio"
                        name="compositeType"
                        value="2_1.6_1.3"
                        checked={compositeType === '2_1.6_1.3'}
                        onChange={(e) => setCompositeType(e.target.value)}
                      />
                      <span>2, 1.6, 1.3 µm</span>
                    </label>
                  </div>
                </div>
              )}
              {geoValues && (
                <div ref={geoValuesBoxRef} style={{ flex: imageType === 'irColor' ? '1 1 auto' : '1 1 auto', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                  <GeoValuesDisplay 
                    geoValues={geoValues} 
                    plotMultiple={toggles.plotMultiple}
                    loadingGeo={loadingGeo}
                  />
                </div>
              )}
            </div>
            {/* Quick Start */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '250px', maxWidth: '300px', alignSelf: 'stretch' }}>
              {/* Quick Start Presets */}
              <div className="control-box" style={{ height: 'auto', border: '2px solid #66ccff' }}>
                <h2>Quick Start</h2>
                <div className="radio-group">
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="tutorialMode"
                      checked={tutorialMode === 1}
                      onChange={() => applyTutorialMode(tutorialMode === 1 ? null : 1)}
                    />
                    <span>Methane Explorer</span>
                  </label>
                  <label className="radio-label">
                    <input
                      type="radio"
                      name="tutorialMode"
                      checked={tutorialMode === 2}
                      onChange={() => applyTutorialMode(tutorialMode === 2 ? null : 2)}
                    />
                    <span>Haze Comparison</span>
                  </label>
                </div>
              </div>
            {/* IR Image Options */}
            <div className="control-box sliders-box" style={{ flex: '1', display: 'flex', flexDirection: 'column' }}>
              <h2>
                <Tooltip content={
                  <>
                    <strong>IR Image Options</strong>
                    Controls that modify the infrared image display and atmospheric parameters. 
                    These settings affect both the visible image and the underlying radiative transfer calculations 
                    used to generate spectral plots. Adjusting these parameters helps you explore how different 
                    atmospheric conditions and viewing geometries affect what we observe on Titan.
                  </>
                }>
                  IR Image Options
                </Tooltip>
              </h2>
              <div className="slider-group">
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
                    onMouseDown={handlePhaseAngleDragStart}
                    onMouseUp={handlePhaseAngleDragEnd}
                    onTouchStart={handlePhaseAngleDragStart}
                    onTouchEnd={handlePhaseAngleDragEnd}
                    onBlur={handlePhaseAngleBlur}
                  />
                  <span>{sliders.phaseAngle * 5}°</span>
                </label>
              </div>
              <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>
              <div style={{ marginTop: '0' }}>
                <label className="toggle-label">
                  <input 
                    type="checkbox"
                    checked={toggles.plotMultiple}
                    onChange={() => handleToggleChange('plotMultiple')}
                  />
                  <span>
                    <Tooltip content={
                      <>
                        <strong>Plot Multiple</strong>
                        When enabled, allows you to select up to 6 different locations on the image and 
                        compare their spectral properties simultaneously. Each point is color-coded, and you 
                        can independently configure atmospheric components (methane + haze, no methane, no haze) 
                        for each point. This mode is ideal for comparing how different surface locations or 
                        viewing geometries affect spectral reflectance.
                      </>
                    }>
                      Plot multiple
                    </Tooltip>
                  </span>
                </label>
              </div>
              <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>
              {/* Image Type Section */}
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
                        incidenceAngle={geoValues ? (Array.isArray(geoValues) ? geoValues[0]?.incidence ?? 0 : geoValues.incidence ?? 0) : 0}
                        emissionAngle={geoValues ? (Array.isArray(geoValues) ? geoValues[0]?.emis ?? 0 : geoValues.emis ?? 0) : 0}
                        azimuthAngle={geoValues ? (Array.isArray(geoValues) ? geoValues[0]?.azimuth ?? 0 : geoValues.azimuth ?? 0) : 0}
                        selectedCases={toggles.plotMultiple ? selectedCasesByPoint : selectedCases}
                        plotMultiple={toggles.plotMultiple}
                        multiplePositions={toggles.plotMultiple ? multiplePositions : null}
                        geoValues={geoValues}
                        transmissionToggles={transmissionToggles}
                        spectralUnits={toggles.spectralUnits}
                      />
                    </ErrorBoundary>
                    {geoValues && (
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '10px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                        {Array.isArray(geoValues) ? (
                          `Multiple points selected (${geoValues.length})`
                        ) : (
                          <>
                            Using geo-extracted angles: 
                            Inc={geoValues.incidence != null ? `${geoValues.incidence.toFixed(2)}°` : 'N/A'}, 
                            Emi={geoValues.emis != null ? `${geoValues.emis.toFixed(2)}°` : 'N/A'}, 
                            Az={geoValues.azimuth != null ? `${geoValues.azimuth.toFixed(2)}°` : 'N/A'}
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
                  .filter(([key]) => key !== 'plotMultiple')
                  .map(([key, value]) => {
                    const labelMap = {
                      spectralUnits: 'Spectral units'
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
                      Controls the spectral resolution of the plot. High resolution shows more detailed 
                      spectral features and absorption lines, while low resolution provides a smoother, 
                      more general view of the spectral shape. Higher resolution is useful for identifying 
                      specific gas absorption features, while lower resolution helps visualize overall trends 
                      and reduces computational load.
                    </>
                  }>
                    Resolution
                  </Tooltip>
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="radio"
                      name="spectralResolution"
                      value="high"
                      checked={spectralResolution === 'high'}
                      onChange={() => handleResolutionChange('high')}
                    />
                    <span>High Resolution</span>
                  </label>
                  <label className="toggle-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="radio"
                      name="spectralResolution"
                      value="low"
                      checked={spectralResolution === 'low'}
                      onChange={() => handleResolutionChange('low')}
                    />
                    <span>Low Resolution</span>
                  </label>
                </div>
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
              {/* Atmospheric Components Section */}
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
                    // Multiple mode: show per-point options
                    multiplePositions.map((pos, pointIndex) => {
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
                    // Single mode: show single set of options
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
            </div>
          </div>
        </div>
        </div>
            } />
          </Routes>
        </div>
      </Router>
    );
  }

export default App;