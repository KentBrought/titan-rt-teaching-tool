import React, { useState, useEffect, useCallback, useRef, useMemo, memo } from 'react';
import './App.css';
import SpectralPlot from './components/SpectralPlot';
import ClickableImage from './components/ClickableImage';
import GasAbundancePlot from './components/GasAbundancePlot';
import ErrorBoundary from './components/ErrorBoundary';
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
            const colorNames = colors[index] || 'Red';
            const colorValue = colorValues[index] || '#ff0000';
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

  // State for RT expansion on hover
  const [rtExpanded, setRtExpanded] = useState(false);
  const [rtExpansionText, setRtExpansionText] = useState({ left: 'Radiative', right: 'Transfer' });

  // State for development notice message (randomly selected on mount)
  const [developmentNotice, setDevelopmentNotice] = useState(() => {
    const random = Math.random();
    // 1% chance (1/100) to show the joke message
    if (random < 0.01) {
      return 'RT stands for "real-time"... just kidding!';
    }
    // Otherwise, randomly select from the other messages
    const messages = [
      'Check out our GitHub repo!',
      'Star our GitHub repo!',
      'RT stands for "radiative transfer"'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  });
  const [isHoveringRealtime, setIsHoveringRealtime] = useState(false);

  const [toggles, setToggles] = useState({
    plotMultiple: false,
    spectralUnits: false,
  });

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
  const [compositeType, setCompositeType] = useState('5_2_1.3'); // '5_2_1.3' or '2_1.6_1.3'
  const [hazePropertiesModel, setHazePropertiesModel] = useState('doose');
  const [imageType, setImageType] = useState('irColor'); // 'irColor', 'incidence', 'emission', 'phase'

  const handleSliderChange = (name, value) => {
    setSliders(prev => ({ ...prev, [name]: parseFloat(value) }));
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
  const fetchGeoValues = useCallback(async (x, y) => {
    try {
      setLoadingGeo(true);
      setLoadingSpectral(true); // Also set spectral loading state
      const phaseAngle = sliders.phaseAngle * 5; // Convert slider value to degrees
      const values = await extractGeoValues(phaseAngle, x, y);
      setGeoValues(values);
      console.log('Extracted geo values:', values);
    } catch (error) {
      console.error('Error extracting geo values:', error);
      setGeoValues({
        error: error.message,
        x,
        y
      });
    } finally {
      setLoadingGeo(false);
      // Delay clearing spectral loading to allow plot to update
      setTimeout(() => setLoadingSpectral(false), 100);
    }
  }, [sliders.phaseAngle]);

  // Fetch geo values for multiple positions
  const fetchMultipleGeoValues = useCallback(async (positions) => {
    try {
      setLoadingGeo(true);
      setLoadingSpectral(true); // Also set spectral loading state
      const phaseAngle = sliders.phaseAngle * 5;
      const geoValuesPromises = positions.map(async (pos, index) => {
        try {
          const values = await extractGeoValues(phaseAngle, pos.x, pos.y);
          return {
            ...values,
            x: pos.x,
            y: pos.y,
            index,
            color: ['red', 'orange', 'yellow', 'green', 'blue', 'purple'][index]
          };
        } catch (error) {
          return {
            error: error.message,
            x: pos.x,
            y: pos.y,
            index,
            color: ['red', 'orange', 'yellow', 'green', 'blue', 'purple'][index]
          };
        }
      });
      const allGeoValues = await Promise.all(geoValuesPromises);
      setGeoValues(allGeoValues);
    } catch (error) {
      console.error('Error extracting geo values:', error);
      setGeoValues(null);
    } finally {
      setLoadingGeo(false);
      // Delay clearing spectral loading to allow plot to update
      setTimeout(() => setLoadingSpectral(false), 100);
    }
  }, [sliders.phaseAngle]);

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
          // Remove existing position
          const newPositions = prev.filter((_, idx) => idx !== existingIndex);
          // Reindex case selections: indices after existingIndex shift down by 1
          setSelectedCasesByPoint(prevCases => {
            const newCases = {};
            for (let i = 0; i < prev.length; i++) {
              if (i < existingIndex) {
                // Keep indices before the removed one
                if (prevCases[i]) {
                  newCases[i] = { ...prevCases[i] };
                }
              } else if (i > existingIndex) {
                // Shift indices after the removed one down by 1
                if (prevCases[i]) {
                  newCases[i - 1] = { ...prevCases[i] };
                }
              }
              // Skip the removed index (existingIndex)
            }
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
          // Add new position
          const newPositions = [...prev, { x, y, position }];
          const newIndex = newPositions.length - 1;
          // Initialize case selections for new point (default: methane + haze)
          setSelectedCasesByPoint(prevCases => ({
            ...prevCases,
            [newIndex]: { standard: true, no_ch4: false, no_haze: false }
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

  // Update geo values when phase angle changes (if position is marked)
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
    <div className="App">
      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <img 
            src="/assets/dt/tomasko_1.0/2012_A0.1_p000_5_2_1.3.png" 
            alt="Logo" 
            className="header-logo"
          />
          <h1 
            className="app-title"
            onMouseEnter={() => {
              // Always show "Radiative Transfer"
              setRtExpansionText({ left: 'Radiative', right: 'Transfer' }); // R + "adiative", T + "ransfer"
              setRtExpanded(true);
            }}
            onMouseLeave={() => {
              setRtExpanded(false);
            }}
          >
            Titan <span className="rt-container">
              <span className="rt-letter-wrapper">
                <span className="rt-letter r-letter">R</span>
                <span className={`rt-expanded-left ${rtExpanded ? 'rt-visible' : ''}`}>
                  {rtExpanded && rtExpansionText.left.substring(1)}
                </span>
              </span>
              <span className="rt-letter-wrapper">
                <span className="rt-letter t-letter">T</span>
                <span className={`rt-expanded-right ${rtExpanded ? 'rt-visible' : ''}`}>
                  {rtExpanded && rtExpansionText.right.substring(1)}
                </span>
              </span>
            </span> <span className={`teaching-tool-text ${rtExpanded ? 'shifted' : ''}`}>Teaching Tool</span>
          </h1>
        </div>
        <div className="header-right">
          <div 
            className={`development-notice ${developmentNotice === 'RT stands for "real-time"' || developmentNotice === 'RT stands for "real-time"... just kidding!' ? 'realtime-message' : ''}`}
            onMouseEnter={() => {
              if (developmentNotice === 'RT stands for "real-time"' || developmentNotice === 'RT stands for "real-time"... just kidding!') {
                setIsHoveringRealtime(true);
              }
            }}
            onMouseLeave={() => {
              setIsHoveringRealtime(false);
            }}
          >
            <div className="development-notice-text">
              {developmentNotice}
            </div>
            <div className={`development-notice-overlay ${isHoveringRealtime && (developmentNotice === 'RT stands for "real-time"' || developmentNotice === 'RT stands for "real-time"... just kidding!') ? 'visible' : ''}`}>
              No it doesn't
            </div>
          </div>
          <div className="github-container">
            <a 
              href="https://github.com/KentBrought/titan-rt-teaching-tool" 
              target="_blank" 
              rel="noopener noreferrer"
              className="github-link"
              aria-label="GitHub Repository"
            >
              <span className="github-hover-text">Visit our Github Page!</span>
              <svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="currentColor"
                className="github-icon"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
            </a>
          </div>
        </div>
      </header>

      <div className="main-container">
        {/* Left side - Display panels */}
        <div className="left-panel">
          <div className="display-row">
            {/* Gas Abundance Plot (Methane vs Altitude) */}
            <div className="skinny-plot">
              <h3>Gas Abundance </h3>
              <div className="skinny-plot-content">
                <GasAbundancePlot methaneAbundance={sliders.methaneAbundance} />
              </div>
            </div>
            <div ref={irColorImageRef} className="display-box ir-color" style={{ position: 'relative' }}>
              <h2>IR Color</h2>
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
            <div ref={geoValuesContainerRef} style={{ display: 'flex', flexDirection: 'column', gap: '20px', minWidth: '200px', maxWidth: '250px', alignSelf: 'stretch', height: '100%' }}>
              {imageType === 'irColor' && (
                <div className="composite-selector" style={!geoValues ? { flex: '1 1 auto' } : {}}>
                  <h3 style={{ fontSize: '18px', marginBottom: '15px', color: '#e0e0e0' }}>Composite Type</h3>
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
            {/* IR Image Options */}
            <div className="control-box sliders-box">
              <h2>IR Image Options</h2>
              <div className="slider-group">
                {/* Haze Model Section */}
                <div style={{ marginBottom: '0' }}>
                  <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>Haze Model</h3>
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

                <label>
                  Haze abundance
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
                
                <label>
                  Methane abundance
                  <input 
                    type="range" 
                    min="0" 
                    max="100" 
                    value={sliders.methaneAbundance}
                    onChange={(e) => handleSliderChange('methaneAbundance', e.target.value)}
                  />
                  <span>{sliders.methaneAbundance}</span>
                </label>

                <label>
                  Phase angle
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
              </div>
              <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>
              <div style={{ marginTop: '0' }}>
                <label className="toggle-label">
                  <input 
                    type="checkbox"
                    checked={toggles.plotMultiple}
                    onChange={() => handleToggleChange('plotMultiple')}
                  />
                  <span>Plot multiple</span>
                </label>
              </div>
              <div style={{ borderTop: '1px solid #3a3a3a', marginTop: '15px', marginBottom: '15px' }}></div>
              {/* Image Type Section */}
              <div style={{ marginTop: '0' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>Image Type</h3>
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
          
          <div className="spectral-row">
            <div className="spectral-plot" style={{ position: 'relative' }}>
              <h2>Spectral Plot</h2>
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
              <h2>Spectral Plot Options</h2>
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
                        <span>{label}</span>
                      </label>
                    );
                  })}
              </div>
              {!toggles.plotMultiple && (
                <div className="transmission-box" style={{ marginTop: '20px', marginBottom: '20px', paddingTop: '12px', borderTop: '1px solid #3a3a3a' }}>
                  <h3 style={{ fontSize: '16px', marginBottom: '10px', fontWeight: 'normal' }}>Transmission</h3>
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
                <h3 className="atmospheric-components-header">Atmospheric Components</h3>
                <div ref={atmosphericComponentsContentRef} className="atmospheric-components-content">
                  {toggles.plotMultiple && Array.isArray(geoValues) && geoValues.length > 0 ? (
                    // Multiple mode: show per-point options
                    multiplePositions.map((pos, pointIndex) => {
                      const colors = ['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple'];
                      const colorNames = colors[pointIndex] || 'Red';
                      const colorValues = ['#ff0000', '#ffa500', '#ffff00', '#00ff00', '#0000ff', '#800080'];
                      const colorValue = colorValues[pointIndex] || '#ff0000';
                      const pointCases = selectedCasesByPoint[pointIndex] || { standard: true, no_ch4: false, no_haze: false };
                      
                      return (
                        <div key={pointIndex} className="point-atmospheric-options">
                          <h4 className="point-atmospheric-header">
                            Point {pointIndex + 1} (<span style={{ color: colorValue }}>{colorNames}</span>)
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
    </div>
  );
}

export default App;