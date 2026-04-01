import React, { useState, useEffect, useCallback } from 'react';
import soderblomLogo from '../assets/soderblom_lab.png';
import dragonflyLogo from '../assets/dragonfly_mission.png';
import nasaLogo from '../assets/nasa.png';
import ssiLogo from '../assets/SSI_Logo.png';
import './SplashOverlay.css';

const SESSION_STORAGE_KEY = 'titan_rt_splash_shown';
const DEBUG_DISPLAY_TIME = 5000; // 5 seconds for debugging
const FADE_OUT_DURATION = 3000; // 3 seconds for fade animation

function SplashOverlay({ onReady }) {
  const [isVisible, setIsVisible] = useState(false);
  const [isFading, setIsFading] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);
  const [imagesLoaded, setImagesLoaded] = useState(false);
  const [loadingDots, setLoadingDots] = useState('.');
  const startTimeRef = React.useRef(null);
  const fadeTimeoutRef = React.useRef(null);
  const dismissTimeoutRef = React.useRef(null);
  const overlayRef = React.useRef(null);
  const readyCallbackRef = React.useRef(onReady);

  // Handle dismiss logic
  const handleDismiss = useCallback((immediate = false) => {
    // Clear any pending dismiss timeout
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }

    // Mark as shown in sessionStorage
    sessionStorage.setItem(SESSION_STORAGE_KEY, 'true');

    if (immediate) {
      setIsFading(false);
      setShouldRender(false);
      return;
    }

    // Use setTimeout to ensure the base state is rendered first
    setTimeout(() => {
      // Start fade out - set the fading state
      setIsFading(true);

      // Also directly manipulate the DOM to ensure transition triggers
      if (overlayRef.current) {
        // Force a reflow
        void overlayRef.current.offsetHeight;
        // Add the class
        overlayRef.current.classList.add('splash-overlay-fading');
      }

      // After fade animation completes, remove from DOM
      fadeTimeoutRef.current = setTimeout(() => {
        setShouldRender(false);
      }, FADE_OUT_DURATION);
    }, 10);
  }, []);

  // Check if splash has been shown in this session
  useEffect(() => {
    const hasBeenShown = sessionStorage.getItem(SESSION_STORAGE_KEY) === 'true';
    
    if (hasBeenShown) {
      // Already shown, notify parent immediately that we're ready
      if (readyCallbackRef.current) {
        readyCallbackRef.current();
      }
      return;
    }

    // Preload all images before showing splash
    const preloadImages = () => {
      const imageUrls = [soderblomLogo, dragonflyLogo, nasaLogo, ssiLogo];
      const imagePromises = imageUrls.map((url) => {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
      });

      Promise.all(imagePromises)
        .then(() => {
          setImagesLoaded(true);
        })
        .catch((error) => {
          console.error('Error preloading images:', error);
          // Still show splash even if images fail to load
          setImagesLoaded(true);
        });
    };

    preloadImages();
  }, []);

  // Update callback ref when onReady changes
  useEffect(() => {
    readyCallbackRef.current = onReady;
  }, [onReady]);

  // Show splash once images are loaded (only if not shown before)
  useEffect(() => {
    const hasBeenShown = sessionStorage.getItem(SESSION_STORAGE_KEY) === 'true';
    if (hasBeenShown || !imagesLoaded) return;

    setShouldRender(true);
    setIsVisible(true);
    startTimeRef.current = Date.now();
    
    // Notify parent that splash is ready (rendered and visible)
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (readyCallbackRef.current) {
          readyCallbackRef.current();
        }
      });
    });
    
    // Auto-dismiss after 3 seconds
    dismissTimeoutRef.current = setTimeout(() => {
      handleDismiss();
    }, DEBUG_DISPLAY_TIME);
    
    return () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, [imagesLoaded, handleDismiss]);

  // Ensure fade animation triggers when isFading changes
  useEffect(() => {
    if (isFading && overlayRef.current) {
      // Small delay to ensure the base class is applied first
      setTimeout(() => {
        // Force a reflow to ensure transition triggers
        void overlayRef.current.offsetHeight;
        // Add the class directly to ensure it's applied
        overlayRef.current.classList.add('splash-overlay-fading');
      }, 0);
    }
  }, [isFading]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
      }
    };
  }, []);

  // Handle click to dismiss
  const handleClick = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    handleDismiss(true);
  }, [handleDismiss]);

  // Handle keyboard dismiss (Enter, Escape, Space)
  useEffect(() => {
    if (!shouldRender || !isVisible) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === ' ') {
        e.preventDefault();
        handleDismiss(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [shouldRender, isVisible, handleDismiss]);

  // Prevent scrolling and interaction while visible
  useEffect(() => {
    if (shouldRender && isVisible) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = '';
      };
    }
  }, [shouldRender, isVisible]);

  // Animated loading label: Loading... -> Loading.. -> Loading.
  useEffect(() => {
    if (!shouldRender || !isVisible) return undefined;
    const dots = ['.', '..', '...', '..'];
    let idx = 0;
    const tick = setInterval(() => {
      idx = (idx + 1) % dots.length;
      setLoadingDots(dots[idx]);
    }, 520);
    return () => clearInterval(tick);
  }, [shouldRender, isVisible]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      ref={overlayRef}
      className={`splash-overlay ${isFading ? 'splash-overlay-fading' : ''}`}
      onClick={handleClick}
      role="dialog"
      aria-label="Loading splash screen"
      aria-live="polite"
    >
      <div className="splash-content">
        <div className="splash-logos">
          <img
            src={soderblomLogo}
            alt="Soderblom Lab"
            className="splash-logo splash-logo-left"
          />
          <img
            src={dragonflyLogo}
            alt="Dragonfly Mission"
            className="splash-logo splash-logo-middle"
          />
          <img
            src={nasaLogo}
            alt="NASA"
            className="splash-logo splash-logo-right"
          />
          <img
            src={ssiLogo}
            alt="Spectral Sciences, Inc."
            className="splash-logo splash-logo-far-right"
          />
        </div>
        <div className="splash-loading-wrap" aria-label="Loading progress">
          <div className="splash-loading-text">{`Loading${loadingDots}`}</div>
          <div className="splash-progress-track">
            <div className="splash-progress-fill" />
          </div>
        </div>
        <div className="splash-clarifier">
          <span>Developed by the Soderblom Lab at MIT for education and outreach.</span>
          <span>Built to support NASA's Dragonfly mission.</span>
        </div>
        <div className="splash-skip-hint">
          Click anywhere or press Enter/Escape/Space to skip
        </div>
      </div>
    </div>
  );
}

export default SplashOverlay;
