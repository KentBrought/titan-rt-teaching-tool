import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import './ClickableImage.css';

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
  phaseAngleDeg = 0,
  materialOverlay = null,
  materialVisibility = [true, true, true],
}) => {
  const [clickPosition, setClickPosition] = useState(initialPosition);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [overlayRevision, setOverlayRevision] = useState(0);
  const [hoveredMarker, setHoveredMarker] = useState(null); // { type: 'single' } | { type: 'multiple', index }
  const [markerTooltip, setMarkerTooltip] = useState({ visible: false, x: 0, y: 0 });
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const imageContainerRef = useRef(null);
  const materialCanvasRef = useRef(null);
  const dragStateRef = useRef({ dragging: false, moved: false, startX: 0, startY: 0, panStartX: 0, panStartY: 0 });
  const clickPositionRef = useRef(clickPosition);
  
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
            
            // Recalculate display position if we have natural coordinates
            // Now using image-relative coordinates (relative to inner container)
            if (initialPosition && initialPosition.x !== undefined && initialPosition.y !== undefined) {
              if (img.naturalWidth > 0 && img.naturalHeight > 0 && img.offsetWidth > 0 && img.offsetHeight > 0) {
                // Convert natural coordinates to image-relative display coordinates
                const scaleX = img.offsetWidth / img.naturalWidth;
                const scaleY = img.offsetHeight / img.naturalHeight;
                const imageRelativeX = initialPosition.x * scaleX;
                const imageRelativeY = initialPosition.y * scaleY;
                
                setClickPosition({
                  displayX: imageRelativeX,
                  displayY: imageRelativeY,
                  naturalX: initialPosition.x,
                  naturalY: initialPosition.y
                });
              }
            } else if (initialPosition && initialPosition.position) {
              // Recalculate stored position - use image-relative coordinates
              if (initialPosition.position.naturalX !== undefined && initialPosition.position.naturalY !== undefined) {
                const scaleX = img.offsetWidth / img.naturalWidth;
                const scaleY = img.offsetHeight / img.naturalHeight;
                const imageRelativeX = initialPosition.position.naturalX * scaleX;
                const imageRelativeY = initialPosition.position.naturalY * scaleY;
                
                setClickPosition({
                  displayX: imageRelativeX,
                  displayY: imageRelativeY,
                  naturalX: initialPosition.position.naturalX,
                  naturalY: initialPosition.position.naturalY
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
  }, [src, initialPosition]);

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
  }, [materialOverlay, materialVisKey, src, zoom, pan, overlayRevision]);

  useEffect(() => {
    const el = imageRef.current;
    if (!el || !materialOverlay) return;
    const ro = new ResizeObserver(() => setOverlayRevision((n) => n + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [src, materialOverlay]);

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
      const naturalX = Math.round(relativeX * scaleX);
      const naturalY = Math.round(relativeY * scaleY);
      
      // Clamp coordinates to valid range (geo cubes are 681x681)
      const clampedX = Math.max(0, Math.min(naturalX, img.naturalWidth - 1));
      const clampedY = Math.max(0, Math.min(naturalY, img.naturalHeight - 1));
      
      // Position relative to inner container (which matches image dimensions)
      return {
        displayX: relativeX,
        displayY: relativeY,
        naturalX: clampedX,
        naturalY: clampedY
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

  const latLines = [-60, -30, 0, 30, 60];
  const lonLabelSteps = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
  const normalizeLongitudeDeg = (lonDeg) => ((((lonDeg + 180) % 360) + 360) % 360) - 180;
  const phaseWrapped = ((((phaseAngleDeg % 360) + 360) % 360));
  const lonLines = lonLabelSteps.map((labelDeg) => normalizeLongitudeDeg(labelDeg));
  const getProjectedPoint = (latDeg, lonDeg, radius, cx, cy) => {
    const lat = (latDeg * Math.PI) / 180;
    const lonShifted = normalizeLongitudeDeg(lonDeg + 180 - phaseWrapped);
    const lon = (lonShifted * Math.PI) / 180;
    const visible = (Math.cos(lat) * Math.cos(lon)) >= 0;
    if (!visible) return null;
    const x = cx + (radius * Math.cos(lat) * Math.sin(lon));
    const y = cy - (radius * Math.sin(lat));
    return { x, y };
  };
  const buildPath = (points) => {
    if (!points || points.length === 0) return '';
    return points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  };
  const buildLatPath = (latDeg, radius, cx, cy) => {
    const points = [];
    for (let lon = -180; lon <= 180; lon += 3) {
      const p = getProjectedPoint(latDeg, lon, radius, cx, cy);
      if (p) points.push(p);
    }
    return buildPath(points);
  };
  const buildLonPath = (lonDeg, radius, cx, cy) => {
    const points = [];
    for (let lat = -90; lat <= 90; lat += 2) {
      const p = getProjectedPoint(lat, lonDeg, radius, cx, cy);
      if (p) points.push(p);
    }
    return buildPath(points);
  };

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
      {src && (
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
            src={src}
            alt={alt}
            className="clickable-image"
            style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain', display: 'block' }}
            onLoad={() => setOverlayRevision((n) => n + 1)}
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
          {showLatLonGrid && imageRef.current && (
            <svg
              width={imageRef.current.offsetWidth}
              height={imageRef.current.offsetHeight}
              style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', zIndex: 12 }}
            >
              {(() => {
                const w = imageRef.current.offsetWidth;
                const h = imageRef.current.offsetHeight;
                // Slightly larger so the overlay reaches the full dark disk.
                const r = Math.min(w, h) * 0.380;
                const cx = w * 0.5;
                const cy = h * 0.5;
                return (
                  <>
                    {latLines.map((lat) => {
                      const path = buildLatPath(lat, r, cx, cy);
                      const latLabelPoint = getProjectedPoint(lat, -90, r, cx, cy);
                      return (
                        <g key={`lat-${lat}`}>
                          {path && (
                            <path
                              d={path}
                              fill="none"
                              stroke="rgba(120,220,255,0.45)"
                              strokeWidth="1"
                              style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 5px rgba(0,0,0,1))' }}
                            />
                          )}
                          {latLabelPoint && (
                            <text
                              x={6}
                              y={latLabelPoint.y + 4}
                              fill="#9de7ff"
                              fontSize="11"
                              style={{ textShadow: '0 0 2px rgba(0,0,0,1), 0 0 6px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.95)' }}
                            >
                              {`${lat}\u00B0`}
                            </text>
                          )}
                        </g>
                      );
                    })}
                    {lonLines.map((lon, idx) => {
                      const path = buildLonPath(lon, r, cx, cy);
                      const labelPoint = getProjectedPoint(0, lon, r, cx, cy);
                      const lonLabel = lonLabelSteps[idx];
                      return (
                        <g key={`lon-${lon}`}>
                          {path && (
                            <path
                              d={path}
                              fill="none"
                              stroke="rgba(120,220,255,0.45)"
                              strokeWidth="1"
                              style={{ filter: 'drop-shadow(0 0 2px rgba(0,0,0,1)) drop-shadow(0 0 5px rgba(0,0,0,1))' }}
                            />
                          )}
                          {labelPoint && (
                            <text
                              x={labelPoint.x - 10}
                              y={labelPoint.y - 6}
                              fill="#9de7ff"
                              fontSize="11"
                              style={{ textShadow: '0 0 2px rgba(0,0,0,1), 0 0 6px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.95)' }}
                            >
                              {`${lonLabel}\u00B0`}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </>
                );
              })()}
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


