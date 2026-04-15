import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { loadHeightMap } from '../utils/heightMapLoader';
import { getPublicAssetUrl } from '../utils/assetUrl';

function SphereView({
  minHeight = 400,
  incidenceDeg = 45,
  emissionDeg = 45,
  phaseDeg = 0,
  titanYawDeg = 0,
  obliquityDeg = 0,
  cameraPreset = 'none', // 'none' | 'cassini' | 'sun'
  cameraCenter = 'titan', // 'titan' | 'spacecraft' | 'vector' | 'overhead'
  geometryInteractionMode = 'camera', // 'camera' | 'editTitan' | 'editCassini'
  introAnimation = true,
  showLatLonGrid = false,
  showGeometryGrid = false,
  showRotationAxis = false,
  showAngleArcs = false,
  showVectorLabels = true,
  showExtendedVectorLines = false,
  allowMultipleVectors = false,
  showAtmosphere = true,
  interactionMode = 'vector', // 'vector' | 'plotPoint'
  onSurfacePointSelect,
  onGeometryChange,
  onCameraPresetRelease,
  onVectorPlaced,
  multiplePoints = [],
}) {
  const containerRef = useRef(null);
  const clickOverlayRef = useRef({ marker: null, sunArrow: null, satArrow: null, normalArrow: null, plotCross: null, vectors: [] });
  const angleRef = useRef({ incidenceDeg: 45, emissionDeg: 45, phaseDeg: 0 });
  const interactionRef = useRef({ mode: 'vector', onSurfacePointSelect: null });
  const geometryModeRef = useRef('camera');
  const geometryChangeRef = useRef(typeof onGeometryChange === 'function' ? onGeometryChange : null);
  const presetReleaseRef = useRef(typeof onCameraPresetRelease === 'function' ? onCameraPresetRelease : null);
  const vectorPlacedRef = useRef(typeof onVectorPlaced === 'function' ? onVectorPlaced : null);
  const pointerStateRef = useRef({
    isPointerDown: false,
    downX: 0,
    downY: 0,
    wasDragging: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vectorTooltip, setVectorTooltip] = useState({ visible: false, text: '', x: 0, y: 0, color: '#66ccff', pinned: false, key: null });
  const [pinnedVectorTooltips, setPinnedVectorTooltips] = useState([]);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const animationIdRef = useRef(null);
  const textureRef = useRef(null);
  const cameraRef = useRef(null);
  const meshRef = useRef(null);
  const atmosphereRef = useRef(null);
  const atmosphereGlowRef = useRef(null);
  const multiPointGroupRef = useRef(null);
  const resizeCleanupRef = useRef(null);
  const cameraModeRef = useRef({ preset: 'none', center: 'titan' });
  const introStateRef = useRef({ active: true, startMs: 0, durationMs: 3400 });
  const introEnabledRef = useRef(!!introAnimation);
  const prevCameraCenterRef = useRef('titan');
  const pendingSpacecraftAutoZoomRef = useRef(false);
  const pendingOverheadSnapRef = useRef(false);
  const latLonGridRef = useRef(null);
  const latLonLabelsRef = useRef(null);
  const latLonGridEnabledRef = useRef(!!showLatLonGrid);
  const geometryGridRef = useRef(null);
  const geometryGridEnabledRef = useRef(!!showGeometryGrid);
  const rotationAxisRef = useRef(null);
  const rotationAxisEnabledRef = useRef(!!showRotationAxis);
  const showAngleArcsRef = useRef(!!showAngleArcs);
  const showVectorLabelsRef = useRef(showVectorLabels !== false);
  const showExtendedVectorLinesRef = useRef(!!showExtendedVectorLines);
  const allowMultipleVectorsRef = useRef(!!allowMultipleVectors);
  const showAtmosphereRef = useRef(!!showAtmosphere);
  const titanYawRadRef = useRef(0);
  const obliquityRadRef = useRef(0);
  const activeGeometryDragRef = useRef({ type: null, lastX: 0, lastY: 0, lastAngle: null });
  const tooltipStateRef = useRef({ visible: false, text: '', x: 0, y: 0, color: '#66ccff', pinned: false, key: null });
  const pinnedVectorTooltipsRef = useRef([]);
  const pinnedVectorKeysRef = useRef(new Set());
  const hoveredVectorKeyRef = useRef(null);
  const overlaySceneRef = useRef(null);
  const vectorIdCounterRef = useRef(1);

  useEffect(() => {
    angleRef.current = {
      incidenceDeg: Math.max(0, Math.min(180, Number.isFinite(incidenceDeg) ? incidenceDeg : 45)),
      emissionDeg: Math.max(0, Math.min(180, Number.isFinite(emissionDeg) ? emissionDeg : 45)),
      phaseDeg: Math.max(0, Math.min(360, Number.isFinite(phaseDeg) ? phaseDeg : 0)),
    };
  }, [incidenceDeg, emissionDeg, phaseDeg]);

  useEffect(() => {
    const normalizedYaw = Number.isFinite(titanYawDeg)
      ? (((titanYawDeg % 360) + 360) % 360)
      : 0;
    titanYawRadRef.current = THREE.MathUtils.degToRad(normalizedYaw);
  }, [titanYawDeg]);

  useEffect(() => {
    const clampedObliquity = Math.max(-23, Math.min(23, Number.isFinite(obliquityDeg) ? obliquityDeg : 0));
    const obliquityRad = THREE.MathUtils.degToRad(clampedObliquity);
    obliquityRadRef.current = obliquityRad;
    if (meshRef.current) meshRef.current.rotation.z = obliquityRad;
    if (rotationAxisRef.current) rotationAxisRef.current.rotation.z = obliquityRad;
    if (cameraModeRef.current.center === 'overhead') {
      pendingOverheadSnapRef.current = true;
    }
  }, [obliquityDeg]);

  useEffect(() => {
    interactionRef.current = {
      mode: interactionMode === 'plotPoint'
        ? 'plotPoint'
        : (interactionMode === 'plotMultiple' ? 'plotMultiple' : 'vector'),
      onSurfacePointSelect: typeof onSurfacePointSelect === 'function' ? onSurfacePointSelect : null,
    };
    if (sceneRef.current) {
      clearClickOverlay(overlaySceneRef.current, clickOverlayRef);
    }
    pinnedVectorKeysRef.current = new Set();
    hoveredVectorKeyRef.current = null;
    setVectorTooltip({ visible: false, text: '', x: 0, y: 0, color: '#66ccff', pinned: false, key: null });
    pinnedVectorTooltipsRef.current = [];
    setPinnedVectorTooltips([]);
  }, [interactionMode, onSurfacePointSelect]);

  useEffect(() => {
    geometryModeRef.current = (geometryInteractionMode === 'editTitan' || geometryInteractionMode === 'editCassini')
      ? geometryInteractionMode
      : 'camera';
    activeGeometryDragRef.current = { type: null, lastX: 0, lastY: 0, lastAngle: null };
    if (controlsRef.current) controlsRef.current.enabled = true;
  }, [geometryInteractionMode]);

  useEffect(() => {
    geometryChangeRef.current = typeof onGeometryChange === 'function' ? onGeometryChange : null;
  }, [onGeometryChange]);

  useEffect(() => {
    presetReleaseRef.current = typeof onCameraPresetRelease === 'function' ? onCameraPresetRelease : null;
  }, [onCameraPresetRelease]);

  useEffect(() => {
    vectorPlacedRef.current = typeof onVectorPlaced === 'function' ? onVectorPlaced : null;
  }, [onVectorPlaced]);

  useEffect(() => {
    const preset = cameraPreset === 'cassini' || cameraPreset === 'sun' ? cameraPreset : 'none';
    const center = cameraCenter === 'spacecraft'
      ? 'spacecraft'
      : (cameraCenter === 'vector'
        ? 'vector'
        : (cameraCenter === 'overhead' ? 'overhead' : 'titan'));
    cameraModeRef.current = { preset, center };
    if (prevCameraCenterRef.current !== center && center === 'spacecraft') {
      pendingSpacecraftAutoZoomRef.current = true;
    }
    if (prevCameraCenterRef.current !== center && center === 'overhead') {
      pendingOverheadSnapRef.current = true;
    }
    prevCameraCenterRef.current = center;
  }, [cameraPreset, cameraCenter]);

  useEffect(() => {
    introEnabledRef.current = !!introAnimation;
  }, [introAnimation]);

  useEffect(() => {
    latLonGridEnabledRef.current = !!showLatLonGrid;
    if (latLonGridRef.current) latLonGridRef.current.visible = !!showLatLonGrid;
    if (latLonLabelsRef.current) latLonLabelsRef.current.visible = !!showLatLonGrid;
  }, [showLatLonGrid]);

  useEffect(() => {
    geometryGridEnabledRef.current = !!showGeometryGrid;
    if (geometryGridRef.current) geometryGridRef.current.visible = !!showGeometryGrid;
  }, [showGeometryGrid]);

  useEffect(() => {
    rotationAxisEnabledRef.current = !!showRotationAxis;
    if (rotationAxisRef.current) rotationAxisRef.current.visible = !!showRotationAxis;
  }, [showRotationAxis]);

  useEffect(() => {
    showAngleArcsRef.current = !!showAngleArcs;
    const overlay = clickOverlayRef.current;
    if (!overlay || !Array.isArray(overlay.vectors)) return;
    overlay.vectors.forEach((vectorSet) => {
      if (Array.isArray(vectorSet.angleArcs)) {
        vectorSet.angleArcs.forEach((obj) => { if (obj) obj.visible = !!showAngleArcs; });
      }
      if (Array.isArray(vectorSet.angleLabels)) {
        vectorSet.angleLabels.forEach((obj) => { if (obj) obj.visible = !!showAngleArcs; });
      }
    });
  }, [showAngleArcs]);

  useEffect(() => {
    showVectorLabelsRef.current = showVectorLabels !== false;
    const overlay = clickOverlayRef.current;
    if (!overlay || !Array.isArray(overlay.vectors)) return;
    overlay.vectors.forEach((vectorSet) => {
      if (!Array.isArray(vectorSet.vectorLabels)) return;
      vectorSet.vectorLabels.forEach((obj) => { if (obj) obj.visible = showVectorLabels !== false; });
    });
  }, [showVectorLabels]);

  useEffect(() => {
    showExtendedVectorLinesRef.current = !!showExtendedVectorLines;
    const overlay = clickOverlayRef.current;
    if (!overlay || !Array.isArray(overlay.vectors)) return;
    overlay.vectors.forEach((vectorSet) => {
      if (!Array.isArray(vectorSet.guideLines)) return;
      vectorSet.guideLines.forEach((obj) => { if (obj) obj.visible = !!showExtendedVectorLines; });
    });
  }, [showExtendedVectorLines]);

  useEffect(() => {
    allowMultipleVectorsRef.current = !!allowMultipleVectors;
  }, [allowMultipleVectors]);

  useEffect(() => {
    showAtmosphereRef.current = !!showAtmosphere;
    if (atmosphereRef.current) {
      atmosphereRef.current.visible = !!showAtmosphere;
    }
    if (atmosphereGlowRef.current) {
      atmosphereGlowRef.current.visible = !!showAtmosphere;
    }
  }, [showAtmosphere]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      setError('Container ref not set');
      return;
    }

    let cancelled = false;
    let scene, overlayScene, camera, renderer, controls, geometry, material, mesh;
    let composer = null;
    let starsNear = null;
    let starsFar = null;
    let sunBody = null;
    let satelliteBody = null;
    let cassiniAnchor = null;
    let sunPointLight = null;
    let sunGlow = null;
    let sunGlowTexture = null;
    let sunVisualRadius = 0.22;
    let sunCore = null;
    let cassiniVisualRadius = 0.16;
    let clickHandler = null;
    let pointerDownHandler = null;
    let pointerMoveHandler = null;
    let pointerUpHandler = null;
    let pointerLeaveHandler = null;
    const satTargetPos = new THREE.Vector3();
    const sunTargetPos = new THREE.Vector3();

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
          if (composer) composer.setSize(cw, ch);
        }
      }

      function onResize() {
        doResize();
      }

      try {
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x02040a);
        sceneRef.current = scene;
        overlayScene = new THREE.Scene();
        overlaySceneRef.current = overlayScene;

        const w = Math.max(1, cont.clientWidth || 1);
        const h = Math.max(1, cont.clientHeight || 1);
        camera = new THREE.PerspectiveCamera(45, w / h, 0.01, 100);
        const defaultCameraOffset = new THREE.Vector3(0, 0, 5)
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(120));
        camera.position.copy(defaultCameraOffset);
        scene.add(camera);
        cameraRef.current = camera;

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.domElement.style.display = 'block';
        renderer.domElement.style.width = '100%';
        renderer.domElement.style.height = '100%';
        cont.appendChild(renderer.domElement);
        rendererRef.current = renderer;
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.0, 0.35, 0.1);
        composer.addPass(bloomPass);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.minDistance = 0.02;
        controls.maxDistance = 7;
        controls.minPolarAngle = Math.PI / 2;
        controls.maxPolarAngle = Math.PI / 2;
        controls.enableDamping = true;
        controls.dampingFactor = 0.06;
        controls.rotateSpeed = 0.85;
        controls.target.set(0, 0, 0);
        controlsRef.current = controls;

        geometry = new THREE.SphereGeometry(1, 256, 256);
        material = new THREE.MeshStandardMaterial({
          side: THREE.DoubleSide,
          roughness: 0.95,
          metalness: 0.0,
          transparent: true,
          opacity: 1,
        });
        mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // Rotate Titan to the requested yaw.
        const baseTitanYaw = THREE.MathUtils.degToRad(-90);
        mesh.rotation.y = baseTitanYaw + titanYawRadRef.current;
        mesh.rotation.z = obliquityRadRef.current;
        meshRef.current = mesh;
        scene.add(mesh);

        const atmosphereRadiusScale = 1.062;
        const atmosphere = new THREE.Mesh(
          new THREE.SphereGeometry(atmosphereRadiusScale, 128, 128),
          new THREE.ShaderMaterial({
            transparent: true,
            opacity: 1,
            side: THREE.FrontSide,
            depthWrite: false,
            toneMapped: false,
            uniforms: {},
            vertexShader: `
              varying vec3 vWorldNormal;
              varying vec3 vWorldPos;
              void main() {
                vec4 worldPos = modelMatrix * vec4(position, 1.0);
                vWorldPos = worldPos.xyz;
                vWorldNormal = normalize(mat3(modelMatrix) * normal);
                gl_Position = projectionMatrix * viewMatrix * worldPos;
              }
            `,
            fragmentShader: `
              varying vec3 vWorldNormal;
              varying vec3 vWorldPos;
              void main() {
                vec3 viewDir = normalize(cameraPosition - vWorldPos);
                float ndv = max(dot(normalize(vWorldNormal), viewDir), 0.0);
                float rim = pow(1.0 - ndv, 2.6);
                float alpha = mix(0.46, 0.92, rim);
                vec3 centerColor = vec3(0.66, 0.50, 0.16);
                vec3 edgeColor = vec3(0.98, 0.84, 0.34);
                vec3 color = mix(centerColor, edgeColor, rim);
                gl_FragColor = vec4(color, alpha);
              }
            `,
          })
        );
        atmosphere.visible = showAtmosphereRef.current;
        atmosphereRef.current = atmosphere;
        scene.add(atmosphere);

        const atmosphereGlow = new THREE.Mesh(
          new THREE.SphereGeometry(1.086, 96, 96),
          new THREE.MeshBasicMaterial({
            color: 0xaebdca,
            transparent: true,
            opacity: 0.055,
            side: THREE.BackSide,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false,
          })
        );
        atmosphereGlow.visible = showAtmosphereRef.current;
        atmosphereGlowRef.current = atmosphereGlow;
        scene.add(atmosphereGlow);

        const createTextSprite = (text, color = '#8fe7ff') => {
          const canvas = document.createElement('canvas');
          canvas.width = 256;
          canvas.height = 64;
          const ctx = canvas.getContext('2d');
          if (!ctx) return null;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.font = '24px Arial';
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, canvas.width / 2, canvas.height / 2);
          const texture = new THREE.CanvasTexture(canvas);
          const materialSprite = new THREE.SpriteMaterial({
            map: texture,
            transparent: true,
            depthWrite: false,
          });
          const sprite = new THREE.Sprite(materialSprite);
          sprite.scale.set(0.25, 0.0625, 1);
          return sprite;
        };

        const gridGroup = new THREE.Group();
        const labelGroup = new THREE.Group();
        const lonLineMaterial = new THREE.LineBasicMaterial({
          color: 0xffb56a,
          transparent: true,
          opacity: 0.5,
        });
        const latLineMaterial = new THREE.LineBasicMaterial({
          color: 0x8fe7ff,
          transparent: true,
          opacity: 0.5,
        });
        const lonSteps = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150];
        const latSteps = [-60, -30, 0, 30, 60];
        const r = 1.002;
        const labelR = 1.03;
        lonSteps.forEach((lonDeg) => {
          const lon = THREE.MathUtils.degToRad(lonDeg);
          const pts = [];
          for (let latDeg = -90; latDeg <= 90; latDeg += 3) {
            const lat = THREE.MathUtils.degToRad(latDeg);
            pts.push(new THREE.Vector3(
              Math.sin(lon) * Math.cos(lat) * r,
              Math.sin(lat) * r,
              Math.cos(lon) * Math.cos(lat) * r
            ));
          }
          gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lonLineMaterial.clone()));
          const label = createTextSprite(`${lonDeg}°`, '#ffb56a');
          if (label) {
            label.position.set(
              Math.sin(lon) * labelR,
              0,
              Math.cos(lon) * labelR
            );
            labelGroup.add(label);
          }
        });
        latSteps.forEach((latDeg) => {
          const lat = THREE.MathUtils.degToRad(latDeg);
          const pts = [];
          for (let lonDeg = -180; lonDeg <= 180; lonDeg += 3) {
            const lon = THREE.MathUtils.degToRad(lonDeg);
            pts.push(new THREE.Vector3(
              Math.sin(lon) * Math.cos(lat) * r,
              Math.sin(lat) * r,
              Math.cos(lon) * Math.cos(lat) * r
            ));
          }
          gridGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), latLineMaterial.clone()));
          const label = createTextSprite(`${latDeg}°`, '#8fe7ff');
          if (label) {
            label.position.set(
              0,
              Math.sin(lat) * labelR,
              Math.cos(lat) * labelR
            );
            labelGroup.add(label);
          }
        });
        gridGroup.visible = latLonGridEnabledRef.current;
        labelGroup.visible = latLonGridEnabledRef.current;
        latLonGridRef.current = gridGroup;
        latLonLabelsRef.current = labelGroup;
        mesh.add(gridGroup);
        mesh.add(labelGroup);

        const geometryGrid = new THREE.Group();
        const ringRadius = 1.38;
        const makeRing = (color, opacity = 0.45) => new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(
            Array.from({ length: 96 }, (_, idx) => {
              const t = (idx / 96) * Math.PI * 2;
              return new THREE.Vector3(Math.cos(t) * ringRadius, 0, Math.sin(t) * ringRadius);
            })
          ),
          new THREE.LineBasicMaterial({ color, transparent: true, opacity })
        );
        const eqRing = makeRing(0x66ccff, 0.5);
        geometryGrid.add(eqRing);
        const meridianA = makeRing(0xffc366, 0.38);
        meridianA.rotation.x = Math.PI / 2;
        geometryGrid.add(meridianA);
        const meridianB = makeRing(0xa7ff8a, 0.38);
        meridianB.rotation.z = Math.PI / 2;
        geometryGrid.add(meridianB);

        for (let deg = 0; deg < 360; deg += 15) {
          const isMajor = deg % 45 === 0;
          const rad = THREE.MathUtils.degToRad(deg);
          const inner = new THREE.Vector3(Math.cos(rad) * 1.06, 0, Math.sin(rad) * 1.06);
          const outer = new THREE.Vector3(Math.cos(rad) * (isMajor ? 1.52 : 1.45), 0, Math.sin(rad) * (isMajor ? 1.52 : 1.45));
          const spoke = new THREE.Line(
            new THREE.BufferGeometry().setFromPoints([inner, outer]),
            new THREE.LineBasicMaterial({
              color: isMajor ? 0xfff0b3 : 0x9ec6d8,
              transparent: true,
              opacity: isMajor ? 0.55 : 0.25,
            })
          );
          geometryGrid.add(spoke);
        }
        geometryGrid.visible = geometryGridEnabledRef.current;
        geometryGridRef.current = geometryGrid;
        scene.add(geometryGrid);

        const axisGroup = new THREE.Group();
        const axisMat = new THREE.LineBasicMaterial({ color: 0xf66d6d, transparent: true, opacity: 0.9 });
        const axisPts = [new THREE.Vector3(0, -1.45, 0), new THREE.Vector3(0, 1.45, 0)];
        axisGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(axisPts), axisMat));
        const topCone = new THREE.Mesh(
          new THREE.ConeGeometry(0.03, 0.1, 10),
          new THREE.MeshBasicMaterial({ color: 0xf66d6d, transparent: true, opacity: 0.9 })
        );
        topCone.position.set(0, 1.5, 0);
        axisGroup.add(topCone);
        axisGroup.rotation.z = obliquityRadRef.current;
        axisGroup.visible = rotationAxisEnabledRef.current;
        rotationAxisRef.current = axisGroup;
        scene.add(axisGroup);

        const multiPointGroup = new THREE.Group();
        multiPointGroupRef.current = multiPointGroup;
        scene.add(multiPointGroup);

        sunBody = new THREE.Group();
        satelliteBody = new THREE.Group();
        cassiniAnchor = new THREE.Group();
        satelliteBody.add(cassiniAnchor);
        scene.add(sunBody);
        scene.add(satelliteBody);

        const makeObjectSemiTransparent = (object, opacity) => {
          object.traverse((node) => {
            if (!node.material) return;
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((m) => {
              m.transparent = true;
              m.opacity = opacity;
              m.side = THREE.DoubleSide;
              m.needsUpdate = true;
            });
          });
        };

        const setObjectIllumination = (object, emissiveIntensity = 0) => {
          object.traverse((node) => {
            if (!node.material) return;
            const mats = Array.isArray(node.material) ? node.material : [node.material];
            mats.forEach((m) => {
              if ('emissive' in m && m.emissive) {
                m.emissive.setHex(0xffe1ad);
                m.emissiveIntensity = emissiveIntensity;
                m.needsUpdate = true;
              }
            });
          });
        };

        const glowCanvas = document.createElement('canvas');
        glowCanvas.width = 256;
        glowCanvas.height = 256;
        const glowCtx = glowCanvas.getContext('2d');
        if (glowCtx) {
          const center = glowCanvas.width / 2;
          const gradient = glowCtx.createRadialGradient(center, center, 0, center, center, center);
          gradient.addColorStop(0, 'rgba(255, 255, 220, 1)');
          gradient.addColorStop(0.15, 'rgba(255, 225, 140, 0.9)');
          gradient.addColorStop(0.45, 'rgba(255, 180, 70, 0.45)');
          gradient.addColorStop(1, 'rgba(255, 120, 30, 0)');
          glowCtx.fillStyle = gradient;
          glowCtx.fillRect(0, 0, glowCanvas.width, glowCanvas.height);
          sunGlowTexture = new THREE.CanvasTexture(glowCanvas);
          const glowMaterial = new THREE.SpriteMaterial({
            map: sunGlowTexture,
            color: 0xffe0a0,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          });
          sunGlow = new THREE.Sprite(glowMaterial);
          sunGlow.scale.set(1.25, 1.25, 1);
          sunGlow.renderOrder = 10;
          scene.add(sunGlow);
        }

        // Keep a visible sun core even if the external model fails or has no visible meshes.
        sunCore = new THREE.Mesh(
          new THREE.SphereGeometry(0.155, 32, 32),
          new THREE.MeshStandardMaterial({
            color: 0xffd995,
            emissive: 0xffb34d,
            emissiveIntensity: 2.4,
            roughness: 0.2,
            metalness: 0.0,
            transparent: true,
            opacity: 1,
            side: THREE.DoubleSide,
          })
        );
        sunCore.castShadow = false;
        sunCore.receiveShadow = false;
        sunBody.add(sunCore);

        const sunLoader = new USDZLoader();
        const sunModelUrl = getPublicAssetUrl('/assets/3d-model/Sun.usdz');
        sunLoader.load(
          sunModelUrl,
          (sunModel) => {
            if (cancelled || !sunBody) return;
            const box = new THREE.Box3().setFromObject(sunModel);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const targetSize = 0.32;
            const scale = targetSize / maxDim;
            sunModel.scale.setScalar(scale);
            sunModel.updateMatrixWorld(true);
            box.setFromObject(sunModel);
            const center = box.getCenter(new THREE.Vector3());
            sunModel.position.sub(center);

            sunModel.traverse((node) => {
              if (node.isMesh && node.material) {
                const mats = Array.isArray(node.material) ? node.material : [node.material];
                mats.forEach((m) => {
                  m.emissive = new THREE.Color(0xffcc66);
                  m.emissiveIntensity = 2.1;
                  m.color = new THREE.Color(0xffe6a6);
                  m.side = THREE.DoubleSide;
                  m.transparent = true;
                  m.opacity = 1;
                  m.needsUpdate = true;
                });
                node.castShadow = false;
                node.receiveShadow = false;
              }
            });

            sunVisualRadius = Math.max(sunVisualRadius, targetSize * 0.5);
            sunBody.add(sunModel);
          },
          undefined,
          () => {
            if (cancelled || !sunBody) return;
            const fallback = new THREE.Mesh(
              new THREE.SphereGeometry(0.16, 24, 24),
              new THREE.MeshStandardMaterial({
                color: 0xffd95c,
                emissive: 0xffaa44,
                emissiveIntensity: 2.1,
                roughness: 0.4,
                metalness: 0.1,
                transparent: true,
                opacity: 1,
                side: THREE.DoubleSide,
              })
            );
            sunBody.add(fallback);
            sunVisualRadius = 0.16;
          }
        );

        const gltfLoader = new GLTFLoader();
        const cassiniModelUrls = [
          getPublicAssetUrl('/assets/3d-model/Cassini.glb'),
          getPublicAssetUrl('/assets/3d-model/cassini.glb'),
          getPublicAssetUrl('/assets/3d-model/Cassini.GLB'),
        ];
        const applyCassiniModel = (gltf) => {
          if (cancelled || !satelliteBody) return;
          const cassiniModel = gltf.scene;
          cassiniModel.updateMatrixWorld(true);

          const box = new THREE.Box3().setFromObject(cassiniModel);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z) || 1;
          const targetSize = 0.44;
          const scale = targetSize / maxDim;
          cassiniModel.scale.setScalar(scale);
          cassiniModel.updateMatrixWorld(true);

          box.setFromObject(cassiniModel);
          const center = box.getCenter(new THREE.Vector3());
          cassiniModel.position.sub(center);

          cassiniModel.rotation.y = THREE.MathUtils.degToRad(90);
          cassiniModel.traverse((node) => {
            if (node.isMesh) {
              node.castShadow = false;
              node.receiveShadow = false;
            }
          });
          cassiniVisualRadius = targetSize * 0.55;
          cassiniAnchor.add(cassiniModel);
        };
        const parseCassiniData = (data) => new Promise((resolve, reject) => {
          gltfLoader.parse(
            data,
            '',
            (gltf) => {
              applyCassiniModel(gltf);
              resolve();
            },
            (err) => reject(err)
          );
        });
        const loadCassiniModel = async () => {
          let lastError = null;
          for (const url of cassiniModelUrls) {
            try {
              const response = await fetch(url, { cache: 'no-store' });
              if (!response.ok) {
                lastError = new Error(`HTTP ${response.status} for ${url}`);
                continue;
              }
              const data = await response.arrayBuffer();
              await parseCassiniData(data);
              return;
            } catch (err) {
              lastError = err;
            }
          }
          throw lastError || new Error('Unable to load Cassini model from all candidate paths');
        };
        loadCassiniModel().catch((err) => {
          if (cancelled || !satelliteBody) return;
          // Intentionally no fallback geometry: only render the real Cassini model.
          console.error('Failed to load Cassini model', { urls: cassiniModelUrls, error: err });
        });

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
        raycaster.params.Line.threshold = 0.025;
        const pointer = new THREE.Vector2();
        const maybeUpdateTooltip = (next) => {
          const prev = tooltipStateRef.current;
          if (
            prev.visible === next.visible &&
            prev.text === next.text &&
            prev.color === next.color &&
            prev.pinned === next.pinned &&
            prev.key === next.key &&
            Math.abs(prev.x - next.x) < 0.5 &&
            Math.abs(prev.y - next.y) < 0.5
          ) {
            return;
          }
          tooltipStateRef.current = next;
          setVectorTooltip(next);
        };

        const hideVectorTooltip = () => {
          maybeUpdateTooltip({ visible: false, text: '', x: 0, y: 0, color: '#66ccff', pinned: false, key: null });
        };

        const maybeUpdatePinnedTooltips = (next) => {
          const prev = pinnedVectorTooltipsRef.current;
          const sameLength = prev.length === next.length;
          let same = sameLength;
          if (sameLength) {
            for (let i = 0; i < prev.length; i += 1) {
              const a = prev[i];
              const b = next[i];
              if (
                a.key !== b.key ||
                a.text !== b.text ||
                a.color !== b.color ||
                Math.abs(a.x - b.x) > 0.5 ||
                Math.abs(a.y - b.y) > 0.5
              ) {
                same = false;
                break;
              }
            }
          }
          if (same) return;
          pinnedVectorTooltipsRef.current = next;
          setPinnedVectorTooltips(next);
        };

        const getOverlayVectors = () => {
          const vectors = clickOverlayRef.current?.vectors;
          return Array.isArray(vectors) ? vectors : [];
        };

        const getVectorHitTargets = () => {
          const targets = [];
          getOverlayVectors().forEach((vectorSet) => {
            [vectorSet.sunArrow, vectorSet.satArrow, vectorSet.normalArrow].forEach((arrow) => {
              if (!arrow) return;
              if (arrow.line) targets.push(arrow.line);
              if (arrow.cone) targets.push(arrow.cone);
              if (arrow.userData?.shaft) targets.push(arrow.userData.shaft);
            });
            if (Array.isArray(vectorSet.angleArcs)) {
              vectorSet.angleArcs.forEach((arc) => { if (arc) targets.push(arc); });
            }
          });
          return targets;
        };

        const getMarkerHitTargets = () => {
          const markers = [];
          getOverlayVectors().forEach((vectorSet) => {
            if (vectorSet.marker) markers.push(vectorSet.marker);
          });
          return markers;
        };

        const getArrowByVectorKey = (vectorKey) => {
          if (!vectorKey) return null;
          const vectors = getOverlayVectors();
          for (let i = 0; i < vectors.length; i += 1) {
            const vectorSet = vectors[i];
            const arrows = [vectorSet.sunArrow, vectorSet.satArrow, vectorSet.normalArrow];
            for (let j = 0; j < arrows.length; j += 1) {
              const arrow = arrows[j];
              if (arrow?.cone?.userData?.vectorKey === vectorKey) return arrow;
            }
          }
          return null;
        };

        const setVectorHoverScale = (hoverKey) => {
          getOverlayVectors().forEach((vectorSet) => {
            [vectorSet.sunArrow, vectorSet.satArrow, vectorSet.normalArrow].forEach((arrow) => {
              if (!arrow) return;
              const key = arrow?.cone?.userData?.vectorKey || '';
              const isPinned = pinnedVectorKeysRef.current.has(key);
              const scale = (key === hoverKey || isPinned) ? 1.08 : 1.0;
              arrow.scale.setScalar(scale);
            });
          });
        };

        const setMarkerHoverState = (hoveredMarker = null) => {
          getOverlayVectors().forEach((vectorSet) => {
            const marker = vectorSet.marker;
            if (!marker || !marker.material) return;
            const isHovered = hoveredMarker === marker;
            marker.scale.setScalar(isHovered ? 1.35 : 1);
            marker.material.color.setHex(isHovered ? 0xff4040 : 0xffffff);
            marker.material.opacity = isHovered ? 1 : 0.95;
            marker.material.needsUpdate = true;
          });
        };

        const getHoveredVectorInfo = (event) => {
          if (!renderer || !camera || interactionRef.current.mode !== 'vector') return null;
          const hoverTargets = getVectorHitTargets();
          if (hoverTargets.length === 0) return null;

          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hits = raycaster.intersectObjects(hoverTargets, true);
          if (!hits || hits.length === 0) return null;

          const obj = hits[0].object;
          const key = obj?.userData?.vectorKey || null;
          const label = obj?.userData?.vectorLabel || '';
          const color = obj?.userData?.vectorColor || '#66ccff';
          if (!key || !label) return null;
          return {
            key,
            label,
            color,
            x: (event.clientX - rect.left) + 12,
            y: (event.clientY - rect.top) + 12,
          };
        };

        const getPointerAngleAroundCenter = (event) => {
          const rect = renderer.domElement.getBoundingClientRect();
          const cx = rect.left + (rect.width / 2);
          const cy = rect.top + (rect.height / 2);
          return Math.atan2(event.clientY - cy, event.clientX - cx);
        };

        const normalizeAngleDelta = (delta) => {
          if (delta > Math.PI) return delta - (Math.PI * 2);
          if (delta < -Math.PI) return delta + (Math.PI * 2);
          return delta;
        };

        const updateVectorHover = (event) => {
          if (!renderer || !camera || interactionRef.current.mode !== 'vector') {
            setVectorHoverScale(null);
            setMarkerHoverState(null);
            hideVectorTooltip();
            return;
          }
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const markerHits = raycaster.intersectObjects(getMarkerHitTargets(), true);
          const markerTargets = getMarkerHitTargets();
          let hoveredMarker = null;
          if (markerHits?.[0]?.object) {
            let candidate = markerHits[0].object;
            while (candidate) {
              if (markerTargets.includes(candidate)) {
                hoveredMarker = candidate;
                break;
              }
              candidate = candidate.parent;
            }
          }
          setMarkerHoverState(hoveredMarker);
          const info = getHoveredVectorInfo(event);
          if (!info) {
            hoveredVectorKeyRef.current = null;
            setVectorHoverScale(null);
            hideVectorTooltip();
            return;
          }
          hoveredVectorKeyRef.current = info.key;
          setVectorHoverScale(info.key);
          if (pinnedVectorKeysRef.current.has(info.key)) {
            hideVectorTooltip();
            return;
          }
          maybeUpdateTooltip({
            visible: true,
            text: info.label,
            x: info.x,
            y: info.y,
            color: info.color,
            pinned: false,
            key: info.key,
          });
        };

        pointerDownHandler = (event) => {
          if (cameraModeRef.current.preset !== 'none') {
            cameraModeRef.current.preset = 'none';
            if (presetReleaseRef.current) presetReleaseRef.current();
          }
          pointerStateRef.current.isPointerDown = true;
          pointerStateRef.current.downX = event.clientX;
          pointerStateRef.current.downY = event.clientY;
          pointerStateRef.current.wasDragging = false;

          const geometryMode = geometryModeRef.current;
          const mode = interactionRef.current.mode;
          if (geometryMode === 'camera' || mode !== 'vector' || !renderer || !camera) return;

          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);

          if (geometryMode === 'editTitan' && mesh) {
            const titanHits = raycaster.intersectObject(mesh, false);
            if (titanHits.length > 0) {
              activeGeometryDragRef.current = {
                type: 'titan',
                lastX: event.clientX,
                lastY: event.clientY,
                lastAngle: getPointerAngleAroundCenter(event),
              };
              controls.enabled = false;
            }
            return;
          }

          if (geometryMode === 'editCassini' && satelliteBody) {
            const satHits = raycaster.intersectObject(satelliteBody, true);
            if (satHits.length > 0) {
              activeGeometryDragRef.current = {
                type: 'cassini',
                lastX: event.clientX,
                lastY: event.clientY,
                lastAngle: getPointerAngleAroundCenter(event),
              };
              controls.enabled = false;
            }
          }
        };
        pointerMoveHandler = (event) => {
          const dragState = activeGeometryDragRef.current;
          if (dragState.type) {
            const dx = event.clientX - dragState.lastX;
            const dy = event.clientY - dragState.lastY;
            dragState.lastX = event.clientX;
            dragState.lastY = event.clientY;
            if ((dx * dx) + (dy * dy) > 0.2) {
              pointerStateRef.current.wasDragging = true;
            }

            if (dragState.type === 'titan') {
              let yawDeltaDeg = dx * 0.9;
              if (cameraModeRef.current.center === 'overhead' && Number.isFinite(dragState.lastAngle)) {
                const pointerAngle = getPointerAngleAroundCenter(event);
                const angleDelta = normalizeAngleDelta(pointerAngle - dragState.lastAngle);
                dragState.lastAngle = pointerAngle;
                yawDeltaDeg = -THREE.MathUtils.radToDeg(angleDelta);
              }
              const currentYawDeg = THREE.MathUtils.radToDeg(titanYawRadRef.current);
              const nextYawDeg = (((currentYawDeg + yawDeltaDeg) % 360) + 360) % 360;
              titanYawRadRef.current = THREE.MathUtils.degToRad(nextYawDeg);
              if (geometryChangeRef.current) geometryChangeRef.current({ titanYawDeg: nextYawDeg });
            } else if (dragState.type === 'cassini') {
              let phaseDeltaDeg = dx * 1.1;
              if (Number.isFinite(dragState.lastAngle)) {
                const pointerAngle = getPointerAngleAroundCenter(event);
                const angleDelta = normalizeAngleDelta(pointerAngle - dragState.lastAngle);
                dragState.lastAngle = pointerAngle;
                phaseDeltaDeg = -THREE.MathUtils.radToDeg(angleDelta);
              }
              const nextPhaseDeg = THREE.MathUtils.clamp(angleRef.current.phaseDeg + phaseDeltaDeg, 0, 355);
              angleRef.current.phaseDeg = nextPhaseDeg;
              if (geometryChangeRef.current) {
                geometryChangeRef.current({
                  phaseDeg: nextPhaseDeg,
                });
              }
            }
            return;
          }

          if (pointerStateRef.current.isPointerDown) {
            const dx = event.clientX - pointerStateRef.current.downX;
            const dy = event.clientY - pointerStateRef.current.downY;
            if ((dx * dx) + (dy * dy) > 25) {
              pointerStateRef.current.wasDragging = true;
            }
          }
          updateVectorHover(event);
        };
        pointerUpHandler = () => {
          pointerStateRef.current.isPointerDown = false;
          activeGeometryDragRef.current = { type: null, lastX: 0, lastY: 0, lastAngle: null };
          controls.enabled = true;
        };
        pointerLeaveHandler = () => {
          pointerStateRef.current.isPointerDown = false;
          activeGeometryDragRef.current = { type: null, lastX: 0, lastY: 0, lastAngle: null };
          controls.enabled = true;
          hoveredVectorKeyRef.current = null;
          setVectorHoverScale(null);
          setMarkerHoverState(null);
          hideVectorTooltip();
        };

        renderer.domElement.addEventListener('pointerdown', pointerDownHandler);
        renderer.domElement.addEventListener('pointermove', pointerMoveHandler);
        renderer.domElement.addEventListener('pointerup', pointerUpHandler);
        renderer.domElement.addEventListener('pointerleave', pointerLeaveHandler);

        clickHandler = (event) => {
          const mode = interactionRef.current.mode;
          if (mode !== 'vector' && mode !== 'plotPoint' && mode !== 'plotMultiple') return;
          if (mode === 'vector' && geometryModeRef.current !== 'camera') return;
          if (pointerStateRef.current.wasDragging) {
            pointerStateRef.current.wasDragging = false;
            return;
          }
          if (!renderer || !camera || !mesh || !scene) return;

          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);

          if (mode === 'vector') {
            const hovered = getHoveredVectorInfo(event);
            if (hovered) {
              if (pinnedVectorKeysRef.current.has(hovered.key)) {
                pinnedVectorKeysRef.current.delete(hovered.key);
              } else {
                pinnedVectorKeysRef.current.add(hovered.key);
              }
              setVectorHoverScale(hoveredVectorKeyRef.current);
              return;
            }

            const markerTargets = getMarkerHitTargets();
            const markerHits = raycaster.intersectObjects(markerTargets, true);
            if (markerHits && markerHits.length > 0) {
              let clickedMarker = null;
              let node = markerHits[0].object;
              while (node) {
                if (markerTargets.includes(node)) {
                  clickedMarker = node;
                  break;
                }
                node = node.parent;
              }
              if (clickedMarker) {
                const overlay = clickOverlayRef.current;
                const vectors = Array.isArray(overlay.vectors) ? overlay.vectors : [];
                const targetSet = vectors.find((set) => set.marker === clickedMarker);
                if (targetSet) {
                  const removeObjects = [
                    targetSet.marker,
                    targetSet.sunArrow,
                    targetSet.satArrow,
                    targetSet.normalArrow,
                    ...(targetSet.angleArcs || []),
                    ...(targetSet.angleLabels || []),
                    ...(targetSet.vectorLabels || []),
                    ...(targetSet.guideLines || []),
                  ];
                  removeObjects.forEach((obj) => {
                    if (!obj) return;
                    if (overlayScene) overlayScene.remove(obj);
                    obj.traverse((child) => {
                      if (child.geometry) child.geometry.dispose();
                      if (child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach((m) => {
                          if (m.map) m.map.dispose();
                          m.dispose();
                        });
                      }
                    });
                  });
                  overlay.vectors = vectors.filter((set) => set !== targetSet);
                  const last = overlay.vectors.length > 0 ? overlay.vectors[overlay.vectors.length - 1] : null;
                  overlay.marker = last?.marker || null;
                  overlay.sunArrow = last?.sunArrow || null;
                  overlay.satArrow = last?.satArrow || null;
                  overlay.normalArrow = last?.normalArrow || null;
                  const nextPinned = new Set();
                  pinnedVectorKeysRef.current.forEach((key) => {
                    if (getArrowByVectorKey(key)) nextPinned.add(key);
                  });
                  pinnedVectorKeysRef.current = nextPinned;
                  hoveredVectorKeyRef.current = null;
                  setVectorHoverScale(null);
                  setMarkerHoverState(null);
                  hideVectorTooltip();
                  maybeUpdatePinnedTooltips([]);
                  if (cameraModeRef.current.center === 'vector') {
                    controls.target.copy(last?.marker?.position || new THREE.Vector3(0, 0, 0));
                  }
                  return;
                }
              }
            }
          }

          const intersects = raycaster.intersectObject(mesh, false);
          if (intersects.length === 0) return;

          const hitPoint = intersects[0].point.clone();
          const normal = hitPoint.clone().normalize();
          const upRef = Math.abs(normal.y) < 0.95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
          const tangent = upRef.clone().cross(normal).normalize();
          const bitangent = normal.clone().cross(tangent).normalize();

          if (mode !== 'vector' || !allowMultipleVectorsRef.current) {
            clearClickOverlay(overlayScene, clickOverlayRef);
            pinnedVectorKeysRef.current = new Set();
            maybeUpdatePinnedTooltips([]);
            setVectorHoverScale(null);
            setMarkerHoverState(null);
            hideVectorTooltip();
          }
          const origin = hitPoint.clone().add(normal.clone().multiplyScalar(0.004));

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
            overlayScene.add(plotCross);

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
            clickOverlayRef.current = { marker: null, sunArrow: null, satArrow: null, normalArrow: null, plotCross, vectors: [] };
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
            new THREE.MeshBasicMaterial({
              color: 0xffffff,
              transparent: true,
              opacity: 0.95,
              depthTest: false,
              depthWrite: false,
              toneMapped: false,
            })
          );
          marker.position.copy(hitPoint.clone().add(normal.clone().multiplyScalar(0.014)));
          marker.renderOrder = 1004;
          overlayScene.add(marker);

          const arrowLength = 0.68;
          const normalLength = arrowLength * 0.75;
          const getDirectionFromClickToTarget = (target) => {
            const d = target.clone().sub(origin);
            if (d.lengthSq() < 1e-8) return normal.clone();
            return d.normalize();
          };
          const sunDirection = getDirectionFromClickToTarget(sunBody.position);
          const satDirection = getDirectionFromClickToTarget(satelliteBody.position);
          const normalDirection = normal.clone();
          const sunHeadLength = 0.12;
          const satHeadLength = 0.12;
          const normalHeadLength = 0.1;
          const sunArrow = new THREE.ArrowHelper(sunDirection, origin, arrowLength, 0xffc94a, sunHeadLength, 0.06);
          const satArrow = new THREE.ArrowHelper(satDirection, origin, arrowLength, 0x66ccff, satHeadLength, 0.06);
          const normalArrow = new THREE.ArrowHelper(normalDirection, origin, normalLength, 0x66ff66, normalHeadLength, 0.05);
          const vectorId = vectorIdCounterRef.current;
          vectorIdCounterRef.current += 1;

          const addVectorShaft = (arrow, colorHex, length = 0.43) => {
            const shaft = new THREE.Mesh(
              new THREE.CylinderGeometry(0.009, 0.009, length, 14),
              new THREE.MeshBasicMaterial({
                color: colorHex,
                depthTest: false,
                depthWrite: false,
                transparent: true,
                opacity: 1,
                toneMapped: false,
              })
            );
            shaft.position.set(0, length / 2, 0);
            shaft.renderOrder = 1006;
            arrow.add(shaft);
            arrow.userData.shaft = shaft;
            return shaft;
          };
          const setVectorMeta = (obj, keySuffix, label, color) => {
            const vectorKey = `v${vectorId}:${keySuffix}`;
            obj.userData.vectorKey = vectorKey;
            obj.userData.vectorLabel = label;
            obj.userData.vectorColor = color;
          };
          setVectorMeta(sunArrow.line, 'sun', 'Sun Vector', '#ffc94a');
          setVectorMeta(sunArrow.cone, 'sun', 'Sun Vector', '#ffc94a');
          setVectorMeta(satArrow.line, 'sat', 'Spacecraft Vector', '#66ccff');
          setVectorMeta(satArrow.cone, 'sat', 'Spacecraft Vector', '#66ccff');
          setVectorMeta(normalArrow.line, 'normal', 'Surface Normal', '#66ff66');
          setVectorMeta(normalArrow.cone, 'normal', 'Surface Normal', '#66ff66');
          const sunShaft = addVectorShaft(sunArrow, 0xffc94a, Math.max(0.05, arrowLength - sunHeadLength));
          const satShaft = addVectorShaft(satArrow, 0x66ccff, Math.max(0.05, arrowLength - satHeadLength));
          const normalShaft = addVectorShaft(normalArrow, 0x66ff66, Math.max(0.05, normalLength - normalHeadLength));
          setVectorMeta(sunShaft, 'sun', 'Sun Vector', '#ffc94a');
          setVectorMeta(satShaft, 'sat', 'Spacecraft Vector', '#66ccff');
          setVectorMeta(normalShaft, 'normal', 'Surface Normal', '#66ff66');
          [sunArrow, satArrow, normalArrow].forEach((arrow) => {
            arrow.frustumCulled = false;
            arrow.line.frustumCulled = false;
            arrow.cone.frustumCulled = false;
            arrow.line.material.depthTest = false;
            arrow.line.material.depthWrite = false;
            const coneColor = arrow.cone.userData.vectorColor || '#66ccff';
            arrow.cone.material = new THREE.MeshBasicMaterial({
              color: coneColor,
              depthTest: false,
              depthWrite: false,
              transparent: false,
              opacity: 1,
              toneMapped: false,
            });
            arrow.line.material.transparent = false;
            arrow.line.material.opacity = 1;
            arrow.line.material.toneMapped = false;
            arrow.line.material.blending = THREE.NormalBlending;
            arrow.line.renderOrder = 1006;
            arrow.cone.renderOrder = 1006;
          });
          sunArrow.setLength(arrowLength, sunHeadLength, 0.06);
          satArrow.setLength(arrowLength, satHeadLength, 0.06);
          normalArrow.setLength(normalLength, normalHeadLength, 0.05);
          overlayScene.add(sunArrow);
          overlayScene.add(satArrow);
          overlayScene.add(normalArrow);

          const guideLines = [];
          const addGuideLine = (direction, distance, colorHex) => {
            const points = [
              origin.clone(),
              origin.clone().add(direction.clone().multiplyScalar(Math.max(0.2, distance))),
            ];
            const guide = new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(points),
              new THREE.LineBasicMaterial({
                color: colorHex,
                transparent: true,
                opacity: 0.55,
                depthTest: false,
                depthWrite: false,
                toneMapped: false,
              })
            );
            guide.renderOrder = 1002;
            guide.visible = showExtendedVectorLinesRef.current;
            overlayScene.add(guide);
            guideLines.push(guide);
          };
          addGuideLine(sunDirection, origin.distanceTo(sunBody.position), 0xffc94a);
          addGuideLine(satDirection, origin.distanceTo(satelliteBody.position), 0x66ccff);
          addGuideLine(normalDirection, 1.1, 0x66ff66);

          const vectorLabels = [];

          const angleArcs = [];
          const angleLabels = [];
          const createAngleArc = (angleKeySuffix, startDir, endDir, radius, colorHex, labelText, labelColor) => {
            const start = startDir.clone().normalize();
            const end = endDir.clone().normalize();
            const angle = THREE.MathUtils.clamp(start.angleTo(end), 0, Math.PI);
            if (angle < 1e-4) return;
            let axis = start.clone().cross(end);
            if (axis.lengthSq() < 1e-8) return;
            axis.normalize();
            const segments = 28;
            [-0.006, 0, 0.006].forEach((radiusOffset) => {
              const points = [];
              for (let i = 0; i <= segments; i += 1) {
                const t = i / segments;
                const dir = start.clone().applyAxisAngle(axis, angle * t).normalize();
                points.push(origin.clone().add(dir.multiplyScalar(radius + radiusOffset)).add(normal.clone().multiplyScalar(0.01)));
              }
              const geometryArc = new THREE.BufferGeometry().setFromPoints(points);
              const line = new THREE.Line(
                geometryArc,
                new THREE.LineBasicMaterial({
                  color: colorHex,
                  transparent: true,
                  opacity: 1,
                  depthTest: false,
                  depthWrite: false,
                  toneMapped: false,
                })
              );
              line.renderOrder = 1008;
              line.userData.vectorKey = `v${vectorId}:angle:${angleKeySuffix}`;
              line.userData.vectorLabel = labelText;
              line.userData.vectorColor = labelColor;
              line.visible = showAngleArcsRef.current;
              overlayScene.add(line);
              angleArcs.push(line);
            });
          };

          const incidenceDeg = THREE.MathUtils.radToDeg(normalDirection.angleTo(sunDirection));
          const emissionDeg = THREE.MathUtils.radToDeg(normalDirection.angleTo(satDirection));
          const phaseDegActual = THREE.MathUtils.radToDeg(sunDirection.angleTo(satDirection));
          createAngleArc('incidence', normalDirection, sunDirection, 0.28, 0xff4db8, `Incidence ${incidenceDeg.toFixed(1)}°`, '#ff4db8');
          createAngleArc('emission', normalDirection, satDirection, 0.34, 0xff7a33, `Emission ${emissionDeg.toFixed(1)}°`, '#ff7a33');
          createAngleArc('phase', sunDirection, satDirection, 0.40, 0xb27aff, `Phase ${phaseDegActual.toFixed(1)}°`, '#b27aff');

          const overlay = clickOverlayRef.current;
          if (!Array.isArray(overlay.vectors)) overlay.vectors = [];
          const vectorSet = {
            id: vectorId,
            marker,
            sunArrow,
            satArrow,
            normalArrow,
            angleArcs,
            angleLabels,
            vectorLabels,
            guideLines,
          };
          overlay.vectors.push(vectorSet);
          overlay.plotCross = null;
          overlay.marker = marker;
          overlay.sunArrow = sunArrow;
          overlay.satArrow = satArrow;
          overlay.normalArrow = normalArrow;

          // After placing a vector, center camera target on it immediately.
          controls.target.copy(marker.position);
          controls.update();
          if (vectorPlacedRef.current) {
            vectorPlacedRef.current({
              x: marker.position.x,
              y: marker.position.y,
              z: marker.position.z,
            });
          }
        };
        renderer.domElement.addEventListener('click', clickHandler);

        sunPointLight = new THREE.PointLight(0xfff0cc, 62.1, 65);
        sunPointLight.castShadow = true;
        sunPointLight.shadow.mapSize.width = 1024;
        sunPointLight.shadow.mapSize.height = 1024;
        sunPointLight.shadow.bias = -0.0002;
        sunPointLight.shadow.normalBias = 0.015;
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
          const sunDistance = (3.6 + (incidenceNorm * 1.4)) * 2.0;

          satTargetPos.copy(satDirection.multiplyScalar(satDistance));
          sunTargetPos.copy(sunDirection.multiplyScalar(sunDistance));
        };
        updateSunSatelliteWorldPositions();

        const getVectorCameraTarget = () => {
          const marker = clickOverlayRef.current?.marker;
          return marker ? marker.position.clone() : new THREE.Vector3(0, 0, 0);
        };

        const getDefaultCameraTarget = () => {
          if (cameraModeRef.current.center === 'vector') {
            return getVectorCameraTarget();
          }
          if (cameraModeRef.current.center === 'spacecraft' && satelliteBody) {
            return satelliteBody.position.clone();
          }
          return new THREE.Vector3(0, 0, 0);
        };

        const getCassiniCameraPose = (withHideFlags = true) => {
          if (!sunBody || !satelliteBody) return null;
          const origin = new THREE.Vector3(0, 0, 0);
          const satPos = satelliteBody.position.clone();
          const toTitan = origin.clone().sub(satPos).normalize();
          let side = new THREE.Vector3(0, 1, 0).cross(toTitan);
          if (side.lengthSq() < 1e-8) side = new THREE.Vector3(1, 0, 0);
          side.normalize();
          const position = satPos.clone()
            .addScaledVector(side, 0.03)
            .addScaledVector(toTitan, 0.14);
          const target = origin;
          return withHideFlags
            ? { position, target, hideSpacecraft: true, hideSun: false }
            : { position, target };
        };

        const getSunCameraPose = (withHideFlags = true) => {
          if (!sunBody || !satelliteBody) return null;
          const origin = new THREE.Vector3(0, 0, 0);
          const sunPos = sunBody.position.clone();
          const toTitan = origin.clone().sub(sunPos).normalize();
          const position = sunPos.clone().addScaledVector(toTitan, -0.35);
          const target = origin;
          return withHideFlags
            ? { position, target, hideSpacecraft: false, hideSun: true }
            : { position, target };
        };

        const getPresetCameraPose = () => {
          const preset = cameraModeRef.current.preset;
          if (preset === 'cassini') return getCassiniCameraPose(true);
          if (preset === 'sun') return getSunCameraPose(true);
          return null;
        };

        introStateRef.current = {
          active: introEnabledRef.current,
          startMs: performance.now(),
          durationMs: 4800,
        };

        function animate() {
          if (cancelled) return;
          animationIdRef.current = requestAnimationFrame(animate);
          if (controls && renderer && scene && camera) {
            if (starsNear) starsNear.rotation.y += 0.00006;
            if (starsFar) {
              starsFar.rotation.y -= 0.00003;
              starsFar.rotation.x += 0.000015;
            }
            updateSunSatelliteWorldPositions();
            satelliteBody.position.lerp(satTargetPos, 0.12);
            satelliteBody.lookAt(0, 0, 0);
            sunBody.position.lerp(sunTargetPos, 0.1);
            if (sunPointLight) sunPointLight.position.copy(sunBody.position);
            if (sunGlow) sunGlow.position.copy(sunBody.position);
            const presetPose = getPresetCameraPose();
            const introState = introStateRef.current;
            const now = performance.now();
            const introElapsed = now - introState.startMs;
            const introT = introState.durationMs > 0
              ? THREE.MathUtils.clamp(introElapsed / introState.durationMs, 0, 1)
              : 1;
            const introEase = 1 - ((1 - introT) ** 3);
            const introActive = introState.active && introT < 1;

            if (satelliteBody) {
              satelliteBody.visible = !(presetPose?.hideSpacecraft && !introActive);
            }
            if (sunBody) {
              sunBody.visible = !(presetPose?.hideSun && !introActive);
            }
            if (sunGlow) {
              sunGlow.visible = sunBody ? sunBody.visible : true;
            }

            const insideFadeOpacity = 0.62;
            const normalOpacity = 1.0;
            const cameraPos = camera.position;
            const titanInside = cameraPos.length() < 1.02;
            material.opacity = titanInside ? insideFadeOpacity : normalOpacity;
            material.transparent = true;
            material.emissive.setHex(0x505050);
            material.emissiveIntensity = titanInside ? 0.45 : 0.08;
            const overlayMarker = clickOverlayRef.current?.marker;
            let overlayOpacity = titanInside ? 0.72 : 1.0;
            if (!titanInside && overlayMarker) {
              const camDir = cameraPos.clone().normalize();
              const markerDir = overlayMarker.position.clone().normalize();
              const clearlyBackside = camDir.dot(markerDir) < -0.78;
              const occluded = clearlyBackside && isPointOccludedByTitan(cameraPos, overlayMarker.position, 1.0);
              overlayOpacity = occluded ? 0.72 : 1.0;
            }
            setOverlayOpacity(clickOverlayRef.current, overlayOpacity);
            if (sunBody) {
              const sunInside = cameraPos.distanceTo(sunBody.position) < (sunVisualRadius * 1.05);
              makeObjectSemiTransparent(sunBody, sunInside ? insideFadeOpacity : normalOpacity);
            }
            if (satelliteBody) {
              const satInside = cameraPos.distanceTo(satelliteBody.position) < (cassiniVisualRadius * 1.1);
              makeObjectSemiTransparent(satelliteBody, satInside ? insideFadeOpacity : normalOpacity);
              const overheadIllumination = cameraModeRef.current.center === 'overhead' ? 0.24 : 0;
              setObjectIllumination(satelliteBody, overheadIllumination);
            }

            if (cameraModeRef.current.center === 'overhead' && introState.active) {
              introState.active = false;
            }

            if (introActive && cameraModeRef.current.center !== 'overhead') {
              const finalPose = presetPose || getCassiniCameraPose(false) || {
                position: defaultCameraOffset.clone(),
                target: getDefaultCameraTarget(),
              };
              const introOffset = new THREE.Vector3(0, 3.2, 17.5).multiplyScalar(1 - introEase);
              introOffset.applyAxisAngle(
                new THREE.Vector3(0, 1, 0),
                (1 - introEase) * THREE.MathUtils.degToRad(220)
              );
              camera.position.copy(finalPose.position.clone().add(introOffset));
              controls.target.set(0, 0, 0).lerp(finalPose.target, introEase);
              camera.lookAt(controls.target);
              controls.enableRotate = false;

              const spin = (1 - introEase) * (Math.PI * 2.2);
              mesh.rotation.y = baseTitanYaw + titanYawRadRef.current + spin;
              mesh.rotation.z = obliquityRadRef.current;
              if (atmosphereRef.current) {
                atmosphereRef.current.rotation.y = mesh.rotation.y;
                atmosphereRef.current.rotation.z = mesh.rotation.z;
              }
              if (atmosphereGlowRef.current) {
                atmosphereGlowRef.current.rotation.y = mesh.rotation.y;
                atmosphereGlowRef.current.rotation.z = mesh.rotation.z;
              }
              if (rotationAxisRef.current) rotationAxisRef.current.rotation.z = obliquityRadRef.current;
              if (sunBody) sunBody.rotation.y = spin * 0.5;
              if (satelliteBody) satelliteBody.rotation.y = spin * 0.35;
            } else {
              if (introState.active) {
                introState.active = false;
              }
              mesh.rotation.y = baseTitanYaw + titanYawRadRef.current;
              mesh.rotation.z = obliquityRadRef.current;
              if (atmosphereRef.current) {
                atmosphereRef.current.rotation.y = mesh.rotation.y;
                atmosphereRef.current.rotation.z = mesh.rotation.z;
              }
              if (atmosphereGlowRef.current) {
                atmosphereGlowRef.current.rotation.y = mesh.rotation.y;
                atmosphereGlowRef.current.rotation.z = mesh.rotation.z;
              }
              if (rotationAxisRef.current) rotationAxisRef.current.rotation.z = obliquityRadRef.current;
              if (sunBody) sunBody.rotation.y = 0;
              if (satelliteBody) satelliteBody.rotation.y = 0;

              if (presetPose) {
                controls.enableRotate = geometryModeRef.current === 'camera';
                controls.minDistance = 0.03;
                controls.maxDistance = 12;
                controls.minPolarAngle = Math.PI / 2;
                controls.maxPolarAngle = Math.PI / 2;
                camera.position.lerp(presetPose.position, 0.18);
                controls.target.lerp(presetPose.target, 0.22);
                camera.lookAt(controls.target);
              } else {
                const isOverheadCenter = cameraModeRef.current.center === 'overhead';
                controls.enableRotate = geometryModeRef.current === 'camera' && !isOverheadCenter;
                if (isOverheadCenter) {
                  pendingSpacecraftAutoZoomRef.current = false;
                  controls.minDistance = 2.5;
                  controls.maxDistance = 28;
                  controls.minPolarAngle = 0.02;
                  controls.maxPolarAngle = 0.02;
                  controls.enableDamping = false;
                  const northPoleDir = new THREE.Vector3(0, 1, 0)
                    .applyAxisAngle(new THREE.Vector3(0, 0, 1), obliquityRadRef.current)
                    .normalize();
                  const overheadTarget = new THREE.Vector3(0, 0, 0);
                  const currentDistance = camera.position.distanceTo(controls.target);
                  const desiredDistance = pendingOverheadSnapRef.current
                    ? 17.5
                    : THREE.MathUtils.clamp(currentDistance, controls.minDistance, controls.maxDistance);
                  pendingOverheadSnapRef.current = false;
                  const overheadPos = overheadTarget.clone()
                    .addScaledVector(northPoleDir, desiredDistance)
                    .add(new THREE.Vector3(0.001, 0, 0));
                  controls.target.copy(overheadTarget);
                  camera.position.copy(overheadPos);
                  camera.lookAt(controls.target);
                } else if (cameraModeRef.current.center === 'vector') {
                  controls.enableDamping = true;
                  pendingSpacecraftAutoZoomRef.current = false;
                  controls.minDistance = 0.02;
                  controls.maxDistance = 12;
                  controls.minPolarAngle = 0.02;
                  controls.maxPolarAngle = Math.PI - 0.02;
                  const vectorTarget = getVectorCameraTarget();
                  controls.target.copy(vectorTarget);
                } else if (cameraModeRef.current.center === 'spacecraft' && satelliteBody) {
                  controls.enableDamping = true;
                  controls.minDistance = 0.02;
                  controls.maxDistance = 12.0;
                  controls.minPolarAngle = Math.PI / 2;
                  controls.maxPolarAngle = Math.PI / 2;
                  controls.target.lerp(satelliteBody.position, 0.12);
                  if (pendingSpacecraftAutoZoomRef.current) {
                    const camDir = camera.position.clone().sub(controls.target);
                    if (camDir.lengthSq() < 1e-8) camDir.set(0, 0, 1);
                    camDir.normalize();
                    const desiredPos = controls.target.clone().addScaledVector(camDir, 0.7);
                    camera.position.lerp(desiredPos, 0.14);
                    if (camera.position.distanceTo(desiredPos) < 0.035) {
                      pendingSpacecraftAutoZoomRef.current = false;
                    }
                  }
                } else {
                  controls.enableDamping = true;
                  pendingSpacecraftAutoZoomRef.current = false;
                  controls.minDistance = 0.02;
                  controls.maxDistance = 7;
                  controls.minPolarAngle = Math.PI / 2;
                  controls.maxPolarAngle = Math.PI / 2;
                  controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.18);
                }
              }
            }

            controls.update();
            if (renderer) {
              const rw = renderer.domElement.clientWidth || 1;
              const rh = renderer.domElement.clientHeight || 1;
              const nextPinnedTooltips = [];
              const keysToRemove = [];
              Array.from(pinnedVectorKeysRef.current).forEach((key) => {
                const arrow = getArrowByVectorKey(key);
                if (!arrow?.cone) {
                  keysToRemove.push(key);
                  return;
                }
                const world = arrow.cone.getWorldPosition(new THREE.Vector3());
                const projected = world.clone().project(camera);
                const label = arrow.cone.userData?.vectorLabel || '';
                const color = arrow.cone.userData?.vectorColor || '#66ccff';
                if (!label) return;
                nextPinnedTooltips.push({
                  key,
                  text: label,
                  color,
                  x: (projected.x * 0.5 + 0.5) * rw + 10,
                  y: (-projected.y * 0.5 + 0.5) * rh + 10,
                });
              });
              if (keysToRemove.length > 0) {
                keysToRemove.forEach((key) => pinnedVectorKeysRef.current.delete(key));
              }
              maybeUpdatePinnedTooltips(nextPinnedTooltips);
            }
            if (sunGlow) {
              sunGlow.scale.set(1.25, 1.25, 1);
            }
            if (composer) composer.render();
            else renderer.render(scene, camera);
            if (overlayScene) {
              renderer.autoClear = false;
              renderer.clearDepth();
              renderer.render(overlayScene, camera);
              renderer.autoClear = true;
            }
          }
        }
        animate();

        window.addEventListener('resize', onResize);
        resizeCleanupRef.current = () => window.removeEventListener('resize', onResize);

        loadHeightMap()
          .then((heightTex) => {
            if (cancelled) return;
            if (textureRef.current) textureRef.current.dispose();
            textureRef.current = heightTex;
            material.map = heightTex;
            material.needsUpdate = true;
          })
          .catch((err) => {
            if (!cancelled) setError(err.message || 'Failed to load texture');
          })
          .finally(() => {
            if (!cancelled) {
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
      if (renderer && pointerLeaveHandler) renderer.domElement.removeEventListener('pointerleave', pointerLeaveHandler);
      clearClickOverlay(overlayScene, clickOverlayRef);
      setVectorTooltip({ visible: false, text: '', x: 0, y: 0, color: '#66ccff', pinned: false, key: null });
      setPinnedVectorTooltips([]);
      if (starsNear) {
        starsNear.geometry.dispose();
        starsNear.material.dispose();
      }
      if (starsFar) {
        starsFar.geometry.dispose();
        starsFar.material.dispose();
      }
      if (sunBody) {
        sunBody.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          }
        });
      }
      if (satelliteBody) {
        satelliteBody.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          }
        });
      }
      if (sunPointLight && scene) {
        scene.remove(sunPointLight);
      }
      if (sunGlow && scene) {
        scene.remove(sunGlow);
      }
      if (sunGlow) {
        if (sunGlow.material) sunGlow.material.dispose();
      }
      if (sunGlowTexture) {
        sunGlowTexture.dispose();
      }
      if (multiPointGroupRef.current && scene) {
        scene.remove(multiPointGroupRef.current);
      }
      if (geometryGridRef.current && scene) {
        scene.remove(geometryGridRef.current);
      }
      if (rotationAxisRef.current && scene) {
        scene.remove(rotationAxisRef.current);
      }
      if (atmosphereRef.current && scene) {
        scene.remove(atmosphereRef.current);
      }
      if (atmosphereGlowRef.current && scene) {
        scene.remove(atmosphereGlowRef.current);
      }
      if (renderer) {
        renderer.dispose();
        const parent = renderer.domElement && renderer.domElement.parentNode;
        if (parent) parent.removeChild(renderer.domElement);
      }
      if (composer && composer.dispose) composer.dispose();
      if (mesh) {
        mesh.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          }
        });
      }
      if (geometry) geometry.dispose();
      if (material) material.dispose();
      if (textureRef.current) {
        textureRef.current.dispose();
        textureRef.current = null;
      }
      if (atmosphereRef.current) {
        atmosphereRef.current.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          }
        });
        atmosphereRef.current = null;
      }
      if (atmosphereGlowRef.current) {
        atmosphereGlowRef.current.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
          }
        });
        atmosphereGlowRef.current = null;
      }
      sceneRef.current = null;
      overlaySceneRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
      meshRef.current = null;
      multiPointGroupRef.current = null;
      geometryGridRef.current = null;
    };
  }, []);

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

  const handleZoomIn = () => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    if (cameraModeRef.current.preset !== 'none') {
      cameraModeRef.current.preset = 'none';
      if (presetReleaseRef.current) presetReleaseRef.current();
    }
    const dir = camera.position.clone().sub(controls.target);
    const dist = Math.max(0.02, dir.length() / 1.22);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    dir.normalize();
    camera.position.copy(controls.target.clone().addScaledVector(dir, dist));
    controls.update();
  };

  const handleZoomOut = () => {
    const controls = controlsRef.current;
    const camera = cameraRef.current;
    if (!controls || !camera) return;
    if (cameraModeRef.current.preset !== 'none') {
      cameraModeRef.current.preset = 'none';
      if (presetReleaseRef.current) presetReleaseRef.current();
    }
    const dir = camera.position.clone().sub(controls.target);
    const dist = Math.min(25, dir.length() * 1.22);
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    dir.normalize();
    camera.position.copy(controls.target.clone().addScaledVector(dir, dist));
    controls.update();
  };

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
      <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 5, display: 'flex', gap: 6 }}>
        <button type="button" onClick={handleZoomIn} style={zoomButtonStyle3d}>+</button>
        <button type="button" onClick={handleZoomOut} style={zoomButtonStyle3d}>-</button>
      </div>
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
      {pinnedVectorTooltips.map((tip) => (
        <div
          key={tip.key}
          style={{
            position: 'absolute',
            left: tip.x,
            top: tip.y,
            transform: 'translate(0, -100%)',
            zIndex: 1001,
            pointerEvents: 'none',
            background: 'rgba(8, 14, 24, 0.92)',
            border: `1px solid ${tip.color || '#66ccff'}`,
            borderRadius: '4px',
            padding: '4px 8px',
            color: '#d7f2ff',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            boxShadow: `0 0 8px ${tip.color || '#66ccff'}55`,
          }}
        >
          {tip.text}
        </div>
      ))}
      {vectorTooltip.visible && (
        <div
          style={{
            position: 'absolute',
            left: vectorTooltip.x,
            top: vectorTooltip.y,
            transform: 'translate(0, -100%)',
            zIndex: 1002,
            pointerEvents: 'none',
            background: 'rgba(8, 14, 24, 0.92)',
            border: `1px solid ${vectorTooltip.color || '#66ccff'}`,
            borderRadius: '4px',
            padding: '4px 8px',
            color: '#d7f2ff',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            boxShadow: `0 0 8px ${vectorTooltip.color || '#66ccff'}55`,
          }}
        >
          {vectorTooltip.text}
        </div>
      )}
      {loading && (
        <div style={loadingOverlayStyle}>
          <div className="loading-spinner" />
          <p>Loading surface...</p>
        </div>
      )}
    </div>
  );
}

