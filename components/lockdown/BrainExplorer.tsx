'use client';

import { Canvas, ThreeEvent, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  Object3D,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

type BrainRegion = {
  id: string;
  name: string;
  shortName: string;
  summary: string;
  link: string;
};

export type CameraTarget = { azimuth: number; polar: number };

const brainRegionTargets: BrainRegion[] = [
  { id: 'prefrontal',    name: 'Prefrontal Cortex',    shortName: 'PFC',    summary: '', link: '' },
  { id: 'motor',         name: 'Motor Cortex',          shortName: 'Motor',  summary: '', link: '' },
  { id: 'somatosensory', name: 'Somatosensory Cortex',  shortName: 'Touch',  summary: '', link: '' },
  { id: 'visual',        name: 'Visual Cortex',          shortName: 'Vision', summary: '', link: '' },
  { id: 'temporal',      name: 'Temporal Lobe',          shortName: 'Memory', summary: '', link: '' },
  { id: 'hippocampus',   name: 'Hippocampal System',    shortName: 'Map',    summary: '', link: '' },
  { id: 'thalamus',      name: 'Thalamic Relay',         shortName: 'Relay',  summary: '', link: '' },
  { id: 'cerebellum',    name: 'Cerebellum',             shortName: 'Timing', summary: '', link: '' },
];

const regionColors: Record<string, { idle: string; active: string }> = {
  prefrontal:    { idle: '#c4a0e0', active: '#e8c8ff' },
  motor:         { idle: '#e8a89c', active: '#ffd0c8' },
  somatosensory: { idle: '#e0cc84', active: '#f8f0a8' },
  visual:        { idle: '#8ab8e8', active: '#c0dcf8' },
  temporal:      { idle: '#e0a4cc', active: '#f8c8e8' },
  hippocampus:   { idle: '#e8bc88', active: '#ffd8a8' },
  thalamus:      { idle: '#9cb4e0', active: '#c4d4f8' },
  cerebellum:    { idle: '#84c8ac', active: '#b8e8d0' },
};

// front = −Z, back = +Z, top = +Y, left = −X
function resolveRegionId(position: Vector3): string {
  const { x, y, z } = position;
  if (z > 0.52 && y < -0.05) return 'cerebellum';
  if (z > 0.82)               return 'visual';
  if (z < -0.88)              return 'prefrontal';
  if (y > 0.6 && z < 0.08)   return 'motor';
  if (y > 0.6)                return 'somatosensory';
  if (Math.abs(x) < 0.52 && y > -0.08 && y < 0.58 && Math.abs(z) < 0.42) return 'thalamus';
  if (y < -0.12 && Math.abs(x) < 0.72 && z > -0.55) return 'hippocampus';
  return 'temporal';
}

const KTX2_TRANSCODER_PATH = 'https://cdn.jsdelivr.net/npm/three@0.183.0/examples/jsm/libs/basis/';

// Kick off the brain model fetch as soon as this module loads so it's ready
// before the Canvas mounts. marlonjack.glb needs KTX2 (WebGL-context-dependent),
// so we only warm the HTTP cache for it here; the real parse happens in MarlonModel.
useGLTF.preload('/models/brain.glb');
if (typeof window !== 'undefined') {
  void fetch('/models/marlonjack.glb');
}

function buildBrainGeometry(scene: Object3D): BufferGeometry {
  const meshes: Mesh[] = [];
  scene.traverse((child) => { if ((child as Mesh).isMesh) meshes.push(child as Mesh); });
  if (meshes.length === 0) return new BufferGeometry();

  const geos = meshes.map((m) => {
    const geo = m.geometry.clone();
    geo.applyMatrix4(m.matrixWorld);
    const stripped = new BufferGeometry();
    stripped.setAttribute('position', geo.getAttribute('position'));
    const normal = geo.getAttribute('normal');
    if (normal) stripped.setAttribute('normal', normal);
    if (geo.index) stripped.setIndex(geo.index);
    return stripped;
  });

  const merged = geos.length > 1 ? (mergeGeometries(geos) ?? geos[0]) : geos[0];
  merged.computeBoundingBox();
  const box = merged.boundingBox!;
  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);
  const scale = 3.35 / Math.max(size.x, size.y, size.z);
  merged.translate(-center.x, -center.y, -center.z);
  merged.scale(scale, scale, scale);
  merged.rotateY(-0.12);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

function BrainMesh({
  selectedRegion,
  onSelect,
}: {
  selectedRegion: BrainRegion;
  onSelect: (region: BrainRegion) => void;
}) {
  const gltf = useGLTF('/models/brain.glb');
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const pointerDragged = useRef(false);
  const colorAttrRef = useRef<BufferAttribute | null>(null);
  const pulseColorsRef = useRef({ r1: 0, g1: 0, b1: 0, r2: 0, g2: 0, b2: 0 });
  const lastPulseRef = useRef(-1);

  const geometry = useMemo(() => buildBrainGeometry(gltf.scene), [gltf.scene]);

  const vertexRegions = useMemo(() => {
    const position = geometry.getAttribute('position');
    if (!position) return [] as string[];
    const arr = new Array<string>(position.count);
    for (let i = 0; i < position.count; i++) {
      arr[i] = resolveRegionId(new Vector3().fromBufferAttribute(position, i));
    }
    return arr;
  }, [geometry]);

  const regionIndicesMap = useMemo(() => {
    const map = Object.fromEntries(brainRegionTargets.map((r) => [r.id, [] as number[]]));
    for (let i = 0; i < vertexRegions.length; i++) map[vertexRegions[i]]?.push(i);
    return map;
  }, [vertexRegions]);

  useEffect(() => {
    const count = vertexRegions.length;
    if (count === 0) return;

    let attr = colorAttrRef.current;
    if (!attr || attr.count !== count) {
      attr = new BufferAttribute(new Float32Array(count * 3), 3);
      geometry.setAttribute('color', attr);
      colorAttrRef.current = attr;
    }

    const colors = attr.array as Float32Array;
    const tempColor = new Color();
    for (let i = 0; i < count; i++) {
      const rid = vertexRegions[i];
      const isActive = rid === selectedRegion.id;
      tempColor.set(isActive ? regionColors[rid]?.active ?? '#ccc' : regionColors[rid]?.idle ?? '#999');
      if (!isActive) tempColor.multiplyScalar(0.65);
      colors[i * 3] = tempColor.r;
      colors[i * 3 + 1] = tempColor.g;
      colors[i * 3 + 2] = tempColor.b;
    }

    lastPulseRef.current = -1;
    attr.needsUpdate = true;

    const c = regionColors[selectedRegion.id] ?? regionColors.temporal;
    const idleC = new Color(c.idle);
    const activeC = new Color(c.active);
    pulseColorsRef.current = { r1: idleC.r, g1: idleC.g, b1: idleC.b, r2: activeC.r, g2: activeC.g, b2: activeC.b };
  }, [geometry, vertexRegions, regionIndicesMap, selectedRegion.id]);

  useFrame(({ clock }) => {
    const attr = colorAttrRef.current;
    if (!attr) return;

    const colors = attr.array as Float32Array;
    let dirty = false;

    const pulse = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 1.6);
    if (Math.abs(pulse - lastPulseRef.current) >= 0.05) {
      lastPulseRef.current = pulse;
      const { r1, g1, b1, r2, g2, b2 } = pulseColorsRef.current;
      const t = 0.55 + 0.45 * pulse;
      const r = r1 + (r2 - r1) * t; const g = g1 + (g2 - g1) * t; const b = b1 + (b2 - b1) * t;
      for (const i of (regionIndicesMap[selectedRegion.id] ?? [])) {
        colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
      }
      dirty = true;
    }

    if (dirty) attr.needsUpdate = true;
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
    pointerDragged.current = false;
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (pointerStart.current && Math.hypot(e.clientX - pointerStart.current.x, e.clientY - pointerStart.current.y) > 6) {
      pointerDragged.current = true;
    }
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (pointerDragged.current) {
      pointerStart.current = null;
      pointerDragged.current = false;
      return;
    }
    const localPoint = e.object.worldToLocal(e.point.clone());
    const region = brainRegionTargets.find((r) => r.id === resolveRegionId(localPoint));
    if (region) onSelect(region);
  };

  return (
    <group rotation={[0.02, -0.38, 0]} scale={1.05}>
      <mesh
        geometry={geometry}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerEnter={() => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => {
          document.body.style.cursor = '';
          pointerStart.current = null;
          pointerDragged.current = false;
        }}
      >
        <meshStandardMaterial vertexColors roughness={0.52} metalness={0.06} />
      </mesh>
    </group>
  );
}

function MarlonModel() {
  const { gl } = useThree();
  const gltf = useLoader(GLTFLoader, '/models/marlonjack.glb', (loader) => {
    const ktx2 = new KTX2Loader().setTranscoderPath(KTX2_TRANSCODER_PATH).detectSupport(gl);
    (loader as GLTFLoader).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  });
  const scene = useMemo(() => {
    const cloned = gltf.scene.clone(true);
    const box = new Box3().setFromObject(cloned);
    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);
    const s = Math.max(size.x, size.y, size.z);
    const scale = s > 0 ? 2.7 / s : 1;
    cloned.scale.setScalar(scale);
    cloned.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    cloned.rotation.y = -0.18;
    return cloned;
  }, [gltf.scene]);
  return <primitive object={scene} />;
}

