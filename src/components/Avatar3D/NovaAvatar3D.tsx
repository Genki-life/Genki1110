import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { createBlobCreature, type BlobCreature } from './blobCreature.ts';
import { createGPUFurPhysics, type GPUFurPhysics } from './gpuPhysics.ts';
import { createGPUFurSystem, type FurSystem } from './furSystem.ts';
import { FurryNovaStaticAvatar } from './FurryNovaStaticAvatar';

export interface NovaAvatar3DProps {
  /** Whether the current page/tab is active and visible (pauses loop when false) */
  isActiveTab?: boolean;
  /** Fallback image URL if WebGL fails or user switches to 2D */
  fallbackImage?: string;
  /** Custom class name for the wrapper element */
  className?: string;
  /** Callback when user clicks or boops the character */
  onBoop?: () => void;
  /** Mode: '3d' for procedural fur creature, '2d' for legacy image */
  mode?: '3d' | '2d';
  /** Toggle switch handler if displayed */
  onToggleMode?: () => void;
  /** Whether Nova is in active listening/typing posture */
  isListening?: boolean;
}

export function NovaAvatar3D({
  isActiveTab = true,
  fallbackImage = '/kila-home.png',
  className = '',
  onBoop,
  mode = '3d',
  onToggleMode,
  isListening = false,
}: NovaAvatar3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isListeningRef = useRef(isListening);
  useEffect(() => {
    isListeningRef.current = isListening;
  }, [isListening]);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isDebugOpen, setIsDebugOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('avatarDebug') === '1';
    }
    return false;
  });
  const [debugFurMode, setDebugFurMode] = useState<'A' | 'B'>(() => {
    if (typeof window !== 'undefined') {
      const m = new URLSearchParams(window.location.search).get('furMode');
      if (m === 'A' || m === 'B') return m;
    }
    return 'B';
  });
  const [debugAngle, setDebugAngle] = useState<'live' | 'front' | 'side' | 'back'>(() => {
    if (typeof window !== 'undefined') {
      const a = new URLSearchParams(window.location.search).get('angle');
      if (a === 'live' || a === 'front' || a === 'side' || a === 'back') return a;
    }
    return 'front';
  });
  const [debugPreset, setDebugPreset] = useState<'formal' | 'colorFix' | 'shortPlush'>('formal');

  const debugStateRef = useRef({
    open: isDebugOpen,
    furMode: debugFurMode,
    angle: debugAngle,
    preset: debugPreset
  });

  // References to keep across renders and tab switches
  const isDisposedRef = useRef(false);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const creatureRef = useRef<BlobCreature | null>(null);
  const furSystemRef = useRef<FurSystem | null>(null);
  const gpuPhysicsRef = useRef<GPUFurPhysics | null>(null);
  const rimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);

  // Simulation timing & single-loop management
  const clockRef = useRef<THREE.Clock>(new THREE.Clock(false));
  const simTimeRef = useRef<number>(0);
  const animFrameIdRef = useRef<number | null>(null);
  const isLoopRunningRef = useRef<boolean>(false);
  const staticFramesLeftRef = useRef<number>(2);

  // Full quality fur configuration parameters (Formal config - untouched)
  const furParamsRef = useRef({
    baseColor: '#8F9780',
    tipColor: '#B8BEA8',
    furLength: 0.31,
    furDensity: 0.75,
    roughness: 0.77,
    specular: 0.24,
    clumping: 0.35,
    curliness: 0.23,
    windStrength: 0.95,
    lightIntensity: 1.35,
    rimIntensity: 1.35
  });

  // Sync debug state to Three.js objects without modifying formal config when debug is closed
  useEffect(() => {
    debugStateRef.current = {
      open: isDebugOpen,
      furMode: debugFurMode,
      angle: debugAngle,
      preset: debugPreset
    };
    staticFramesLeftRef.current = 2;

    const creature = creatureRef.current;
    const furSystem = furSystemRef.current;
    const rimLight = rimLightRef.current;
    const hemiLight = hemiLightRef.current;
    if (!creature || !furSystem) return;

    const formal = furParamsRef.current;

    if (!isDebugOpen) {
      // Restore 100% formal state
      furSystem.shellMesh.visible = true;
      furSystem.strandMesh.visible = true;
      furSystem.sharedUniforms.uDebugNeutralShading.value = 0.0;
      furSystem.sharedUniforms.uFurLength.value = formal.furLength;
      furSystem.sharedUniforms.uCurliness.value = formal.curliness;
      furSystem.sharedUniforms.uWindStrength.value = formal.windStrength;
      creature.skinMaterial.color.set(formal.baseColor).multiplyScalar(0.55);
      if (rimLight) rimLight.color.set('#c4b5fd');
      if (hemiLight) {
        hemiLight.color.set('#f5d0fe');
        hemiLight.groundColor.set('#1e1b4b');
      }
      return;
    }

    // View A (Hide Fur) vs View B (Show Full Fur)
    const showFur = debugFurMode === 'B';
    furSystem.shellMesh.visible = showFur;
    furSystem.strandMesh.visible = showFur;

    if (!showFur) {
      // In View A (bare mesh), show true #8F9780 base color and neutral light on bodyMesh so silhouette is clear
      creature.skinMaterial.color.set(formal.baseColor);
      if (rimLight) rimLight.color.set('#fff7ed');
      if (hemiLight) {
        hemiLight.color.set('#ffffff');
        hemiLight.groundColor.set('#5c6352');
      }
    } else {
      const useNeutralColor = debugPreset === 'colorFix' || debugPreset === 'shortPlush';
      const useShortPlush = debugPreset === 'shortPlush';
      furSystem.sharedUniforms.uDebugNeutralShading.value = useNeutralColor ? 1.0 : 0.0;
      furSystem.sharedUniforms.uFurLength.value = useShortPlush ? 0.075 : formal.furLength;
      furSystem.sharedUniforms.uCurliness.value = useShortPlush ? 0.06 : formal.curliness;
      furSystem.sharedUniforms.uWindStrength.value = useShortPlush ? 0.15 : formal.windStrength;
      creature.skinMaterial.color
        .set(formal.baseColor)
        .multiplyScalar(useNeutralColor ? 0.78 : 0.55);
      if (rimLight) rimLight.color.set(useNeutralColor ? '#fff7ed' : '#c4b5fd');
      if (hemiLight) {
        hemiLight.color.set(useNeutralColor ? '#ffffff' : '#f5d0fe');
        hemiLight.groundColor.set(useNeutralColor ? '#5c6352' : '#1e1b4b');
      }
    }
  }, [isDebugOpen, debugFurMode, debugAngle, debugPreset]);

  // Interaction tracking state
  const isPointerDownRef = useRef(false);
  const pointerStartPosRef = useRef({ x: 0, y: 0 });
  const isPointerOverCreatureRef = useRef(false);
  const pointerNDCRef = useRef(new THREE.Vector2(0, 0));
  const pointerLocalPosRef = useRef(new THREE.Vector3(0, 0, 2));
  const prevPointerLocalPosRef = useRef(new THREE.Vector3(0, 0, 2));
  const pointerVelocityRef = useRef(new THREE.Vector3(0, 0, 0));
  const boopShockwaveRef = useRef(0.0);

  // Stop animation loop cleanly
  const stopAnimationLoop = useCallback(() => {
    isLoopRunningRef.current = false;
    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }
  }, []);

  // Start single animation loop with fresh clock baseline
  const startAnimationLoop = useCallback(() => {
    if (
      isDisposedRef.current ||
      !rendererRef.current ||
      !sceneRef.current ||
      !cameraRef.current ||
      !creatureRef.current ||
      !furSystemRef.current ||
      !gpuPhysicsRef.current
    ) {
      return;
    }

    // Cancel any pending frame to guarantee exactly ONE active loop
    if (animFrameIdRef.current !== null) {
      cancelAnimationFrame(animFrameIdRef.current);
      animFrameIdRef.current = null;
    }

    isLoopRunningRef.current = true;
    // Reset clock baseline so the first resumed frame delta is ~0.016s without time jumps
    clockRef.current.start();

    const loop = () => {
      if (isDisposedRef.current || !isLoopRunningRef.current) {
        animFrameIdRef.current = null;
        return;
      }

      // Single call to getDelta() per frame
      const rawDelta = clockRef.current.getDelta();
      const dt = Math.min(Math.max(rawDelta, 0.001), 0.05);

      // Monotonic, stable simulated time accumulator
      simTimeRef.current += dt;
      const time = simTimeRef.current;

      const creature = creatureRef.current;
      const furSystem = furSystemRef.current;
      const gpuPhysics = gpuPhysicsRef.current;
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;

      if (!creature || !furSystem || !gpuPhysics || !renderer || !scene || !camera) {
        return;
      }

      const dbg = debugStateRef.current;
      if (dbg.open && dbg.angle !== 'live') {
        // Fixed pose under identical camera for exact View A vs View B Front/Side/Back comparison
        creature.root.position.set(0, 0, 0);
        creature.root.scale.set(1, 1, 1);
        const targetYaw =
          dbg.angle === 'side' ? -Math.PI * 0.46 : dbg.angle === 'back' ? Math.PI : 0;
        creature.root.rotation.set(0, targetYaw, 0);
        creature.animState.velocity.set(0, 0, 0);
        creature.animState.angularVelocity.set(0, 0, 0);
      } else {
        // Creature idle breathing, swaying, blinking, gaze tracking & gentle listening tilt
        creature.update(dt, pointerNDCRef.current, camera.position, false, isListeningRef.current);
      }

      // Boop shockwave decay
      if (boopShockwaveRef.current > 0.001) {
        boopShockwaveRef.current = Math.max(0, boopShockwaveRef.current - dt * 3.2);
      }

      const activeWind =
        dbg.open && dbg.angle !== 'live'
          ? 0.0
          : furSystem.sharedUniforms.uWindStrength.value;

      // GPGPU Verlet spring simulation step
      const physicsTex = gpuPhysics.step({
        time: dbg.open && dbg.angle !== 'live' ? 0.5 : time,
        dt,
        windStrength: activeWind,
        creatureVelocity: creature.animState.velocity,
        creatureAngularVel: creature.animState.angularVelocity,
        pointerLocalPos: pointerLocalPosRef.current,
        pointerVelocity: pointerVelocityRef.current,
        pointerActive: isPointerOverCreatureRef.current,
        boopShockwave: boopShockwaveRef.current
      });

      // Feed physics texture and dynamic uniforms to fur shaders
      furSystem.sharedUniforms.uPhysicsTex.value = physicsTex;
      furSystem.sharedUniforms.uTime.value = dbg.open && dbg.angle !== 'live' ? 0.5 : time;
      furSystem.sharedUniforms.uPointerLocalPos.value.copy(pointerLocalPosRef.current);
      furSystem.sharedUniforms.uPointerActive.value = isPointerOverCreatureRef.current ? 1.0 : 0.0;
      furSystem.sharedUniforms.uBoopShockwave.value = boopShockwaveRef.current;

      // Analytical fallback inertia
      furSystem.sharedUniforms.uWebGLInertia.value.set(
        -creature.animState.velocity.x * 0.12,
        -creature.animState.velocity.y * 0.12,
        -creature.animState.velocity.z * 0.12
      );

      renderer.render(scene, camera);

      if (dbg.open && dbg.angle !== 'live') {
        setTimeout(() => {
          if (!isDisposedRef.current && isLoopRunningRef.current) {
            animFrameIdRef.current = requestAnimationFrame(loop);
          }
        }, 80);
      } else {
        animFrameIdRef.current = requestAnimationFrame(loop);
      }
    };

    animFrameIdRef.current = requestAnimationFrame(loop);
  }, []);

  // Main 3D Scene Initialization Effect (Runs once on mount or when mode toggles)
  useEffect(() => {
    if (mode === '2d') {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    // 1. WebGL Support Test
    const testCanvas = document.createElement('canvas');
    const gl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
    if (!gl) {
      console.warn('WebGL not supported in current environment. Falling back to 2D Nova.');
      setHasError(true);
      setErrorMessage('WebGL context not available');
      return;
    }

    isDisposedRef.current = false;

    try {
      const width = container.clientWidth || 240;
      const height = container.clientHeight || 240;

      // 2. WebGL Renderer with Alpha: true for seamless gradient integration
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance'
      });
      rendererRef.current = renderer;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setSize(width, height);
      renderer.setClearColor(0x000000, 0); // 100% transparent
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const domElement = renderer.domElement;
      domElement.style.width = '100%';
      domElement.style.height = '100%';
      domElement.style.display = 'block';
      domElement.style.touchAction = 'pan-y'; // Allow vertical page scrolling
      container.innerHTML = '';
      container.appendChild(domElement);

      // 3. Three.js Scene & Perspective Camera
      const scene = new THREE.Scene();
      sceneRef.current = scene;

      const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 40);
      cameraRef.current = camera;

      // Frame Mochi-Puff with safe padding for perky ears, plush side fur, and jump bounce
      const updateFraming = (w: number, h: number) => {
        const aspect = Math.max(0.5, w / Math.max(1, h));
        camera.aspect = aspect;

        // Bounding requirements: half-width ~1.95, half-height ~1.65 (center Y at 0.16)
        const vFovRad = (camera.fov * Math.PI) / 180;
        const tanHalfV = Math.tan(vFovRad / 2);
        const tanHalfH = tanHalfV * aspect;

        const distV = 1.65 / tanHalfV;
        const distH = 1.95 / tanHalfH;
        const targetDist = Math.max(distV, distH, 6.2);

        camera.position.set(0.0, 0.28, targetDist);
        camera.lookAt(0.0, 0.16, 0.0);
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };

      updateFraming(width, height);

      // 4. Studio 3-Point Lighting Rig
      const keyLight = new THREE.DirectionalLight('#fff7ed', 1.8);
      keyLight.position.set(1.8, 2.1, 2.2);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.radius = 2.0;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight('#c4b5fd', 1.5);
      rimLight.position.set(-2.4, 1.8, -3.2);
      rimLightRef.current = rimLight;
      scene.add(rimLight);

      const hemiLight = new THREE.HemisphereLight('#f5d0fe', '#1e1b4b', 0.85);
      hemiLightRef.current = hemiLight;
      scene.add(hemiLight);

      // 5. Procedural Mochi-Puff Blob Creature (Sculpted organic mesh + eyes + mouth + blush)
      const creature = createBlobCreature();
      creatureRef.current = creature;
      scene.add(creature.root);

      // 6. GPGPU Physics & Fur System (Full Quality: 64 shells + 60,000 strands)
      const gpuPhysics = createGPUFurPhysics(renderer);
      gpuPhysicsRef.current = gpuPhysics;

      const furParams = {
        ...furParamsRef.current,
        gpuFurEnabled: gpuPhysics.isGPGPUActive
      };

      const furSystem = createGPUFurSystem(creature.bodyGeometry, furParams);
      furSystemRef.current = furSystem;

      // Attach fur shells and hair ribbons to creature root
      creature.root.add(furSystem.shellMesh);
      creature.root.add(furSystem.strandMesh);

      // Match skin material to base root color (or initial debug state if open)
      if (debugStateRef.current.open && debugStateRef.current.furMode === 'A') {
        furSystem.shellMesh.visible = false;
        furSystem.strandMesh.visible = false;
        creature.skinMaterial.color.set(furParams.baseColor);
        rimLight.color.set('#fff7ed');
        hemiLight.color.set('#ffffff');
        hemiLight.groundColor.set('#5c6352');
      } else {
        creature.skinMaterial.color.set(furParams.baseColor).multiplyScalar(0.55);
      }

      // 7. Raycaster for Petting & Boop Interactions
      const raycaster = new THREE.Raycaster();

      const updatePointer = (clientX: number, clientY: number) => {
        const rect = domElement.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;

        pointerNDCRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDCRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(pointerNDCRef.current, camera);
        const hits = raycaster.intersectObject(creature.bodyMesh, false);

        if (hits.length > 0) {
          prevPointerLocalPosRef.current.copy(pointerLocalPosRef.current);
          pointerLocalPosRef.current.copy(hits[0].point);
          creature.root.worldToLocal(pointerLocalPosRef.current);

          if (isPointerOverCreatureRef.current) {
            pointerVelocityRef.current
              .subVectors(pointerLocalPosRef.current, prevPointerLocalPosRef.current)
              .multiplyScalar(32.0);
          }
          isPointerOverCreatureRef.current = true;
          domElement.style.cursor = 'pointer';
        } else {
          isPointerOverCreatureRef.current = false;
          pointerVelocityRef.current.multiplyScalar(0.5);
          domElement.style.cursor = 'grab';
        }
      };

      const handlePointerDown = (e: PointerEvent) => {
        isPointerDownRef.current = true;
        pointerStartPosRef.current = { x: e.clientX, y: e.clientY };
        updatePointer(e.clientX, e.clientY);
      };

      const handlePointerMove = (e: PointerEvent) => {
        updatePointer(e.clientX, e.clientY);
      };

      const handlePointerUp = (e: PointerEvent) => {
        const dist = Math.hypot(
          e.clientX - pointerStartPosRef.current.x,
          e.clientY - pointerStartPosRef.current.y
        );

        // Tap/click with minimal drag on character triggers boop
        if (dist < 12 && isPointerOverCreatureRef.current) {
          creature.triggerBoop();
          boopShockwaveRef.current = 1.0;
          if (onBoop) onBoop();
        }

        isPointerDownRef.current = false;
        isPointerOverCreatureRef.current = false;
        pointerVelocityRef.current.set(0, 0, 0);
      };

      const handlePointerLeave = () => {
        isPointerDownRef.current = false;
        isPointerOverCreatureRef.current = false;
        pointerVelocityRef.current.set(0, 0, 0);
        pointerNDCRef.current.set(0, 0);
      };

      domElement.addEventListener('pointerdown', handlePointerDown);
      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
      domElement.addEventListener('pointerleave', handlePointerLeave);

      // 8. Dynamic Resize Observer
      let lastW = width;
      let lastH = height;
      const resizeObserver = new ResizeObserver((entries) => {
        if (!entries || entries.length === 0 || isDisposedRef.current) return;
        const entry = entries[0];
        const newWidth = Math.max(80, Math.floor(entry.contentRect.width));
        const newHeight = Math.max(80, Math.floor(entry.contentRect.height));
        if (newWidth !== lastW || newHeight !== lastH) {
          lastW = newWidth;
          lastH = newHeight;
          updateFraming(newWidth, newHeight);
          staticFramesLeftRef.current = 3;
          if (!isLoopRunningRef.current && isActiveTab && document.visibilityState === 'visible') {
            startAnimationLoop();
          }
        }
      });
      resizeObserver.observe(container);

      // If active and document is visible, start the loop
      staticFramesLeftRef.current = 3;
      if (isActiveTab && document.visibilityState === 'visible') {
        startAnimationLoop();
      }

      // Cleanup on component unmount or 2D mode switch
      return () => {
        isDisposedRef.current = true;
        stopAnimationLoop();

        resizeObserver.disconnect();
        domElement.removeEventListener('pointerdown', handlePointerDown);
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        domElement.removeEventListener('pointerleave', handlePointerLeave);

        creature.dispose();
        furSystem.dispose();
        gpuPhysics.dispose();
        renderer.dispose();

        creatureRef.current = null;
        furSystemRef.current = null;
        gpuPhysicsRef.current = null;
        rendererRef.current = null;
        sceneRef.current = null;
        cameraRef.current = null;
        rimLightRef.current = null;
        hemiLightRef.current = null;

        if (container.contains(domElement)) {
          container.removeChild(domElement);
        }
      };
    } catch (err: any) {
      console.error('Failed to initialize 3D Avatar:', err);
      setHasError(true);
      setErrorMessage(err?.message || '3D initialization error');
    }
  }, [mode, onBoop, startAnimationLoop, stopAnimationLoop]);

  // Tab Activation / Background Page Visibility Loop Controller
  useEffect(() => {
    if (mode === '2d' || hasError) {
      stopAnimationLoop();
      return;
    }

    const syncLoopState = () => {
      const isVisible = document.visibilityState === 'visible';
      const shouldBeRunning = isActiveTab && isVisible;

      if (shouldBeRunning) {
        if (!isLoopRunningRef.current) {
          startAnimationLoop();
        }
      } else {
        if (isLoopRunningRef.current) {
          stopAnimationLoop();
        }
      }
    };

    syncLoopState();

    const handleVisibilityChange = () => {
      syncLoopState();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isActiveTab, mode, hasError, startAnimationLoop, stopAnimationLoop]);

  // Fallback 2D Image View if in 2D mode or upon WebGL failure
  if (mode === '2d' || hasError) {
    return (
      <div className={`relative flex items-center justify-center select-none ${className}`}>
        {/* Soft radial glow halo */}
        <div className="absolute inset-0 rounded-full bg-radial from-[#F4EEFE]/90 via-[#FDF1F5]/45 to-transparent blur-2xl pointer-events-none -z-10" />

        <FurryNovaStaticAvatar
          size={240}
          className="w-full h-full object-contain pointer-events-none drop-shadow-xs"
        />

        {hasError && (
          <div className="absolute bottom-2 inset-x-2 py-1 px-2 rounded-lg bg-black/60 backdrop-blur-xs text-[10px] text-white/90 text-center">
            {errorMessage || 'WebGL fallback active'}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`relative flex items-center justify-center select-none ${className}`}>
      {/* Subtle soft radial glow behind the 3D character */}
      <div className="absolute inset-2 rounded-full bg-radial from-[#F4EEFE]/85 via-[#FDF1F5]/40 to-transparent blur-2xl pointer-events-none -z-10" />

      {/* Three.js Canvas Container */}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center relative touch-pan-y"
        style={{ touchAction: 'pan-y' }}
      />

      {/* Non-intrusive Toggleable Diagnostic View Controls (Exit restores 100% formal state) */}
      {!isDebugOpen ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsDebugOpen(true);
          }}
          className="absolute top-1 right-1 z-30 px-2 py-0.5 rounded-md bg-black/45 hover:bg-black/65 text-white/90 text-[10px] font-medium backdrop-blur-xs transition"
          title="打开临时诊断视图 (A/B毛发切换 & 正侧背对照)"
        >
          诊断视图
        </button>
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute -bottom-2 inset-x-0 z-30 mx-auto max-w-[268px] rounded-xl bg-black/75 backdrop-blur-md p-1.5 text-[10px] text-white shadow-lg border border-white/15 flex flex-col gap-1"
        >
          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDebugFurMode('A')}
                className={`px-1.5 py-0.5 rounded font-medium ${
                  debugFurMode === 'A' ? 'bg-amber-400 text-black' : 'bg-white/10 text-white/85'
                }`}
              >
                A.无毛发(底层)
              </button>
              <button
                type="button"
                onClick={() => setDebugFurMode('B')}
                className={`px-1.5 py-0.5 rounded font-medium ${
                  debugFurMode === 'B' ? 'bg-emerald-400 text-black' : 'bg-white/10 text-white/85'
                }`}
              >
                B.完整毛发
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsDebugOpen(false);
                setDebugFurMode('B');
                setDebugPreset('formal');
              }}
              className="px-1.5 py-0.5 rounded bg-rose-500/80 hover:bg-rose-500 text-white font-medium"
            >
              退出
            </button>
          </div>

          <div className="flex items-center justify-between gap-1">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setDebugAngle('front')}
                className={`px-1.5 py-0.5 rounded ${
                  debugAngle === 'front' ? 'bg-white text-black font-semibold' : 'bg-white/10 text-white/80'
                }`}
              >
                正面
              </button>
              <button
                type="button"
                onClick={() => setDebugAngle('side')}
                className={`px-1.5 py-0.5 rounded ${
                  debugAngle === 'side' ? 'bg-white text-black font-semibold' : 'bg-white/10 text-white/80'
                }`}
              >
                侧面
              </button>
              <button
                type="button"
                onClick={() => setDebugAngle('back')}
                className={`px-1.5 py-0.5 rounded ${
                  debugAngle === 'back' ? 'bg-white text-black font-semibold' : 'bg-white/10 text-white/80'
                }`}
              >
                背面
              </button>
              <button
                type="button"
                onClick={() => setDebugAngle('live')}
                className={`px-1.5 py-0.5 rounded ${
                  debugAngle === 'live' ? 'bg-white text-black font-semibold' : 'bg-white/10 text-white/80'
                }`}
              >
                动态
              </button>
            </div>

            {debugFurMode === 'B' && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setDebugPreset('formal')}
                  className={`px-1.5 py-0.5 rounded ${
                    debugPreset === 'formal' ? 'bg-sky-300 text-black font-semibold' : 'bg-white/10 text-white/80'
                  }`}
                >
                  正式色
                </button>
                <button
                  type="button"
                  onClick={() => setDebugPreset('colorFix')}
                  className={`px-1.5 py-0.5 rounded ${
                    debugPreset === 'colorFix' ? 'bg-lime-300 text-black font-semibold' : 'bg-white/10 text-white/80'
                  }`}
                  title="仅调试：去除紫色边缘光/冷蓝天光并启用sRGB输出"
                >
                  去紫sRGB
                </button>
                <button
                  type="button"
                  onClick={() => setDebugPreset('shortPlush')}
                  className={`px-1.5 py-0.5 rounded ${
                    debugPreset === 'shortPlush' ? 'bg-lime-300 text-black font-semibold' : 'bg-white/10 text-white/80'
                  }`}
                  title="仅调试：毛长0.075短绒+去紫sRGB"
                >
                  短绒对照
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
