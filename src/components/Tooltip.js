import React, { useState, useRef, useEffect } from 'react';
import './Tooltip.css';

/**
 * Tooltip component that highlights text on hover and shows a contextual tooltip
 * The tooltip automatically positions itself to avoid viewport cutoff
 * @param {string} variant - 'blue' (default) or 'green' for different border colors
 */
const Tooltip = ({ children, content, className = '', variant = 'blue' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (isVisible && tooltipRef.current && triggerRef.current) {
      // Use requestAnimationFrame to ensure DOM is fully rendered
      requestAnimationFrame(() => {
        if (!tooltipRef.current || !triggerRef.current) return;
        
        const tooltip = tooltipRef.current;
        const trigger = triggerRef.current;
        const rect = trigger.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 10;
        
        // Default position: below the trigger, centered
        let top = rect.bottom + 8;
        let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
        
        // Check if tooltip would be cut off at the bottom
        if (top + tooltipRect.height > viewportHeight - padding) {
          // Position above instead
          top = rect.top - tooltipRect.height - 8;
        }
        
        // Check if tooltip would be cut off on the right
        if (left + tooltipRect.width > viewportWidth - padding) {
          left = viewportWidth - tooltipRect.width - padding;
        }
        
        // Check if tooltip would be cut off on the left
        if (left < padding) {
          left = padding;
        }
        
        // If still cut off at top, try positioning to the side
        if (top < padding) {
          // Try positioning to the right first
          left = rect.right + 8;
          top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
          
          // If cut off on right, position to the left
          if (left + tooltipRect.width > viewportWidth - padding) {
            left = rect.left - tooltipRect.width - 8;
          }
          
          // Ensure it's not cut off on the left
          if (left < padding) {
            left = padding;
          }
          
          // Ensure it's not cut off at the top or bottom
          if (top < padding) {
            top = padding;
          } else if (top + tooltipRect.height > viewportHeight - padding) {
            top = viewportHeight - tooltipRect.height - padding;
          }
        }
        
        setPosition({ top, left });
      });
    }
  }, [isVisible]);

  const handleMouseEnter = () => {
    setIsVisible(true);
  };

  const handleMouseLeave = () => {
    setIsVisible(false);
  };

  return (
    <span
      ref={triggerRef}
      className={`tooltip-trigger tooltip-trigger-${variant} ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {isVisible && content && (
        <div
          ref={tooltipRef}
          className={`tooltip-content tooltip-${variant}`}
          style={{
            position: 'fixed',
            top: `${position.top}px`,
            left: `${position.left}px`,
            zIndex: 10000,
          }}
        >
          {content}
        </div>
      )}
    </span>
  );
};

export default Tooltip;

