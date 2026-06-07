import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import './ClickableImage.css';

const GEO_GRID_SIZE = 681;
const GEO_BAND_SIZE = GEO_GRID_SIZE * GEO_GRID_SIZE;
const LAT_GRID_LINES = [-60, -30, 0, 30, 60];
const LON_LABEL_STEPS = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
const GEO_SURFACE_DISK_BOUNDS = { minX: 83, minY: 83, maxX: 597, maxY: 597, naturalWidth: 681, naturalHeight: 681 };
const VISUAL_SOURCE_DISK_BOUNDS = { minX: 66, minY: 67, maxX: 613, maxY: 613, naturalWidth: 681, naturalHeight: 681 };
const geoBoundsCache = new WeakMap();

const normalizeLongitudeDeg = (lonDeg) => {
  if (!Number.isFinite(lonDeg)) return null;
  return ((((lonDeg + 180) % 360) + 360) % 360) - 180;
};

const angularDifferenceDeg = (valueDeg, targetDeg) => {
  const value = normalizeLongitudeDeg(valueDeg);
  const target = normalizeLongitudeDeg(targetDeg);
  if (!Number.isFinite(value) || !Number.isFinite(target)) return null;
  return ((((value - target + 180) % 360) + 360) % 360) - 180;
};

const buildPath = (points) => {
  if (!points || points.length < 2) return '';
  return points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
};

const getGeoLat = (geoData, x, y) => geoData[y * GEO_GRID_SIZE + x];
const getGeoLon = (geoData, x, y) => geoData[GEO_BAND_SIZE + y * GEO_GRID_SIZE + x];