// Drives the camera toward a target azimuth + polar in scroll-driven mode
function CameraDriver({
  scrollDriven,
  cameraTargetRef,
}: {
  scrollDriven: boolean;
  cameraTargetRef: MutableRefObject<CameraTarget> | undefined;
}) {
  useFrame(({ camera }) => {
    if (!scrollDriven || !cameraTargetRef) return;
    const { azimuth: az, polar: pol } = cameraTargetRef.current;
    const dist = 6.2;
    const tx = dist * Math.sin(pol) * Math.sin(az);
    const ty = dist * Math.cos(pol);
    const tz = dist * Math.sin(pol) * Math.cos(az);
    // 0.18 lerp per frame ≈ 90% of the way in ~12 frames (200ms at 60fps)
    // Fast enough to feel scroll-linked, gentle enough to avoid jitter
    camera.position.x += (tx - camera.position.x) * 0.18;
    camera.position.y += (ty - camera.position.y) * 0.18;
    camera.position.z += (tz - camera.position.z) * 0.18;
    camera.lookAt(0, 0.04, 0);
  });
  return null;
}

export function BrainExplorer({
  selectedRegion,
  onSelect,
  scrollDriven = false,
  cameraTargetRef,
}: {
  selectedRegion: BrainRegion;
  onSelect: (region: BrainRegion) => void;
  scrollDriven?: boolean;
  cameraTargetRef?: MutableRefObject<CameraTarget>;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [canvasKey, setCanvasKey] = useState(0);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell || scrollDriven) return undefined;
    const containWheel = (e: WheelEvent) => e.preventDefault();
    shell.addEventListener('wheel', containWheel, { passive: false });
    return () => shell.removeEventListener('wheel', containWheel);
  }, [scrollDriven]);

  const handleContextLost = useCallback(() => setCanvasKey((k) => k + 1), []);

  return (
    <div ref={shellRef} className="brain-animation-shell">
      <Canvas
        key={canvasKey}
        className="brain-animation"
        camera={{ position: [0, 0.04, 6.2], fov: 38 }}
        dpr={[0.75, 1.0]}
        performance={{ min: 0.5, debounce: 150 }}
        gl={{ antialias: false, alpha: true, stencil: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener('webglcontextlost', handleContextLost);
        }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[2.5, 3, 4]} intensity={1.8} />
        <directionalLight position={[-3, 1, 2]} intensity={0.7} />
        <pointLight position={[0, 2, 1.5]} intensity={0.4} />

        {selectedRegion.id === 'marlon' ? (
          <MarlonModel />
        ) : (
          <BrainMesh selectedRegion={selectedRegion} onSelect={onSelect} />
        )}

        {scrollDriven ? (
          <CameraDriver scrollDriven cameraTargetRef={cameraTargetRef} />
        ) : (
          <OrbitControls
            enablePan={false}
            enableDamping
            dampingFactor={0.08}
            minDistance={5.0}
            maxDistance={7.5}
            rotateSpeed={0.38}
            autoRotate
            autoRotateSpeed={0.5}
          />
        )}
      </Canvas>
    </div>
  );
}
