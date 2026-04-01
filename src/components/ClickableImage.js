import React, { useState, useRef, useEffect } from 'react';
import './ClickableImage.css';

/**
 * ClickableImage component that displays an image with click functionality
 * Shows a red X marker at clicked position until clicked again
 */
const ClickableImage = ({ 
  src, 
  alt, 
  onImageClick,
  onImageHover = null, // Callback for hover events: (x, y, position) => void
  className = '',
  style = {},
  initialPosition = null, // Allow external control of position
  multiplePositions = [], // Array of positions for multiple mode
  plotMultiple = false, // Whether in multiple mode
  showLatLonGrid = false,
  phaseAngleDeg = 0,
}) => {
  const [clickPosition, setClickPosition] = useState(initialPosition);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const imageContainerRef = useRef(null);
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

  // No longer need to position the inner container absolutely
  // It will stay in the normal flow and size to the image

  // Helper function to calculate coordinates from mouse event
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
    if (!onImageHover) return;
    const newPosition = calculateCoordinates(e);
    if (newPosition) {
      onImageHover(newPosition.naturalX, newPosition.naturalY, newPosition);
    } else {
      onImageHover(null, null, null);
    }
  };

  const handleImageLeave = () => {
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
  const lonLines = [-180, -150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150, 180];
  const getProjectedPoint = (latDeg, lonDeg, radius, cx, cy) => {
    const lat = (latDeg * Math.PI) / 180;
    const phaseWrapped = ((((phaseAngleDeg % 360) + 360) % 360));
    const lonShifted = ((((lonDeg + 180 - phaseWrapped) + 540) % 360) - 180);
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
            marginTop: '40px',
          }}
        >
          <img
            ref={imageRef}
            src={src}
            alt={alt}
            className="clickable-image"
            style={{ maxWidth: '100%', height: 'auto', objectFit: 'contain', display: 'block' }}
          />
          {plotMultiple ? (
            // Multiple markers with different colors
            multiplePositions.map((pos, index) => {
              const colors = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
              // Use colorIndex from position if available, otherwise fall back to array index
              const colorIndex = pos.colorIndex !== undefined ? pos.colorIndex : index;
              const color = colors[colorIndex] || 'red';
              if (pos.position) {
                return (
                  <div
                    key={index}
                    className="click-marker"
                    style={{
                      left: `${pos.position.displayX}px`,
                      top: `${pos.position.displayY}px`
                    }}
                  >
                    <svg width="20" height="20" viewBox="0 0 20 20">
                      <line x1="2" y1="2" x2="18" y2="18" stroke={color} strokeWidth="3" strokeLinecap="round"/>
                      <line x1="18" y1="2" x2="2" y2="18" stroke={color} strokeWidth="3" strokeLinecap="round"/>
                    </svg>
                  </div>
                );
              }
              return null;
            })
          ) : (
            // Single marker
            clickPosition && (
              <div
                className="click-marker"
                style={{
                  left: `${clickPosition.displayX}px`,
                  top: `${clickPosition.displayY}px`
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <line x1="2" y1="2" x2="18" y2="18" stroke="red" strokeWidth="3" strokeLinecap="round"/>
                  <line x1="18" y1="2" x2="2" y2="18" stroke="red" strokeWidth="3" strokeLinecap="round"/>
                </svg>
              </div>
            )
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
                const r = Math.min(w, h) * 0.36;
                const cx = w * 0.5;
                const cy = h * 0.5;
                return (
                  <>
                    {latLines.map((lat) => {
                      const path = buildLatPath(lat, r, cx, cy);
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
                          <text
                            x="6"
                            y={cy - (r * Math.sin((lat * Math.PI) / 180)) - 4}
                            fill="#9de7ff"
                            fontSize="11"
                            style={{ textShadow: '0 0 2px rgba(0,0,0,1), 0 0 6px rgba(0,0,0,1), 0 0 10px rgba(0,0,0,0.95)' }}
                          >
                            {`${lat}\u00B0`}
                          </text>
                        </g>
                      );
                    })}
                    {lonLines.map((lon) => {
                      const path = buildLonPath(lon, r, cx, cy);
                      const topPoint = getProjectedPoint(70, lon, r, cx, cy);
                      const lonLabel = lon === -180 ? 180 : lon;
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
                          {topPoint && (
                            <text
                              x={topPoint.x + 3}
                              y={topPoint.y - 6}
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


