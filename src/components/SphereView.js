import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { getImageUrl } from '../utils/imageLoader';
import { buildEquirectangularTextureCanvasFromTwoHalves } from '../utils/sphereTexture';
import { buildWeightedPhaseGlobeTextureAllPhases } from '../utils/weightedGlobeTexture';
import { loadHeightMap } from '../utils/heightMapLoader';

const oppositePhase = (phase) => ((phase + 180) % 360);

function SphereView({
  phaseAngle = 40,
  compositeType = '5_2_1.3',
  viewMode = 'default',
  onCoverage,
  onProgress,
  minHeight = 400,
  incidenceDeg = 45,
  emissionDeg = 45,
  phaseDeg = 0,
  interactionMode = 'vector', // 'vector' | 'plotPoint'
  onSurfacePointSelect,
  multiplePoints = [],
}) {
  const containerRef = useRef(null);
  const clickOverlayRef = useRef({ marker: null, sunArrow: null, satArrow: null, plotCross: null });
  const angleRef = useRef({ incidenceDeg: 45, emissionDeg: 45, phaseDeg: 0 });
  const interactionRef = useRef({ mode: 'vector', onSurfacePointSelect: null });
  const pointerStateRef = useRef({
    isPointerDown: false,
    downX: 0,
    downY: 0,
    wasDragging: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [buildProgress, setBuildProgress] = useState(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const animationIdRef = useRef(null);
  const textureRef = useRef(null);
  const cameraRef = useRef(null);
  const meshRef = useRef(null);
  const multiPointGroupRef = useRef(null);
  const resizeCleanupRef = useRef(null);

  const frontImageUrl = useMemo(
    () => getImageUrl(phaseAngle, compositeType),
    [phaseAngle, compositeType]
  );
  const backImageUrl = useMemo(
    () => getImageUrl(oppositePhase(phaseAngle), compositeType),
    [phaseAngle, compositeType]
  );
  const textureBuildKey = useMemo(
    () => (viewMode === 'weightedPhase'
      ? `weighted:${compositeType}`
      : `default:${frontImageUrl}|${backImageUrl}`),
    [viewMode, compositeType, frontImageUrl, backImageUrl]
  );
  const buildTexturePromiseFactory = useMemo(() => {
    if (textureBuildKey.startsWith('weighted:')) {
      const compositeFromKey = textureBuildKey.slice('weighted:'.length);
      return () => buildWeightedPhaseGlobeTextureAllPhases(compositeFromKey, {
        onProgress: (current, total, phaseAngleDeg) => {
          setBuildProgress((p) => (p ? { ...p, current, total, phaseAngle: phaseAngleDeg } : { current, total, phaseAngle: phaseAngleDeg }));
          if (typeof onProgress === 'function') onProgress({ current, total, phaseAngle: phaseAngleDeg });
        },
      }).then(({ canvas, coverage }) => {
        if (typeof onCoverage === 'function') onCoverage(coverage);
        return canvas;
      });
    }

    const urls = textureBuildKey.slice('default:'.length);
    const splitAt = urls.indexOf('|');
    const frontUrl = urls.slice(0, splitAt);
    const backUrl = urls.slice(splitAt + 1);
    return () => buildEquirectangularTextureCanvasFromTwoHalves(frontUrl, backUrl);
  }, [textureBuildKey, onCoverage, onProgress]);

  useEffect(() => {
    angleRef.current = {
      incidenceDeg: Math.max(0, Math.min(180, Number.isFinite(incidenceDeg) ? incidenceDeg : 45)),
      emissionDeg: Math.max(0, Math.min(180, Number.isFinite(emissionDeg) ? emissionDeg : 45)),
      phaseDeg: Math.max(0, Math.min(360, Number.isFinite(phaseDeg) ? phaseDeg : 0)),
    };
  }, [incidenceDeg, emissionDeg, phaseDeg]);

  useEffect(() => {
    interactionRef.current = {
      mode: interactionMode === 'plotPoint'
        ? 'plotPoint'
        : (interactionMode === 'plotMultiple' ? 'plotMultiple' : 'vector'),
      onSurfacePointSelect: typeof onSurfacePointSelect === 'function' ? onSurfacePointSelect : null,
    };
    if (sceneRef.current) {
      clearClickOverlay(sceneRef.current, clickOverlayRef);
    }
  }, [interactionMode, onSurfacePointSelect]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      setError('Container ref not set');
      return;
    }

    let cancelled = false;
    let scene, camera, renderer, controls, geometry, material, mesh;
    let starsNear = null;
    let starsFar = null;
    let sunBody = null;
    let satelliteBody = null;
    let sunPointLight = null;
    let clickHandler = null;
    let pointerDownHandler = null;
    let pointerMoveHandler = null;
    let pointerUpHandler = null;

    const rafId = requestAnimationFrame(function initThree() {
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
        scene.background = new THREE.Color(0x02040a);
        sceneRef.current = scene;

        const w = Math.max(1, cont.clientWidth || 1);
        const h = Math.max(1, cont.clientHeight || 1);
        camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
        camera.position.set(0, 0, 3.5);
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
        controls.minDistance = 2.2;
        controls.maxDistance = 7;
        controls.minPolarAngle = Math.PI / 2;
        controls.maxPolarAngle = Math.PI / 2;
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.rotateSpeed = 0.85;
        controlsRef.current = controls;

        geometry = new THREE.SphereGeometry(1, 256, 256);
        material = new THREE.MeshStandardMaterial({
          side: THREE.FrontSide,
          roughness: 0.85,
          metalness: 0.0,
          displacementScale: 0.08,
        });
        mesh = new THREE.Mesh(geometry, material);
        // Rotate Titan to the requested yaw.
        mesh.rotation.y = THREE.MathUtils.degToRad(215);
        meshRef.current = mesh;
        scene.add(mesh);

        const multiPointGroup = new THREE.Group();
        multiPointGroupRef.current = multiPointGroup;
        scene.add(multiPointGroup);

        const sunGeometry = new THREE.SphereGeometry(0.16, 24, 24);
        const satelliteGeometry = new THREE.SphereGeometry(0.09, 20, 20);
        const sunMaterial = new THREE.MeshStandardMaterial({
          color: 0xffd95c,
          emissive: 0x8f5f00,
          emissiveIntensity: 0.9,
          roughness: 0.45,
          metalness: 0.1,
        });
        const satelliteMaterial = new THREE.MeshStandardMaterial({
          color: 0xa8a8a8,
          roughness: 0.85,
          metalness: 0.2,
        });
        sunBody = new THREE.Mesh(sunGeometry, sunMaterial);
        satelliteBody = new THREE.Mesh(satelliteGeometry, satelliteMaterial);
        scene.add(sunBody);
        scene.add(satelliteBody);

        const createStarField = (count, radius, size, opacity) => {
          const positions = new Float32Array(count * 3);
          for (let i = 0; i < count; i += 1) {
            const theta = Math.random() * Math.PI * 2;
            const u = (Math.random() * 2) - 1;
            const phi = Math.acos(u);
            const r = radius * (0.75 + (Math.random() * 0.25));
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[(i * 3) + 1] = r * Math.cos(phi);
            positions[(i * 3) + 2] = r * Math.sin(phi) * Math.sin(theta);
          }
          const starGeometry = new THREE.BufferGeometry();
          starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size,
            sizeAttenuation: true,
            transparent: true,
            opacity,
            depthWrite: false,
          });
          return new THREE.Points(starGeometry, starMaterial);
        };

        starsFar = createStarField(2600, 32, 0.06, 0.45);
        starsNear = createStarField(1200, 16, 0.04, 0.7);
        scene.add(starsFar);
        scene.add(starsNear);

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();

        pointerDownHandler = (event) => {
          pointerStateRef.current.isPointerDown = true;
          pointerStateRef.current.downX = event.clientX;
          pointerStateRef.current.downY = event.clientY;
          pointerStateRef.current.wasDragging = false;
        };
        pointerMoveHandler = (event) => {
          if (!pointerStateRef.current.isPointerDown) return;
          const dx = event.clientX - pointerStateRef.current.downX;
          const dy = event.clientY - pointerStateRef.current.downY;
          if ((dx * dx) + (dy * dy) > 25) {
            pointerStateRef.current.wasDragging = true;
          }
        };
        pointerUpHandler = () => {
          pointerStateRef.current.isPointerDown = false;
        };

        renderer.domElement.addEventListener('pointerdown', pointerDownHandler);
        renderer.domElement.addEventListener('pointermove', pointerMoveHandler);
        renderer.domElement.addEventListener('pointerup', pointerUpHandler);

        clickHandler = (event) => {
          const mode = interactionRef.current.mode;
          if (mode !== 'vector' && mode !== 'plotPoint' && mode !== 'plotMultiple') return;
          if (pointerStateRef.current.wasDragging) {
            pointerStateRef.current.wasDragging = false;
            return;
          }
          if (!renderer || !camera || !mesh || !scene) return;

          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);

          const intersects = raycaster.intersectObject(mesh, false);
          if (intersects.length === 0) return;

          const hitPoint = intersects[0].point.clone();
          const normal = hitPoint.clone().normalize();
          const upRef = Math.abs(normal.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
          const tangent = upRef.clone().cross(normal).normalize();
          const bitangent = normal.clone().cross(tangent).normalize();

          clearClickOverlay(scene, clickOverlayRef);
          const origin = hitPoint.clone().add(normal.clone().multiplyScalar(0.022));

          if (mode === 'plotPoint') {
            const crossSize = 0.065;
            const crossRadius = 0.0065;
            const diagA = tangent.clone().add(bitangent).normalize();
            const diagB = tangent.clone().sub(bitangent).normalize();

            const makeCrossArm = (dir) => {
              const arm = new THREE.Mesh(
                new THREE.CylinderGeometry(crossRadius, crossRadius, crossSize * 2, 12),
                new THREE.MeshBasicMaterial({
                  color: 0xff3030,
                  depthTest: false,
                  depthWrite: false,
                })
              );
              arm.position.copy(origin.clone().add(normal.clone().multiplyScalar(0.004)));
              arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
              arm.renderOrder = 999;
              return arm;
            };

            const plotCross = new THREE.Group();
            plotCross.add(makeCrossArm(diagA));
            plotCross.add(makeCrossArm(diagB));
            scene.add(plotCross);

            const uv = intersects[0].uv;
            if (uv && interactionRef.current.onSurfacePointSelect) {
              const gridSize = 681;
              const x = Math.max(0, Math.min(gridSize - 1, Math.round(uv.x * (gridSize - 1))));
              const y = Math.max(0, Math.min(gridSize - 1, Math.round((1 - uv.y) * (gridSize - 1))));
              const localHit = mesh.worldToLocal(hitPoint.clone()).normalize();
              const lat = THREE.MathUtils.radToDeg(Math.asin(localHit.y));
              const lon = THREE.MathUtils.radToDeg(Math.atan2(localHit.x, localHit.z));
              interactionRef.current.onSurfacePointSelect({ x, y, lat, lon });
            }
            clickOverlayRef.current = { marker: null, sunArrow: null, satArrow: null, plotCross };
            return;
          }

          if (mode === 'plotMultiple') {
            const uv = intersects[0].uv;
            if (uv && interactionRef.current.onSurfacePointSelect) {
              const gridSize = 681;
              const x = Math.max(0, Math.min(gridSize - 1, Math.round(uv.x * (gridSize - 1))));
              const y = Math.max(0, Math.min(gridSize - 1, Math.round((1 - uv.y) * (gridSize - 1))));
              const localHit = mesh.worldToLocal(hitPoint.clone()).normalize();
              const lat = THREE.MathUtils.radToDeg(Math.asin(localHit.y));
              const lon = THREE.MathUtils.radToDeg(Math.atan2(localHit.x, localHit.z));
              interactionRef.current.onSurfacePointSelect({ x, y, lat, lon });
            }
            return;
          }

          const marker = new THREE.Mesh(
            new THREE.SphereGeometry(0.042, 20, 20),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
          );
          marker.position.copy(origin);
          marker.renderOrder = 999;
          scene.add(marker);
          const arrowLength = 0.55;
          const getCenterAxisDirection = (target) => {
            const d = target.clone();
            if (d.lengthSq() < 1e-8) return new THREE.Vector3(1, 0, 0);
            return d.normalize();
          };
          const sunArrow = new THREE.ArrowHelper(getCenterAxisDirection(sunBody.position), origin, arrowLength, 0xffc94a, 0.12, 0.06);
          const satArrow = new THREE.ArrowHelper(getCenterAxisDirection(satelliteBody.position), origin, arrowLength, 0x66ccff, 0.12, 0.06);
          [sunArrow, satArrow].forEach((arrow) => {
            arrow.line.material.depthTest = false;
            arrow.line.material.depthWrite = false;
            arrow.cone.material.depthTest = false;
            arrow.cone.material.depthWrite = false;
            arrow.line.renderOrder = 998;
            arrow.cone.renderOrder = 998;
          });
          scene.add(sunArrow);
          scene.add(satArrow);
          clickOverlayRef.current = { marker, sunArrow, satArrow, plotCross: null };
        };
        renderer.domElement.addEventListener('click', clickHandler);

        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
        scene.add(ambientLight);
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
        dirLight.position.set(5, 3, 5);
        scene.add(dirLight);
        sunPointLight = new THREE.PointLight(0xffd47a, 0.85, 35);
        scene.add(sunPointLight);

        const updateSunSatelliteWorldPositions = () => {
          if (!sunBody || !satelliteBody) return;
          const incidenceNorm = THREE.MathUtils.clamp(angleRef.current.incidenceDeg / 180, 0, 1);
          const emissionNorm = THREE.MathUtils.clamp(angleRef.current.emissionDeg / 180, 0, 1);
          const phaseRad = THREE.MathUtils.degToRad(angleRef.current.phaseDeg);
          // Sun direction is fixed by incidence. Satellite rotates around Sun direction by phase.
          // At phase = 0, they are colinear by construction.
          const incidenceRad = THREE.MathUtils.degToRad(angleRef.current.incidenceDeg);
          const sunDirection = new THREE.Vector3(Math.sin(incidenceRad), 0, -Math.cos(incidenceRad)).normalize();
          const satDirection = sunDirection.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), phaseRad).normalize();
          const satDistance = 2.9 + (emissionNorm * 1.1);
          const sunDistance = 3.6 + (incidenceNorm * 1.4);

          satelliteBody.position.copy(satDirection.multiplyScalar(satDistance));
          sunBody.position.copy(sunDirection.multiplyScalar(sunDistance));
          if (sunPointLight) sunPointLight.position.copy(sunBody.position);
        };
        updateSunSatelliteWorldPositions();

        function animate() {
          if (cancelled) return;
          animationIdRef.current = requestAnimationFrame(animate);
          if (controls && renderer && scene && camera) {
            controls.update();
            if (starsNear) starsNear.rotation.y += 0.00006;
            if (starsFar) {
              starsFar.rotation.y -= 0.00003;
              starsFar.rotation.x += 0.000015;
            }
            updateSunSatelliteWorldPositions();
            renderer.render(scene, camera);
          }
        }
        animate();

        window.addEventListener('resize', onResize);
        resizeCleanupRef.current = () => window.removeEventListener('resize', onResize);

        const buildTexturePromise = buildTexturePromiseFactory();

        Promise.all([buildTexturePromise, loadHeightMap().catch(() => null)])
          .then(([canvas, heightTex]) => {
            if (cancelled) return;
            if (textureRef.current) textureRef.current.dispose();
            const tex = new THREE.CanvasTexture(canvas);
            tex.wrapS = THREE.ClampToEdgeWrapping;
            tex.wrapT = THREE.ClampToEdgeWrapping;
            textureRef.current = tex;
            material.map = tex;
            if (heightTex) material.displacementMap = heightTex;
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
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      if (animationIdRef.current) cancelAnimationFrame(animationIdRef.current);
      if (controls) controls.dispose();
      if (renderer && clickHandler) renderer.domElement.removeEventListener('click', clickHandler);
      if (renderer && pointerDownHandler) renderer.domElement.removeEventListener('pointerdown', pointerDownHandler);
      if (renderer && pointerMoveHandler) renderer.domElement.removeEventListener('pointermove', pointerMoveHandler);
      if (renderer && pointerUpHandler) renderer.domElement.removeEventListener('pointerup', pointerUpHandler);
      clearClickOverlay(scene, clickOverlayRef);
      if (starsNear) {
        starsNear.geometry.dispose();
        starsNear.material.dispose();
      }
      if (starsFar) {
        starsFar.geometry.dispose();
        starsFar.material.dispose();
      }
      if (sunBody) {
        sunBody.geometry.dispose();
        sunBody.material.dispose();
      }
      if (satelliteBody) {
        satelliteBody.geometry.dispose();
        satelliteBody.material.dispose();
      }
      if (sunPointLight && scene) {
        scene.remove(sunPointLight);
      }
      if (multiPointGroupRef.current && scene) {
        scene.remove(multiPointGroupRef.current);
      }
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
      meshRef.current = null;
      multiPointGroupRef.current = null;
    };
  }, [buildTexturePromiseFactory]);

  useEffect(() => {
    const scene = sceneRef.current;
    const mesh = meshRef.current;
    const group = multiPointGroupRef.current;
    if (!scene || !mesh || !group) return;

    while (group.children.length > 0) {
      const child = group.children.pop();
      if (!child) break;
      child.traverse((node) => {
        if (node.geometry) node.geometry.dispose();
        if (node.material) {
          if (Array.isArray(node.material)) node.material.forEach((m) => m.dispose());
          else node.material.dispose();
        }
      });
      group.remove(child);
    }

    if (!Array.isArray(multiplePoints) || multiplePoints.length === 0) return;
    const colorValues = [0xff0000, 0xffa500, 0xffff00, 0x00ff00, 0x0000ff, 0x800080];
    const gridSize = 681;
    const crossSize = 0.055;
    const crossRadius = 0.005;

    multiplePoints.forEach((point, index) => {
      if (point?.x == null || point?.y == null) return;
      let local;
      if (Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
        const latRad = THREE.MathUtils.degToRad(point.lat);
        const lonRad = THREE.MathUtils.degToRad(point.lon);
        local = new THREE.Vector3(
          Math.sin(lonRad) * Math.cos(latRad),
          Math.sin(latRad),
          Math.cos(lonRad) * Math.cos(latRad)
        );
      } else {
        const u = THREE.MathUtils.clamp(point.x / (gridSize - 1), 0, 1);
        const v = THREE.MathUtils.clamp(1 - (point.y / (gridSize - 1)), 0, 1);
        const phi = v * Math.PI;
        const theta = u * Math.PI * 2;
        local = new THREE.Vector3(
          -Math.cos(theta) * Math.sin(phi),
          Math.cos(phi),
          Math.sin(theta) * Math.sin(phi)
        );
      }
      const worldPoint = mesh.localToWorld(local.clone());
      const normal = worldPoint.clone().sub(mesh.getWorldPosition(new THREE.Vector3())).normalize();
      const upRef = Math.abs(normal.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
      const tangent = upRef.clone().cross(normal).normalize();
      const bitangent = normal.clone().cross(tangent).normalize();
      const diagA = tangent.clone().add(bitangent).normalize();
      const diagB = tangent.clone().sub(bitangent).normalize();
      const origin = worldPoint.clone().add(normal.clone().multiplyScalar(0.02));
      const colorIndex = point.colorIndex !== undefined ? point.colorIndex : index;
      const color = colorValues[colorIndex] || 0xff0000;

      const makeArm = (dir) => {
        const arm = new THREE.Mesh(
          new THREE.CylinderGeometry(crossRadius, crossRadius, crossSize * 2, 10),
          new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false })
        );
        arm.position.copy(origin);
        arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
        arm.renderOrder = 999;
        return arm;
      };

      const cross = new THREE.Group();
      cross.add(makeArm(diagA));
      cross.add(makeArm(diagB));
      group.add(cross);
    });
  }, [multiplePoints]);

  if (error) {
    return (
      <div className="sphere-view-container" style={getContainerStyle(minHeight)}>
        <div style={errorStyle}>
          <p>Failed to load sphere texture</p>
          <p style={{ fontSize: '14px', color: '#999' }}>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="sphere-view-container" style={getContainerStyle(minHeight)} data-sphere-view="root">
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
            {textureBuildKey.startsWith('weighted:') && buildProgress
              ? `Building from all phases: ${buildProgress.current}/${buildProgress.total} (${buildProgress.phaseAngle}°)`
              : 'Loading texture...'}
          </p>
        </div>
      )}
    </div>
  );
}

function clearClickOverlay(scene, clickOverlayRef) {
  const overlay = clickOverlayRef.current;
  ['marker', 'sunArrow', 'satArrow', 'plotCross'].forEach((key) => {
    if (!overlay[key]) return;
    if (scene) scene.remove(overlay[key]);
    overlay[key].traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
        else child.material.dispose();
      }
    });
    overlay[key] = null;
  });
}

const getContainerStyle = (minHeight) => ({
  width: '100%',
  height: '100%',
  minHeight: typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
  position: 'relative',
  backgroundColor: '#0a0a0f',
  borderRadius: '8px',
  overflow: 'hidden',
});

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
