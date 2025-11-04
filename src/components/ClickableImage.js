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
  initialPosition = null // Allow external control of position
}) => {
  const [clickPosition, setClickPosition] = useState(initialPosition);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const imageRef = useRef(null);
  const containerRef = useRef(null);

  // Update image size when it loads and recalculate position
  useEffect(() => {
    const updateImageSize = () => {
      if (imageRef.current) {
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
        if (initialPosition && initialPosition.x !== undefined && initialPosition.y !== undefined) {
          if (img.naturalWidth > 0 && img.naturalHeight > 0 && img.offsetWidth > 0 && img.offsetHeight > 0) {
            const scaleX = img.offsetWidth / img.naturalWidth;
            const scaleY = img.offsetHeight / img.naturalHeight;
            const displayX = initialPosition.x * scaleX;
            const displayY = initialPosition.y * scaleY;
            setClickPosition({
              displayX,
              displayY,
              naturalX: initialPosition.x,
              naturalY: initialPosition.y
            });
          }
        } else if (initialPosition && initialPosition.position) {
          // Use the stored position object if available
          setClickPosition(initialPosition.position);
        } else if (!initialPosition) {
          setClickPosition(null);
        }
      }
    };

    const img = imageRef.current;
    if (img) {
      if (img.complete) {
        updateImageSize();
      } else {
        img.addEventListener('load', updateImageSize);
        return () => img.removeEventListener('load', updateImageSize);
      }
    }
  }, [src, initialPosition]);

  const handleImageClick = (e) => {
    if (!imageRef.current || !containerRef.current) return;

    const img = imageRef.current;
    const container = containerRef.current;
    
    // Get click position relative to the container
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    
    // Get image position within container (centered)
    const imgRect = img.getBoundingClientRect();
    const imgLeft = imgRect.left - rect.left;
    const imgTop = imgRect.top - rect.top;
    
    // Calculate click position relative to image
    const relativeX = clickX - imgLeft;
    const relativeY = clickY - imgTop;
    
    // Check if click is within image bounds
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
      
      // Toggle marker: if clicking the same position, remove it
      if (clickPosition && 
          Math.abs(clickPosition.displayX - relativeX) < 10 &&
          Math.abs(clickPosition.displayY - relativeY) < 10) {
        setClickPosition(null);
        if (onImageClick) {
          onImageClick(null, null, null);
        }
      } else {
        // Set new marker position
        const newPosition = {
          displayX: relativeX,
          displayY: relativeY,
          naturalX: clampedX,
          naturalY: clampedY
        };
        setClickPosition(newPosition);
        if (onImageClick) {
          onImageClick(clampedX, clampedY, newPosition);
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
        <img
          ref={imageRef}
          src={src}
          alt={alt}
          className="clickable-image"
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      )}
      {clickPosition && (
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
      )}
    </div>
  );
};

export default ClickableImage;