function clearClickOverlay(scene, clickOverlayRef) {
  const overlay = clickOverlayRef.current;
  if (!overlay) return;
  const vectors = Array.isArray(overlay.vectors) ? overlay.vectors : [];
  vectors.forEach((vectorSet) => {
    const objects = [
      vectorSet.marker,
      vectorSet.sunArrow,
      vectorSet.satArrow,
      vectorSet.normalArrow,
      ...(vectorSet.angleArcs || []),
      ...(vectorSet.angleLabels || []),
      ...(vectorSet.vectorLabels || []),
      ...(vectorSet.guideLines || []),
    ];
    objects.forEach((obj) => {
      if (!obj) return;
      if (scene) scene.remove(obj);
      obj.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => {
            if (m.map) m.map.dispose();
            m.dispose();
          });
        }
      });
    });
  });
  if (overlay.plotCross) {
    if (scene) scene.remove(overlay.plotCross);
    overlay.plotCross.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
  }
  overlay.marker = null;
  overlay.sunArrow = null;
  overlay.satArrow = null;
  overlay.normalArrow = null;
  overlay.plotCross = null;
  overlay.vectors = [];
}

function setOverlayOpacity(overlay, opacity) {
  if (!overlay) return;
  const clamped = Math.max(0.1, Math.min(1, opacity));
  const objects = [overlay.plotCross];
  if (Array.isArray(overlay.vectors)) {
    overlay.vectors.forEach((vectorSet) => {
      objects.push(
        vectorSet.marker,
        vectorSet.sunArrow,
        vectorSet.satArrow,
        vectorSet.normalArrow,
        ...(vectorSet.angleArcs || []),
        ...(vectorSet.angleLabels || []),
        ...(vectorSet.vectorLabels || []),
        ...(vectorSet.guideLines || []),
      );
    });
  } else {
    objects.push(overlay.marker, overlay.sunArrow, overlay.satArrow, overlay.normalArrow);
  }
  objects.forEach((obj) => {
    if (!obj) return;
    obj.traverse((child) => {
      if (!child.material) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((m) => {
        m.transparent = clamped < 1;
        m.opacity = clamped;
        m.needsUpdate = true;
      });
    });
  });
}

