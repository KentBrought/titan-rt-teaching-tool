import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { loadHeightMap } from '../utils/heightMapLoader';

function SphereView({
  minHeight = 400,
  incidenceDeg = 45,
  emissionDeg = 45,
  phaseDeg = 0,
  cameraPreset = 'none', // 'none' | 'cassini' | 'sun'
  cameraCenter = 'titan', // 'titan' | 'spacecraft'
  introAnimation = true,
  showLatLonGrid = false,
  showRotationAxis = false,
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
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const controlsRef = useRef(null);
  const animationIdRef = useRef(null);
  const textureRef = useRef(null);
  const cameraRef = useRef(null);
  const meshRef = useRef(null);
  const multiPointGroupRef = useRef(null);
  const resizeCleanupRef = useRef(null);
  const cameraModeRef = useRef({ preset: 'none', center: 'titan' });
  const introStateRef = useRef({ active: true, startMs: 0, durationMs: 3400 });
  const introEnabledRef = useRef(!!introAnimation);
  const prevCameraCenterRef = useRef('titan');
  const pendingSpacecraftAutoZoomRef = useRef(false);
  const latLonGridRef = useRef(null);
  const latLonLabelsRef = useRef(null);
  const latLonGridEnabledRef = useRef(!!showLatLonGrid);
  const rotationAxisRef = useRef(null);
  const rotationAxisEnabledRef = useRef(!!showRotationAxis);

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
    const preset = cameraPreset === 'cassini' || cameraPreset === 'sun' ? cameraPreset : 'none';
    const center = cameraCenter === 'spacecraft' ? 'spacecraft' : 'titan';
    cameraModeRef.current = { preset, center };
    if (prevCameraCenterRef.current !== center && center === 'spacecraft') {
      pendingSpacecraftAutoZoomRef.current = true;
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
    rotationAxisEnabledRef.current = !!showRotationAxis;
    if (rotationAxisRef.current) rotationAxisRef.current.visible = !!showRotationAxis;
  }, [showRotationAxis]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      setError('Container ref not set');
      return;
    }

    let cancelled = false;
    let scene, camera, renderer, controls, geometry, material, mesh;
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
    let cassiniVisualRadius = 0.16;
    let clickHandler = null;
    let pointerDownHandler = null;
    let pointerMoveHandler = null;
    let pointerUpHandler = null;
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
        const bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.35, 0.1);
        composer.addPass(bloomPass);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enablePan = false;
        controls.minDistance = 2.2;
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
        mesh.rotation.y = baseTitanYaw;
        meshRef.current = mesh;
        scene.add(mesh);

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

        const sunLoader = new USDZLoader();
        sunLoader.load(
          `${process.env.PUBLIC_URL}/assets/3d-model/Sun.usdz`,
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

            sunVisualRadius = targetSize * 0.5;
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
        gltfLoader.load(
          `${process.env.PUBLIC_URL}/assets/3d-model/Cassini.glb`,
          (gltf) => {
            if (cancelled || !satelliteBody) return;
            const cassiniModel = gltf.scene;
            cassiniModel.updateMatrixWorld(true);

            const box = new THREE.Box3().setFromObject(cassiniModel);
            const size = new THREE.Vector3();
            box.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z) || 1;
            const targetSize = 0.22;
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
          },
          undefined,
          () => {
            if (cancelled || !satelliteBody) return;
            const fallback = new THREE.Mesh(
              new THREE.SphereGeometry(0.09, 20, 20),
              new THREE.MeshStandardMaterial({
                color: 0xa8a8a8,
                roughness: 0.85,
                metalness: 0.2,
                transparent: true,
                opacity: 1,
                side: THREE.DoubleSide,
              })
            );
            fallback.castShadow = false;
            fallback.receiveShadow = false;
            cassiniAnchor.add(fallback);
            cassiniVisualRadius = 0.09;
          }
        );

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
            arrow.frustumCulled = false;
            arrow.line.frustumCulled = false;
            arrow.cone.frustumCulled = false;
            arrow.line.material.depthTest = false;
            arrow.line.material.depthWrite = false;
            arrow.cone.material.depthTest = false;
            arrow.cone.material.depthWrite = false;
            arrow.line.material.transparent = true;
            arrow.line.material.opacity = 1;
            arrow.cone.material.transparent = true;
            arrow.cone.material.opacity = 1;
            arrow.line.material.toneMapped = false;
            arrow.cone.material.toneMapped = false;
            arrow.line.renderOrder = 998;
            arrow.cone.renderOrder = 998;
          });
          scene.add(sunArrow);
          scene.add(satArrow);
          clickOverlayRef.current = { marker, sunArrow, satArrow, plotCross: null };
        };
        renderer.domElement.addEventListener('click', clickHandler);

        sunPointLight = new THREE.PointLight(0xfff0cc, 20.7, 65);
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

        const getDefaultCameraTarget = () => {
          if (cameraModeRef.current.center === 'spacecraft' && satelliteBody) {
            return satelliteBody.position.clone();
          }
          return new THREE.Vector3(0, 0, 0);
        };

        const getPresetCameraPose = () => {
          if (!sunBody || !satelliteBody) return null;
          const origin = new THREE.Vector3(0, 0, 0);
          const preset = cameraModeRef.current.preset;
          if (preset === 'none') return null;

          if (preset === 'cassini') {
            const satPos = satelliteBody.position.clone();
            const toTitan = origin.clone().sub(satPos).normalize();
            let side = new THREE.Vector3(0, 1, 0).cross(toTitan);
            if (side.lengthSq() < 1e-8) side = new THREE.Vector3(1, 0, 0);
            side.normalize();
            const position = satPos.clone()
              .addScaledVector(side, 0.07)
              .addScaledVector(toTitan, -0.05);
            const target = origin;
            return { position, target, hideSpacecraft: true, hideSun: false };
          }

          if (preset === 'sun') {
            const sunPos = sunBody.position.clone();
            const toTitan = origin.clone().sub(sunPos).normalize();
            const position = sunPos.clone().addScaledVector(toTitan, -0.35);
            const target = origin;
            return { position, target, hideSpacecraft: false, hideSun: true };
          }

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

            const insideFadeOpacity = 0.22;
            const normalOpacity = 1.0;
            const cameraPos = camera.position;
            const titanInside = cameraPos.length() < 1.02;
            material.opacity = titanInside ? insideFadeOpacity : normalOpacity;
            material.transparent = true;
            if (sunBody) {
              const sunInside = cameraPos.distanceTo(sunBody.position) < (sunVisualRadius * 1.05);
              makeObjectSemiTransparent(sunBody, sunInside ? insideFadeOpacity : normalOpacity);
            }
            if (satelliteBody) {
              const satInside = cameraPos.distanceTo(satelliteBody.position) < (cassiniVisualRadius * 1.1);
              makeObjectSemiTransparent(satelliteBody, satInside ? insideFadeOpacity : normalOpacity);
            }

            if (introActive) {
              const finalPose = presetPose || {
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
              mesh.rotation.y = baseTitanYaw + spin;
              if (sunBody) sunBody.rotation.y = spin * 0.5;
              if (satelliteBody) satelliteBody.rotation.y = spin * 0.35;
            } else {
              if (introState.active) {
                introState.active = false;
              }
              mesh.rotation.y = baseTitanYaw;
              if (sunBody) sunBody.rotation.y = 0;
              if (satelliteBody) satelliteBody.rotation.y = 0;

              if (presetPose) {
                controls.enableRotate = false;
                controls.minDistance = 0.03;
                controls.maxDistance = 12;
                camera.position.lerp(presetPose.position, 0.18);
                controls.target.lerp(presetPose.target, 0.22);
                camera.lookAt(controls.target);
              } else {
                controls.enableRotate = true;
                if (cameraModeRef.current.center === 'spacecraft' && satelliteBody) {
                  controls.minDistance = 0.02;
                  controls.maxDistance = 12.0;
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
                  pendingSpacecraftAutoZoomRef.current = false;
                  controls.minDistance = 0.25;
                  controls.maxDistance = 7;
                  controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.18);
                }
              }
            }

            controls.update();
            if (sunGlow) {
              sunGlow.scale.set(1.25, 1.25, 1);
            }
            if (composer) composer.render();
            else renderer.render(scene, camera);
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
      if (rotationAxisRef.current && scene) {
        scene.remove(rotationAxisRef.current);
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
      sceneRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      cameraRef.current = null;
      meshRef.current = null;
      multiPointGroupRef.current = null;
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