const isValidLat = (lat) => Number.isFinite(lat) && lat >= -90 && lat <= 90;
const isValidLon = (lon) => Number.isFinite(lon) && lon >= -360 && lon <= 360;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getGeoBounds = (geoData) => {
  if (!geoData || typeof geoData.length !== 'number' || geoData.length < GEO_BAND_SIZE * 2) return null;
  const cached = geoBoundsCache.get(geoData);
  if (cached) return cached;
  let minX = GEO_GRID_SIZE;
  let minY = GEO_GRID_SIZE;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < GEO_GRID_SIZE; y += 1) {
    const row = y * GEO_GRID_SIZE;
    for (let x = 0; x < GEO_GRID_SIZE; x += 1) {
      const idx = row + x;
      const lat = geoData[idx];
      const lon = geoData[GEO_BAND_SIZE + idx];
      if (!isValidLat(lat) || !isValidLon(lon)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return null;
  const bounds = { minX, minY, maxX, maxY };
  geoBoundsCache.set(geoData, bounds);
  return bounds;
};

const getIdentityImageBounds = (img) => ({
  minX: 0,
  minY: 0,
  maxX: Math.max(0, (img?.naturalWidth || GEO_GRID_SIZE) - 1),
  maxY: Math.max(0, (img?.naturalHeight || GEO_GRID_SIZE) - 1),
});

const mapGeoBoundsToImageBounds = (img, geoBounds) => {
  if (!geoBounds) return null;
  const naturalWidth = img?.naturalWidth || GEO_GRID_SIZE;
  const naturalHeight = img?.naturalHeight || GEO_GRID_SIZE;
  const scaleX = Math.max(1, naturalWidth - 1) / (GEO_GRID_SIZE - 1);
  const scaleY = Math.max(1, naturalHeight - 1) / (GEO_GRID_SIZE - 1);
  return {
    minX: geoBounds.minX * scaleX,
    minY: geoBounds.minY * scaleY,
    maxX: geoBounds.maxX * scaleX,
    maxY: geoBounds.maxY * scaleY,
  };
};

const scaleReferenceBoundsToNaturalSize = (bounds, naturalWidth, naturalHeight) => {
  const sourceWidth = bounds.naturalWidth || GEO_GRID_SIZE;
  const sourceHeight = bounds.naturalHeight || GEO_GRID_SIZE;
  const scaleX = Math.max(1, naturalWidth - 1) / Math.max(1, sourceWidth - 1);
  const scaleY = Math.max(1, naturalHeight - 1) / Math.max(1, sourceHeight - 1);
  return {
    minX: bounds.minX * scaleX,
    minY: bounds.minY * scaleY,
    maxX: bounds.maxX * scaleX,
    maxY: bounds.maxY * scaleY,
  };
};

const getImageVisualFit = (transform, imageSize) => {
  if (!transform?.hasGeoData || !imageSize?.width || !imageSize?.height) return null;
  const naturalWidth = transform.naturalWidth || GEO_GRID_SIZE;
  const naturalHeight = transform.naturalHeight || GEO_GRID_SIZE;
  const source = scaleReferenceBoundsToNaturalSize(VISUAL_SOURCE_DISK_BOUNDS, naturalWidth, naturalHeight);
  const target = transform.imageBounds || scaleReferenceBoundsToNaturalSize(GEO_SURFACE_DISK_BOUNDS, naturalWidth, naturalHeight);
  const sourceW = Math.max(1, source.maxX - source.minX);
  const sourceH = Math.max(1, source.maxY - source.minY);
  const targetW = Math.max(1, target.maxX - target.minX);
  const targetH = Math.max(1, target.maxY - target.minY);
  const scale = Math.min(targetW / sourceW, targetH / sourceH);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const sourceCx = (source.minX + source.maxX) / 2;
  const sourceCy = (source.minY + source.maxY) / 2;
  const targetCx = (target.minX + target.maxX) / 2;
  const targetCy = (target.minY + target.maxY) / 2;
  const translateX = targetCx - (sourceCx * scale);
  const translateY = targetCy - (sourceCy * scale);
  const displayScaleX = imageSize.width / Math.max(1, naturalWidth);
  const displayScaleY = imageSize.height / Math.max(1, naturalHeight);

  return {
    transform: `translate(${(translateX * displayScaleX).toFixed(3)}px, ${(translateY * displayScaleY).toFixed(3)}px) scale(${scale.toFixed(6)})`,
    transformOrigin: '0 0',
    willChange: 'transform',
  };
};

const buildImageGeoTransform = (img, geoData) => {
  const hasGeoData = geoData && typeof geoData.length === 'number' && geoData.length >= GEO_BAND_SIZE * 2;
  const geoBounds = getGeoBounds(geoData) || GEO_SURFACE_DISK_BOUNDS;
  const identityBounds = getIdentityImageBounds(img);
  const imageBounds = (hasGeoData ? mapGeoBoundsToImageBounds(img, geoBounds) : null)
    || identityBounds;
  return {
    geoBounds,
    imageBounds,
    naturalWidth: img?.naturalWidth || GEO_GRID_SIZE,
    naturalHeight: img?.naturalHeight || GEO_GRID_SIZE,
    hasGeoData,
  };
};

const mapImageNaturalToGeo = (x, y, transform) => {
  const t = transform || {
    imageBounds: { minX: 0, minY: 0, maxX: GEO_GRID_SIZE - 1, maxY: GEO_GRID_SIZE - 1 },
    geoBounds: { minX: 0, minY: 0, maxX: GEO_GRID_SIZE - 1, maxY: GEO_GRID_SIZE - 1 },
  };
  const imageW = Math.max(1, t.imageBounds.maxX - t.imageBounds.minX);
  const imageH = Math.max(1, t.imageBounds.maxY - t.imageBounds.minY);
  const geoW = Math.max(1, t.geoBounds.maxX - t.geoBounds.minX);
  const geoH = Math.max(1, t.geoBounds.maxY - t.geoBounds.minY);
  const nx = (x - t.imageBounds.minX) / imageW;
  const ny = (y - t.imageBounds.minY) / imageH;
  return {
    x: Math.round(clamp(t.geoBounds.minX + nx * geoW, 0, GEO_GRID_SIZE - 1)),
    y: Math.round(clamp(t.geoBounds.minY + ny * geoH, 0, GEO_GRID_SIZE - 1)),
  };
};

const mapGeoToImageNatural = (x, y, transform) => {
  const t = transform || {
    imageBounds: { minX: 0, minY: 0, maxX: GEO_GRID_SIZE - 1, maxY: GEO_GRID_SIZE - 1 },
    geoBounds: { minX: 0, minY: 0, maxX: GEO_GRID_SIZE - 1, maxY: GEO_GRID_SIZE - 1 },
  };
  const imageW = Math.max(1, t.imageBounds.maxX - t.imageBounds.minX);
  const imageH = Math.max(1, t.imageBounds.maxY - t.imageBounds.minY);
  const geoW = Math.max(1, t.geoBounds.maxX - t.geoBounds.minX);
  const geoH = Math.max(1, t.geoBounds.maxY - t.geoBounds.minY);
  const nx = (x - t.geoBounds.minX) / geoW;
  const ny = (y - t.geoBounds.minY) / geoH;
  return {
    x: t.imageBounds.minX + nx * imageW,
    y: t.imageBounds.minY + ny * imageH,
  };
};

const mapGeoBoundsToDisplayEllipse = (bounds, mapGeoToDisplay) => {
  if (!bounds) return null;
  const topLeft = mapGeoToDisplay(bounds.minX, bounds.minY);
  const bottomRight = mapGeoToDisplay(bounds.maxX, bounds.maxY);
  const left = Math.min(topLeft.x, bottomRight.x);
  const right = Math.max(topLeft.x, bottomRight.x);
  const top = Math.min(topLeft.y, bottomRight.y);
  const bottom = Math.max(topLeft.y, bottomRight.y);
  const rx = Math.max(0, (right - left) / 2);
  const ry = Math.max(0, (bottom - top) / 2);
  if (rx < 1 || ry < 1) return null;
  return {
    cx: left + rx,
    cy: top + ry,
    rx,
    ry,
  };
};

const interpolateCrossing = (aValue, bValue) => {
  const denom = Math.abs(aValue) + Math.abs(bValue);
  if (denom <= 1e-8) return 0.5;
  return Math.max(0, Math.min(1, Math.abs(aValue) / denom));
};

const contourEdgeDefinitions = [
  {
    edge: 0,
    a: 0,
    b: 1,
    key: (x, y) => `h:${y}:${x}`,
    point: (x, y, t) => ({ x: x + t, y }),
  },
  {
    edge: 1,
    a: 1,
    b: 2,
    key: (x, y) => `v:${x + 1}:${y}`,
    point: (x, y, t) => ({ x: x + 1, y: y + t }),
  },
  {
    edge: 2,
    a: 3,
    b: 2,
    key: (x, y) => `h:${y + 1}:${x}`,
    point: (x, y, t) => ({ x: x + t, y: y + 1 }),
  },
  {
    edge: 3,
    a: 0,
    b: 3,
    key: (x, y) => `v:${x}:${y}`,
    point: (x, y, t) => ({ x, y: y + t }),
  },
];

const crossesContour = (aValue, bValue) => {
  if (!Number.isFinite(aValue) || !Number.isFinite(bValue)) return false;
  if (aValue === 0 && bValue === 0) return false;
  return aValue === 0 || bValue === 0 || Math.sign(aValue) !== Math.sign(bValue);
};

const pathLength = (points) => {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.sqrt((dx * dx) + (dy * dy));
  }
  return total;
};

const buildContourPathsFromSegments = (segments, mapGeoToDisplay) => {
  if (!segments.length) return [];
  const endpointMap = new Map();
  const visited = new Array(segments.length).fill(false);

  const addEndpoint = (key, segmentIndex, end) => {
    const list = endpointMap.get(key) || [];
    list.push({ segmentIndex, end });
    endpointMap.set(key, list);
  };

  segments.forEach((segment, idx) => {
    addEndpoint(segment.a.key, idx, 'a');
    addEndpoint(segment.b.key, idx, 'b');
  });

  const findNext = (key) => {
    const list = endpointMap.get(key);
    if (!list) return null;
    return list.find((entry) => !visited[entry.segmentIndex]) || null;
  };

  const contours = [];

  segments.forEach((segment, idx) => {
    if (visited[idx]) return;
    visited[idx] = true;

    const points = [segment.a.point, segment.b.point];
    let startKey = segment.a.key;
    let endKey = segment.b.key;

    for (;;) {
      const next = findNext(endKey);
      if (!next) break;
      visited[next.segmentIndex] = true;
      const nextSegment = segments[next.segmentIndex];
      if (next.end === 'a') {
        points.push(nextSegment.b.point);
        endKey = nextSegment.b.key;
      } else {
        points.push(nextSegment.a.point);
        endKey = nextSegment.a.key;
      }
    }

    for (;;) {
      const next = findNext(startKey);
      if (!next) break;
      visited[next.segmentIndex] = true;
      const nextSegment = segments[next.segmentIndex];
      if (next.end === 'a') {
        points.unshift(nextSegment.b.point);
        startKey = nextSegment.b.key;
      } else {
        points.unshift(nextSegment.a.point);
        startKey = nextSegment.a.key;
      }
    }

    const displayPoints = points.map((point) => mapGeoToDisplay(point.x, point.y));
    const path = buildPath(displayPoints);
    if (path) {
      const length = pathLength(displayPoints);
      contours.push({
        path,
        labelPoint: displayPoints[Math.floor(displayPoints.length / 2)],
        length,
      });
    }
  });

  return contours.sort((a, b) => b.length - a.length);
};

const buildScalarContourPaths = (geoData, targetValue, bounds, readDelta, mapGeoToDisplay) => {
  const segments = [];
  const minCellX = Math.max(0, Math.floor((bounds?.minX ?? 0) - 1));
  const minCellY = Math.max(0, Math.floor((bounds?.minY ?? 0) - 1));
  const maxCellX = Math.min(GEO_GRID_SIZE - 2, Math.ceil(bounds?.maxX ?? (GEO_GRID_SIZE - 1)));
  const maxCellY = Math.min(GEO_GRID_SIZE - 2, Math.ceil(bounds?.maxY ?? (GEO_GRID_SIZE - 1)));

  for (let y = minCellY; y <= maxCellY; y += 1) {
    for (let x = minCellX; x <= maxCellX; x += 1) {
      const deltas = [
        readDelta(geoData, x, y, targetValue),
        readDelta(geoData, x + 1, y, targetValue),
        readDelta(geoData, x + 1, y + 1, targetValue),
        readDelta(geoData, x, y + 1, targetValue),
      ];

      if (deltas.some((delta) => !Number.isFinite(delta))) continue;

      const intersections = [];
      contourEdgeDefinitions.forEach((definition) => {
        const aValue = deltas[definition.a];
        const bValue = deltas[definition.b];
        if (!crossesContour(aValue, bValue)) return;
        const t = interpolateCrossing(aValue, bValue);
        intersections.push({
          edge: definition.edge,
          key: definition.key(x, y),
          point: definition.point(x, y, t),
        });
      });

      if (intersections.length < 2) continue;
      intersections.sort((a, b) => a.edge - b.edge);
      for (let idx = 0; idx + 1 < intersections.length; idx += 2) {
        if (intersections[idx].key === intersections[idx + 1].key) continue;
        segments.push({ a: intersections[idx], b: intersections[idx + 1] });
      }
    }
  }

  return buildContourPathsFromSegments(segments, mapGeoToDisplay);
};

const buildLatContourPaths = (geoData, targetLat, bounds, mapGeoToDisplay) => (
  buildScalarContourPaths(
    geoData,
    targetLat,
    bounds,
    (data, x, y, target) => {
      const lat = getGeoLat(data, x, y);
      return isValidLat(lat) ? lat - target : NaN;
    },
    mapGeoToDisplay
  )
);

const buildLonContourPaths = (geoData, targetLon, bounds, mapGeoToDisplay) => (
  buildScalarContourPaths(
    geoData,
    targetLon,
    bounds,
    (data, x, y, target) => {
      const lon = getGeoLon(data, x, y);
      if (!isValidLon(lon)) return NaN;
      const delta = angularDifferenceDeg(lon, target);
      return Number.isFinite(delta) && Math.abs(delta) <= 120 ? delta : NaN;
    },
    mapGeoToDisplay
  )
);

const isValidGeoPoint = (geoData, x, y) => (
  isValidLat(getGeoLat(geoData, x, y)) && isValidLon(getGeoLon(geoData, x, y))
);

const geoGridOverlayCache = new WeakMap();

const buildGridCacheKey = (width, height, transform) => {
  const b = transform?.imageBounds || {};
  const g = transform?.geoBounds || {};
  return [
    Math.round(width),
    Math.round(height),
    Math.round(transform?.naturalWidth || GEO_GRID_SIZE),
    Math.round(transform?.naturalHeight || GEO_GRID_SIZE),
    b.minX?.toFixed?.(2), b.minY?.toFixed?.(2), b.maxX?.toFixed?.(2), b.maxY?.toFixed?.(2),
    g.minX?.toFixed?.(2), g.minY?.toFixed?.(2), g.maxX?.toFixed?.(2), g.maxY?.toFixed?.(2),
  ].join(':');
};

const buildGeoMaskContourPaths = (geoData, bounds, mapGeoToDisplay) => {
  const segments = [];
  const minCellX = Math.max(0, Math.floor((bounds?.minX ?? 0) - 1));
  const minCellY = Math.max(0, Math.floor((bounds?.minY ?? 0) - 1));
  const maxCellX = Math.min(GEO_GRID_SIZE - 2, Math.ceil(bounds?.maxX ?? (GEO_GRID_SIZE - 1)));
  const maxCellY = Math.min(GEO_GRID_SIZE - 2, Math.ceil(bounds?.maxY ?? (GEO_GRID_SIZE - 1)));

  for (let y = minCellY; y <= maxCellY; y += 1) {
    for (let x = minCellX; x <= maxCellX; x += 1) {
      const valid = [
        isValidGeoPoint(geoData, x, y),
        isValidGeoPoint(geoData, x + 1, y),
        isValidGeoPoint(geoData, x + 1, y + 1),
        isValidGeoPoint(geoData, x, y + 1),
      ];
      if (valid.every(Boolean) || valid.every((value) => !value)) continue;

      const intersections = [];
      contourEdgeDefinitions.forEach((definition) => {
        if (valid[definition.a] === valid[definition.b]) return;
        intersections.push({
          edge: definition.edge,
          key: definition.key(x, y),
          point: definition.point(x, y, 0.5),
        });
      });

      intersections.sort((a, b) => a.edge - b.edge);
      for (let idx = 0; idx + 1 < intersections.length; idx += 2) {
        if (intersections[idx].key === intersections[idx + 1].key) continue;
        segments.push({ a: intersections[idx], b: intersections[idx + 1] });
      }
    }
  }

  return buildContourPathsFromSegments(segments, mapGeoToDisplay);
};

const ClickableImage = ({ 
  src, 
  alt, 
  onImageClick,
  onImageHover = null,
  className = '',
  style = {},
  initialPosition = null,
  multiplePositions = [],
  plotMultiple = false,
  showLatLonGrid = false,
  geoCubeData = null,
  materialOverlay = null,
  materialVisibility = [true, true, true],
}) => {
  const [clickPosition, setClickPosition] = useState(initialPosition);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [imageGeoTransform, setImageGeoTransform] = useState(null);
  const [gridOverlay, setGridOverlay] = useState(null);
  const [overlayRevision, setOverlayRevision] = useState(0);
  const [hoveredMarker, setHoveredMarker] = useState(null); // { type: 'single' } | { type: 'multiple', index }
  const [markerTooltip, setMarkerTooltip] = useState({ visible: false, x: 0, y: 0 });
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const imageContainerRef = useRef(null);
  const materialCanvasRef = useRef(null);
  const dragStateRef = useRef({ dragging: false, moved: false, startX: 0, startY: 0, panStartX: 0, panStartY: 0 });
  const clickPositionRef = useRef(clickPosition);
  const displaySrc = src;
  
  // Keep ref in sync with state
  useEffect(() => {
    clickPositionRef.current = clickPosition;
  }, [clickPosition]);

  // Update image size when it loads and recalculate position
  useEffect(() => {
    const updateImageSize = () => {
      // Use double requestAnimationFrame to ensure inner container is positioned first
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (imageRef.current && containerRef.current && imageContainerRef.current) {
            const img = imageRef.current;
            setImageSize((prev) => {
              const next = { width: img.offsetWidth || 0, height: img.offsetHeight || 0 };
              return (prev.width === next.width && prev.height === next.height) ? prev : next;
            });
            setImageGeoTransform(buildImageGeoTransform(img, geoCubeData));
            
            // Recalculate display position if we have natural coordinates
            // Now using image-relative coordinates (relative to inner container)
            if (initialPosition && initialPosition.x !== undefined && initialPosition.y !== undefined) {
              if (img.naturalWidth > 0 && img.naturalHeight > 0 && img.offsetWidth > 0 && img.offsetHeight > 0) {
                const imagePoint = mapGeoToImageNatural(initialPosition.x, initialPosition.y, buildImageGeoTransform(img, geoCubeData));
                const scaleX = img.offsetWidth / img.naturalWidth;
                const scaleY = img.offsetHeight / img.naturalHeight;
                const imageRelativeX = imagePoint.x * scaleX;
                const imageRelativeY = imagePoint.y * scaleY;
                
                setClickPosition({
                  displayX: imageRelativeX,
                  displayY: imageRelativeY,
                  naturalX: initialPosition.x,
                  naturalY: initialPosition.y,
                  imageNaturalX: imagePoint.x,
                  imageNaturalY: imagePoint.y,
                });
              }
            } else if (initialPosition && initialPosition.position) {
              // Recalculate stored position - use image-relative coordinates
              if (initialPosition.position.imageNaturalX !== undefined && initialPosition.position.imageNaturalY !== undefined) {
                const scaleX = img.offsetWidth / img.naturalWidth;
                const scaleY = img.offsetHeight / img.naturalHeight;
                const imageRelativeX = initialPosition.position.imageNaturalX * scaleX;
                const imageRelativeY = initialPosition.position.imageNaturalY * scaleY;
                
                setClickPosition({
                  displayX: imageRelativeX,
                  displayY: imageRelativeY,
                  naturalX: initialPosition.position.naturalX,
                  naturalY: initialPosition.position.naturalY,
                  imageNaturalX: initialPosition.position.imageNaturalX,
                  imageNaturalY: initialPosition.position.imageNaturalY,
                });
              } else if (initialPosition.position.displayX !== undefined && initialPosition.position.displayY !== undefined) {
                // If we have display coordinates, they should already be image-relative
                // But verify they're within bounds
                const displayX = Math.max(0, Math.min(initialPosition.position.displayX, img.offsetWidth));
                const displayY = Math.max(0, Math.min(initialPosition.position.displayY, img.offsetHeight));
                setClickPosition({
                  displayX,
                  displayY,
                  naturalX: initialPosition.position.naturalX,
                  naturalY: initialPosition.position.naturalY
                });
              } else {
                // Use the stored position object if available
                setClickPosition(initialPosition.position);
              }
            } else if (!initialPosition) {
              setClickPosition(null);
            }
          }
        });
      });
    };

    const img = imageRef.current;
    if (img) {
      if (img.complete) {
        updateImageSize();
      } else {
        img.addEventListener('load', updateImageSize);
      }
    }

    // Also recalculate on window resize if we have a position
    const handleResize = () => {
      if (imageRef.current && containerRef.current) {
        const currentPosition = clickPositionRef.current || (initialPosition?.position);
        if (currentPosition && currentPosition.naturalX !== undefined && currentPosition.naturalY !== undefined) {
          updateImageSize();
        }
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      if (img) {
        img.removeEventListener('load', updateImageSize);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, [displaySrc, initialPosition, geoCubeData]);

  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [src]);

  const materialVisKey = materialVisibility.join(',');

  useLayoutEffect(() => {
    if (!materialOverlay || !imageRef.current || !materialCanvasRef.current) return;
    const img = imageRef.current;
    const canvas = materialCanvasRef.current;
    const dw = img.offsetWidth;
    const dh = img.offsetHeight;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    if (!dw || !dh || !natW || !natH) return;

    const { width: mw, height: mh, data: map } = materialOverlay;
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(dw, dh);
    const colors = [
      [255, 90, 90],
      [90, 220, 120],
      [100, 160, 255],
    ];
    const alpha = 110;
    for (let py = 0; py < dh; py++) {
      for (let px = 0; px < dw; px++) {
        const nx = Math.floor((px + 0.5) * natW / dw);
        const ny = Math.floor((py + 0.5) * natH / dh);
        const mc = Math.min(mw - 1, Math.floor(nx * mw / natW));
        const mr = Math.min(mh - 1, Math.floor(ny * mh / natH));
        const cls = map[mr * mw + mc];
        const idx = (py * dw + px) * 4;
        if (cls >= 0 && cls <= 2 && materialVisibility[cls]) {
          const [r, g, b] = colors[cls];
          imageData.data[idx] = r;
          imageData.data[idx + 1] = g;
          imageData.data[idx + 2] = b;
          imageData.data[idx + 3] = alpha;
        } else {
          imageData.data[idx] = 0;
          imageData.data[idx + 1] = 0;
          imageData.data[idx + 2] = 0;
          imageData.data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
    canvas.style.width = `${dw}px`;
    canvas.style.height = `${dh}px`;
  }, [materialOverlay, materialVisKey, materialVisibility, displaySrc, zoom, pan, overlayRevision]);

  useEffect(() => {
    const el = imageRef.current;
    if (!el || (!materialOverlay && !showLatLonGrid)) return;
    const ro = new ResizeObserver(() => {
      setImageSize((prev) => {
        const next = { width: el.offsetWidth || 0, height: el.offsetHeight || 0 };
        return (prev.width === next.width && prev.height === next.height) ? prev : next;
      });
      setOverlayRevision((n) => n + 1);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [displaySrc, materialOverlay, showLatLonGrid]);

  const calculateCoordinates = (e) => {
    if (!imageRef.current || !imageContainerRef.current) return null;

    const img = imageRef.current;
    const imgContainer = imageContainerRef.current;
    
    // Get position relative to the inner image container
    const rect = imgContainer.getBoundingClientRect();
    const transformedX = e.clientX - rect.left;
    const transformedY = e.clientY - rect.top;
    const relativeX = (transformedX - pan.x) / zoom;
    const relativeY = (transformedY - pan.y) / zoom;
    
    // Check if position is within image container bounds
    if (relativeX >= 0 && relativeX <= img.offsetWidth && 
        relativeY >= 0 && relativeY <= img.offsetHeight) {
      
      // Calculate position in natural image coordinates
      const scaleX = img.naturalWidth / img.offsetWidth;
      const scaleY = img.naturalHeight / img.offsetHeight;
      const imageNaturalX = Math.round(relativeX * scaleX);
      const imageNaturalY = Math.round(relativeY * scaleY);
      const geoPoint = mapImageNaturalToGeo(imageNaturalX, imageNaturalY, imageGeoTransform);
      
      // Clamp coordinates to valid range (geo cubes are 681x681)
      const clampedImageX = Math.max(0, Math.min(imageNaturalX, img.naturalWidth - 1));
      const clampedImageY = Math.max(0, Math.min(imageNaturalY, img.naturalHeight - 1));
      
      // Position relative to inner container (which matches image dimensions)
      return {
        displayX: relativeX,
        displayY: relativeY,
        naturalX: geoPoint.x,
        naturalY: geoPoint.y,
        imageNaturalX: clampedImageX,
        imageNaturalY: clampedImageY,
      };
    }
    return null;
  };

  const handleImageClick = (e) => {
    if (dragStateRef.current.moved) return;
    const newPosition = calculateCoordinates(e);
    if (!newPosition) return;

    const { naturalX: clampedX, naturalY: clampedY } = newPosition;

    if (plotMultiple) {
      // In multiple mode, always call onImageClick - App.js handles the logic
      if (onImageClick) {
        onImageClick(clampedX, clampedY, newPosition);
      }
    } else {
      // Single mode: toggle marker if clicking the same position
      if (clickPosition && 
          Math.abs(clickPosition.displayX - newPosition.displayX) < 10 &&
          Math.abs(clickPosition.displayY - newPosition.displayY) < 10) {
        setClickPosition(null);
        if (onImageClick) {
          onImageClick(null, null, null);
        }
      } else {
        // Set new marker position
        setClickPosition(newPosition);
        if (onImageClick) {
          onImageClick(clampedX, clampedY, newPosition);
        }
      }
    }
  };

  const handleImageHover = (e) => {
    const newPosition = calculateCoordinates(e);
    const setHoverVisuals = () => {
      if (!newPosition || !containerRef.current) {
        setHoveredMarker(null);
        setMarkerTooltip({ visible: false, x: 0, y: 0 });
        return;
      }

      const markerHitRadiusPx = 11;
      let hovered = null;

      if (plotMultiple) {
        const idx = multiplePositions.findIndex((pos) => {
          const markerPos = pos?.position;
          if (!markerPos || !Number.isFinite(markerPos.displayX) || !Number.isFinite(markerPos.displayY)) return false;
          const dx = markerPos.displayX - newPosition.displayX;
          const dy = markerPos.displayY - newPosition.displayY;
          return ((dx * dx) + (dy * dy)) <= (markerHitRadiusPx * markerHitRadiusPx);
        });
        if (idx >= 0) hovered = { type: 'multiple', index: idx };
      } else if (clickPosition && Number.isFinite(clickPosition.displayX) && Number.isFinite(clickPosition.displayY)) {
        const dx = clickPosition.displayX - newPosition.displayX;
        const dy = clickPosition.displayY - newPosition.displayY;
        if (((dx * dx) + (dy * dy)) <= (markerHitRadiusPx * markerHitRadiusPx)) hovered = { type: 'single' };
      }

      if (!hovered) {
        setHoveredMarker(null);
        setMarkerTooltip({ visible: false, x: 0, y: 0 });
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      setHoveredMarker(hovered);
      setMarkerTooltip({
        visible: true,
        x: (e.clientX - rect.left),
        y: (e.clientY - rect.top),
      });
    };

    setHoverVisuals();

    if (onImageHover) {
      if (newPosition) {
        onImageHover(newPosition.naturalX, newPosition.naturalY, newPosition);
      } else {
        onImageHover(null, null, null);
      }
    }
  };

  const handleImageLeave = () => {
    setHoveredMarker(null);
    setMarkerTooltip({ visible: false, x: 0, y: 0 });
    if (onImageHover) {
      onImageHover(null, null, null);
    }
  };

  const clampPan = (nextPan, nextZoom = zoom) => {
    if (!imageRef.current) return nextPan;
    const img = imageRef.current;
    const maxX = Math.max(0, ((img.offsetWidth * nextZoom) - img.offsetWidth) / 2);
    const maxY = Math.max(0, ((img.offsetHeight * nextZoom) - img.offsetHeight) / 2);
    return {
      x: Math.max(-maxX, Math.min(maxX, nextPan.x)),
      y: Math.max(-maxY, Math.min(maxY, nextPan.y)),
    };
  };

  const setZoomLevel = (nextZoom) => {
    const clamped = Math.max(1, Math.min(5, nextZoom));
    setZoom(clamped);
    setPan((prev) => clampPan(prev, clamped));
  };

  const handlePointerDown = (e) => {
    dragStateRef.current = {
      dragging: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      panStartX: pan.x,
      panStartY: pan.y,
    };
  };

  const handlePointerMove = (e) => {
    if (!dragStateRef.current.dragging) return;
    const dx = e.clientX - dragStateRef.current.startX;
    const dy = e.clientY - dragStateRef.current.startY;
    if ((dx * dx) + (dy * dy) > 16) dragStateRef.current.moved = true;
    const next = clampPan({
      x: dragStateRef.current.panStartX + dx,
      y: dragStateRef.current.panStartY + dy,
    });
    setPan(next);
  };

  const handlePointerUp = () => {
    dragStateRef.current.dragging = false;
    setTimeout(() => {
      dragStateRef.current.moved = false;
    }, 0);
  };

  useEffect(() => {
    let cancelled = false;

    if (!showLatLonGrid || !geoCubeData) {
      setGridOverlay(null);
      return () => {
        cancelled = true;
      };
    }

    const width = imageSize.width;
    const height = imageSize.height;
    if (!width || !height || geoCubeData.length < GEO_BAND_SIZE * 2) {
      setGridOverlay(null);
      return () => {
        cancelled = true;
      };
    }

    const transform = imageGeoTransform || {
      imageBounds: { minX: 0, minY: 0, maxX: GEO_GRID_SIZE - 1, maxY: GEO_GRID_SIZE - 1 },
      geoBounds: { minX: 0, minY: 0, maxX: GEO_GRID_SIZE - 1, maxY: GEO_GRID_SIZE - 1 },
      naturalWidth: GEO_GRID_SIZE,
      naturalHeight: GEO_GRID_SIZE,
    };
    const cacheKey = buildGridCacheKey(width, height, transform);
    const cachedByData = geoGridOverlayCache.get(geoCubeData);
    const cached = cachedByData?.get(cacheKey);
    if (cached) {
      setGridOverlay(cached);
      return () => {
        cancelled = true;
      };
    }

    setGridOverlay(null);

    const timerId = setTimeout(() => {
      if (cancelled) return;

      const currentCacheByData = geoGridOverlayCache.get(geoCubeData);
      const currentCached = currentCacheByData?.get(cacheKey);
      if (currentCached) {
        setGridOverlay(currentCached);
        return;
      }

      const displayScaleX = width / Math.max(1, transform.naturalWidth || GEO_GRID_SIZE);
      const displayScaleY = height / Math.max(1, transform.naturalHeight || GEO_GRID_SIZE);
      const mapGeoToDisplay = (x, y) => {
        const imagePoint = mapGeoToImageNatural(x, y, transform);
        return {
          x: imagePoint.x * displayScaleX,
          y: imagePoint.y * displayScaleY,
        };
      };
      const limbBounds = transform.geoBounds || getGeoBounds(geoCubeData);

      const nextOverlay = {
        width,
        height,
        limbContours: buildGeoMaskContourPaths(geoCubeData, limbBounds, mapGeoToDisplay),
        limbEllipse: mapGeoBoundsToDisplayEllipse(limbBounds, mapGeoToDisplay),
        latContours: LAT_GRID_LINES.map((lat) => ({
          value: lat,
          contours: buildLatContourPaths(geoCubeData, lat, limbBounds, mapGeoToDisplay),
        })),
        lonContours: LON_LABEL_STEPS.map((lon) => ({
          value: lon,
          normalizedValue: normalizeLongitudeDeg(lon),
          contours: buildLonContourPaths(geoCubeData, lon, limbBounds, mapGeoToDisplay),
        })),
      };

      let cacheForData = geoGridOverlayCache.get(geoCubeData);
      if (!cacheForData) {
        cacheForData = new Map();
        geoGridOverlayCache.set(geoCubeData, cacheForData);
      }
      cacheForData.set(cacheKey, nextOverlay);

      if (!cancelled) setGridOverlay(nextOverlay);
    }, 80);

    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [showLatLonGrid, geoCubeData, imageSize.width, imageSize.height, imageGeoTransform]);

  const getWarpedMarkerStyle = (position) => {
    const safeX = Number.isFinite(position?.displayX) ? position.displayX : 0;
    const safeY = Number.isFinite(position?.displayY) ? position.displayY : 0;
    return {
      style: {
        left: `${safeX}px`,
        top: `${safeY}px`,
        transform: 'translate(-50%, -50%)',
        transformOrigin: '50% 50%',
      },
      lines: {
        a: { x1: 2, y1: 2, x2: 18, y2: 18 },
        b: { x1: 18, y1: 2, x2: 2, y2: 18 },
      },
    };
  };

  const imageVisualFitStyle = getImageVisualFit(imageGeoTransform, imageSize);

  return (
    <div 
      ref={containerRef}
      className={`clickable-image-container ${className}`}
      style={style}
      onClick={handleImageClick}
      onMouseMove={handleImageHover}
      onMouseLeave={handleImageLeave}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 40, display: 'flex', gap: '6px', pointerEvents: 'auto' }}>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setZoomLevel(zoom + 0.2); }}
          style={zoomButtonStyle}
        >
          +
        </button>
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); setZoomLevel(zoom - 0.2); }}
          style={zoomButtonStyle}
        >
          -
        </button>
      </div>
      {displaySrc && (
        <div
          ref={imageContainerRef}
          className="image-marker-container"
          style={{
            position: 'relative',
            pointerEvents: 'none',
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          <img
            ref={imageRef}
            src={displaySrc}
            alt={alt}
            className="clickable-image"
            style={{
              maxWidth: '100%',
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
              ...(imageVisualFitStyle || {}),
            }}
            onLoad={() => {
              if (imageRef.current) {
                const img = imageRef.current;
                setImageSize({ width: img.offsetWidth || 0, height: img.offsetHeight || 0 });
                setImageGeoTransform(buildImageGeoTransform(img, geoCubeData));
              }
              setOverlayRevision((n) => n + 1);
            }}
          />
          {materialOverlay && (
            <canvas
              ref={materialCanvasRef}
              width={0}
              height={0}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          )}
          {plotMultiple ? (
            // Multiple markers with different colors
            multiplePositions.map((pos, index) => {
              const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
              // Use colorIndex from position if available, otherwise fall back to array index
              const colorIndex = pos.colorIndex !== undefined ? pos.colorIndex : index;
              const color = colors[colorIndex] || 'red';
              if (pos.position) {
                const markerWarp = getWarpedMarkerStyle(pos.position);
                return (
                  <div
                    key={index}
                    className="click-marker"
                    style={{
                      ...markerWarp.style,
                      transform: `${markerWarp.style.transform} scale(${hoveredMarker?.type === 'multiple' && hoveredMarker?.index === index ? 1.18 : 1})`,
                      transition: 'transform 120ms ease',
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20">
                      <line x1={markerWarp.lines.a.x1} y1={markerWarp.lines.a.y1} x2={markerWarp.lines.a.x2} y2={markerWarp.lines.a.y2} stroke={color} strokeWidth="3" strokeLinecap="round"/>
                      <line x1={markerWarp.lines.b.x1} y1={markerWarp.lines.b.y1} x2={markerWarp.lines.b.x2} y2={markerWarp.lines.b.y2} stroke={color} strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                  </div>
                );
              }
              return null;
            })
          ) : (
            // Single marker
            clickPosition && (() => {
              const markerWarp = getWarpedMarkerStyle(clickPosition);
              return (
              <div
                className="click-marker"
                style={{
                  ...markerWarp.style,
                  transform: `${markerWarp.style.transform} scale(${hoveredMarker?.type === 'single' ? 1.18 : 1})`,
                  transition: 'transform 120ms ease',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line x1={markerWarp.lines.a.x1} y1={markerWarp.lines.a.y1} x2={markerWarp.lines.a.x2} y2={markerWarp.lines.a.y2} stroke="red" strokeWidth="3" strokeLinecap="round"/>
                  <line x1={markerWarp.lines.b.x1} y1={markerWarp.lines.b.y1} x2={markerWarp.lines.b.x2} y2={markerWarp.lines.b.y2} stroke="red" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </div>
              );
            })()
          )}
          {showLatLonGrid && gridOverlay && (
            <svg
              width={gridOverlay.width}
              height={gridOverlay.height}
              style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 12 }}
            >
              {gridOverlay.limbContours?.length > 0 ? (
                gridOverlay.limbContours.map(({ path }, idx) => (
                  <path
                    key={`limb-${idx}`}
                    d={path}
                    fill="none"
                    stroke="rgba(145,230,255,0.9)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 6px rgba(0,0,0,1))' }}
                  />
                ))
              ) : gridOverlay.limbEllipse && (
                <ellipse
                  cx={gridOverlay.limbEllipse.cx}
                  cy={gridOverlay.limbEllipse.cy}
                  rx={gridOverlay.limbEllipse.rx}
                  ry={gridOverlay.limbEllipse.ry}
                  fill="none"
                  stroke="rgba(145,230,255,0.9)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 6px rgba(0,0,0,1))' }}
                />
              )}
              {gridOverlay.latContours.map(({ value, contours }) => {
                const labelPoint = contours[0]?.labelPoint;
                return (
                  <g key={`lat-${value}`}>
                    {contours.map(({ path }, idx) => (
                      <path
                        key={`lat-${value}-${idx}`}
                        d={path}
                        fill="none"
                        stroke="rgba(145,230,255,0.82)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 6px rgba(0,0,0,1))' }}
                      />
                    ))}
                    {labelPoint && (
                      <text
                        x={Math.max(6, Math.min(gridOverlay.width - 32, labelPoint.x + 4))}
                        y={Math.max(12, Math.min(gridOverlay.height - 6, labelPoint.y - 4))}
                        fill="#9de7ff"
                        fontSize="16"
                        fontWeight="900"
                        stroke="rgba(0,0,0,0.9)"
                        strokeWidth="3"
                        paintOrder="stroke fill"
                        style={{ textShadow: '0 0 2px rgba(0,0,0,1), 0 0 7px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.95)' }}
                      >
                        {`${value}°`}
                      </text>
                    )}
                  </g>
                );
              })}
              {gridOverlay.lonContours.map(({ value, normalizedValue, contours }) => {
                const labelPoint = contours[0]?.labelPoint;
                return (
                  <g key={`lon-${normalizedValue}`}>
                    {contours.map(({ path }, idx) => (
                      <path
                        key={`lon-${normalizedValue}-${idx}`}
                        d={path}
                        fill="none"
                        stroke="rgba(145,230,255,0.82)"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 6px rgba(0,0,0,1))' }}
                      />
                    ))}
                    {labelPoint && (
                      <text
                        x={Math.max(6, Math.min(gridOverlay.width - 42, labelPoint.x - 10))}
                        y={Math.max(12, Math.min(gridOverlay.height - 6, labelPoint.y - 6))}
                        fill="#9de7ff"
                        fontSize="16"
                        fontWeight="900"
                        stroke="rgba(0,0,0,0.9)"
                        strokeWidth="3"
                        paintOrder="stroke fill"
                        style={{ textShadow: '0 0 2px rgba(0,0,0,1), 0 0 7px rgba(0,0,0,1), 0 0 12px rgba(0,0,0,0.95)' }}
                      >
                        {`${value}°`}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      )}
      {markerTooltip.visible && (
        <div
          style={{
            position: 'absolute',
            left: markerTooltip.x,
            top: markerTooltip.y,
            transform: 'translate(-50%, -135%)',
            pointerEvents: 'none',
            backgroundColor: 'rgba(12, 12, 12, 0.92)',
            color: '#ffb3b3',
            border: '1px solid rgba(255, 90, 90, 0.9)',
            borderRadius: '6px',
            padding: '4px 8px',
            fontSize: '12px',
            fontWeight: 600,
            whiteSpace: 'nowrap',
            zIndex: 35,
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.45)',
          }}
        >
          Click to remove
        </div>
      )}
    </div>
  );
};

const zoomButtonStyle = {
  width: '28px',
  height: '28px',
  borderRadius: '4px',
  border: '1px solid #66ccff',
  background: '#101820',
  color: '#e9f8ff',
  fontSize: '18px',
  lineHeight: '24px',
  cursor: 'pointer',
  pointerEvents: 'auto',
};

export default ClickableImage;