function createTextSprite(text, color = '#d7f2ff') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 196;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffffff, depthTest: false, depthWrite: false }));
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8, 14, 24, 0.92)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 6;
  roundRect(ctx, 8, 8, canvas.width - 16, canvas.height - 16, 22);
  ctx.fill();
  ctx.stroke();
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.frustumCulled = false;
  return sprite;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function isPointOccludedByTitan(cameraPos, pointPos, titanRadius = 1.0) {
  const dir = pointPos.clone().sub(cameraPos);
  const segLen = dir.length();
  if (segLen <= 1e-8) return false;
  dir.divideScalar(segLen);

  // Ray-segment intersection with sphere centered at origin.
  const a = 1;
  const b = 2 * cameraPos.dot(dir);
  const c = cameraPos.lengthSq() - (titanRadius * titanRadius);
  const disc = (b * b) - (4 * a * c);
  if (disc < 0) return false;
  const sqrtDisc = Math.sqrt(disc);
  const t1 = (-b - sqrtDisc) / (2 * a);
  const t2 = (-b + sqrtDisc) / (2 * a);

  const epsilon = 1e-4;
  const hit1OnSegment = t1 > epsilon && t1 < (segLen - epsilon);
  const hit2OnSegment = t2 > epsilon && t2 < (segLen - epsilon);
  return hit1OnSegment || hit2OnSegment;
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

const zoomButtonStyle3d = {
  width: '28px',
  height: '28px',
  borderRadius: '4px',
  border: '1px solid #66ccff',
  background: '#101820',
  color: '#e9f8ff',
  fontSize: '18px',
  lineHeight: '24px',
  cursor: 'pointer',
};

export default SphereView;
