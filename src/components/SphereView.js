import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getImageUrl } from '../utils/imageLoader';
import { buildEquirectangularTextureCanvasFromTwoHalves } from '../utils/sphereTexture';
import { buildWeightedPhaseGlobeTextureAllPhases } from '../utils/weightedGlobeTexture';

/** Phase angle 180° opposite for the far hemisphere (wrapped 0–360). */
const oppositePhase = (phase) => ((phase + 180) % 360);

/**
 * SphereView: full 3D sphere with front hemisphere = current phase,
 * back hemisphere = 180° opposite phase; or weighted phase view (lat/lon placement, limb downweight).
 * Uses raw Three.js (no R3F).
 */
function SphereView({ phaseAngle = 40, compositeType = '5_2_1.3', viewMode = 'default', onCoverage, onProgress }) {
  const containerRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [buildProgress, setBuildProgress] = useState(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const animationIdRef = useRef(null);
  const textureRef = useRef(null);
  const cameraRef = useRef(null);
  const resizeCleanupRef = useRef(null);

  const frontImageUrl = useMemo(
    () => getImageUrl(phaseAngle, compositeType),
    [phaseAngle, compositeType]
  );
  const backImageUrl = useMemo(
    () => getImageUrl(oppositePhase(phaseAngle), compositeType),
    [phaseAngle, compositeType]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      setError('Container ref not set');
      return;
    }

    let cancelled = false;
    let scene, camera, renderer, controls, geometry, material;

    // Defer so layout is complete (ref is attached, parent has dimensions)
    let rafId = requestAnimationFrame(function initThree() {
      if (cancelled) return;
      const cont = containerRef.current;
      if (!cont) return;

    function doResize() {
      if (!cont || !camera || !renderer) return;
      const cw = cont.clientWidth;
      const ch = cont.clientHeight;
      if (cw > 0 && ch > 0) {
        camera.aspect = cw / ch;
        camera.updateProjectionMatrix();
        renderer.setSize(cw, ch);
      }
    }

    function onResize() {
      doResize();
    }

    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a0f);
      sceneRef.current = scene;

      const w = Math.max(1, cont.clientWidth || 1);
      const h = Math.max(1, cont.clientHeight || 1);
      camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
      camera.position.set(0, 0, 2.5);
      scene.add(camera);
      cameraRef.current = camera;

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      cont.appendChild(renderer.domElement);
      rendererRef.current = renderer;

      controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.minDistance = 1.5;
      controls.maxDistance = 5;
      controlsRef.current = controls;

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);
      const dirLight = new THREE.DirectionalLight(0xffffff, 1);
      dirLight.position.set(5, 5, 5);
      scene.add(dirLight);

      geometry = new THREE.SphereGeometry(1, 64, 64);
      material = new THREE.MeshStandardMaterial({
        roughness: 0.9,
        metalness: 0.05,
        side: THREE.FrontSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);

      function animate() {
        if (cancelled) return;
        animationIdRef.current = requestAnimationFrame(animate);
        if (controls && renderer && scene && camera) {
          controls.update();
          renderer.render(scene, camera);
        }
      }
      animate();

      window.addEventListener('resize', onResize);
      resizeCleanupRef.current = () => window.removeEventListener('resize', onResize);

      const buildTexture =
        viewMode === 'weightedPhase'
          ? buildWeightedPhaseGlobeTextureAllPhases(compositeType, {
              onProgress: (current, total, phaseAngleDeg) => {
                setBuildProgress((p) => (p ? { ...p, current, total, phaseAngle: phaseAngleDeg } : { current, total, phaseAngle: phaseAngleDeg }));
                if (typeof onProgress === 'function') onProgress({ current, total, phaseAngle: phaseAngleDeg });
              },
            }).then(({ canvas, coverage }) => {
              if (typeof onCoverage === 'function') onCoverage(coverage);
              return canvas;
            })
          : buildEquirectangularTextureCanvasFromTwoHalves(frontImageUrl, backImageUrl);

      buildTexture
        .then((canvas) => {
          if (cancelled) return;
          if (textureRef.current) textureRef.current.dispose();
          const tex = new THREE.CanvasTexture(canvas);
          tex.wrapS = THREE.ClampToEdgeWrapping;
          tex.wrapT = THREE.ClampToEdgeWrapping;
          textureRef.current = tex;
          material.map = tex;
          material.needsUpdate = true;
        })
        .catch((err) => {
          if (!cancelled) setError(err.message || 'Failed to load texture');
        })
        .finally(() => {
          if (!cancelled) {
            setBuildProgress(null);
            setLoading(false);
            requestAnimationFrame(doResize);
          }
        });
    } catch (err) {
      setError(err?.message || String(err) || 'Three.js init failed');
      setLoading(false);
    }

    }); // end requestAnimationFrame

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (controls) controls.dispose();
      if (renderer) {
        renderer.dispose();
        const parent = renderer.domElement && renderer.domElement.parentNode;
        if (parent) parent.removeChild(renderer.domElement);
      }
      if (geometry) geometry.dispose();
      if (material) material.dispose();
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
      sceneRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
    };
  }, [viewMode, phaseAngle, compositeType, frontImageUrl, backImageUrl, onCoverage, onProgress]);

  if (error) {
    return (
      <div className="sphere-view-container" style={containerStyle}>
        <div style={errorStyle}>
          <p>Failed to load sphere texture</p>
          <p style={{ fontSize: '14px', color: '#999' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sphere-view-container" style={containerStyle} data-sphere-view="root">
      <div
        ref={containerRef}
        data-sphere-container="true"
        style={{
          width: '100%',
          height: '100%',
          position: 'absolute',
          inset: 0,
        }}
      />
      {loading && (
        <div style={loadingOverlayStyle}>
          <div className="loading-spinner" />
          <p>
            {viewMode === 'weightedPhase' && buildProgress
              ? `Building from all phases: ${buildProgress.current}/${buildProgress.total} (${buildProgress.phaseAngle}°)`
              : 'Loading texture...'}
          </p>
        </div>
      )}
    </div>
  );
}

const containerStyle = {
  width: '100%',
  height: '100%',
  minHeight: '400px',
  position: 'relative',
  backgroundColor: '#0a0a0f',
  borderRadius: '8px',
  overflow: 'hidden',
};

const loadingOverlayStyle = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#0a0a0f',
  color: '#e0e0e0',
  zIndex: 1,
};

const errorStyle = {
  padding: '2rem',
  textAlign: 'center',
  color: '#ff6b6b',
};

export default SphereView;
