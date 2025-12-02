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
  className = '',
  style = {},
  initialPosition = null, // Allow external control of position
  multiplePositions = [], // Array of positions for multiple mode
  plotMultiple = false // Whether in multiple mode
}) => {
  const [clickPosition, setClickPosition] = useState(initialPosition);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const imageRef = useRef(null);
  const containerRef = useRef(null);
  const imageContainerRef = useRef(null);
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
            
            setImageSize({
              width: img.offsetWidth,
              height: img.offsetHeight
            });
            setNaturalSize({
              width: img.naturalWidth,
              height: img.naturalHeight
            });

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

  // No longer need to position the inner container absolutely
  // It will stay in the normal flow and size to the image

  const handleImageClick = (e) => {
    if (!imageRef.current || !imageContainerRef.current) return;

    const img = imageRef.current;
    const imgContainer = imageContainerRef.current;
    
    // Get click position relative to the inner image container
    const rect = imgContainer.getBoundingClientRect();
    const relativeX = e.clientX - rect.left;
    const relativeY = e.clientY - rect.top;
    
    // Check if click is within image container bounds (which matches image size in normal flow)
    if (relativeX >= 0 && relativeX <= rect.width && 
        relativeY >= 0 && relativeY <= rect.height) {
      
      // Calculate position in natural image coordinates
      const scaleX = img.naturalWidth / img.offsetWidth;
      const scaleY = img.naturalHeight / img.offsetHeight;
      const naturalX = Math.round(relativeX * scaleX);
      const naturalY = Math.round(relativeY * scaleY);
      
      // Clamp coordinates to valid range (geo cubes are 681x681)
      const clampedX = Math.max(0, Math.min(naturalX, img.naturalWidth - 1));
      const clampedY = Math.max(0, Math.min(naturalY, img.naturalHeight - 1));
      
      // Position relative to inner container (which matches image dimensions)
      const newPosition = {
        displayX: relativeX,
        displayY: relativeY,
        naturalX: clampedX,
        naturalY: clampedY
      };

      if (plotMultiple) {
        // In multiple mode, always call onImageClick - App.js handles the logic
        if (onImageClick) {
          onImageClick(clampedX, clampedY, newPosition);
        }
      } else {
        // Single mode: toggle marker if clicking the same position
        if (clickPosition && 
            Math.abs(clickPosition.displayX - relativeX) < 10 &&
            Math.abs(clickPosition.displayY - relativeY) < 10) {
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
    }
  };

  return (
    <div 
      ref={containerRef}
      className={`clickable-image-container ${className}`}
      style={style}
      onClick={handleImageClick}
    >
      {src && (
        <div
          ref={imageContainerRef}
          className="image-marker-container"
          style={{ position: 'relative', pointerEvents: 'none' }}
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
              const color = colors[index] || 'red';
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
        </div>
      )}
    </div>
  );
};

export default ClickableImage;


