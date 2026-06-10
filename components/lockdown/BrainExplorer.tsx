'use client';

import { Canvas, ThreeEvent, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import {
  Box3,
  BufferGeometry,
  InstancedMesh,
  MathUtils,
  Mesh,
  Object3D,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import brainModelUrl from 'threejs-brain-animation/dist/static/brain.glb?url';

type BrainRegion = {
  id: string;
  name: string;
  shortName: string;
  summary: string;
  link: string;
};

type BrainParticle = {
  id: number;
  regionId: string;
  position: Vector3;
  size: number;
  rotation: Vector3;
};

type BrainPointCloud = {
  geometry: BufferGeometry;
  particles: BrainParticle[];
  particlesByRegion: Record<string, BrainParticle[]>;
};

const brainRegionTargets: BrainRegion[] = [
  { id: 'prefrontal', name: 'Prefrontal Cortex', shortName: 'PFC', summary: '', link: '' },
  { id: 'motor', name: 'Motor Cortex', shortName: 'Motor', summary: '', link: '' },
  { id: 'somatosensory', name: 'Somatosensory Cortex', shortName: 'Touch', summary: '', link: '' },
  { id: 'visual', name: 'Visual Cortex', shortName: 'Vision', summary: '', link: '' },
  { id: 'temporal', name: 'Temporal Lobe', shortName: 'Memory', summary: '', link: '' },
  { id: 'hippocampus', name: 'Hippocampal System', shortName: 'Map', summary: '', link: '' },
  { id: 'thalamus', name: 'Thalamic Relay', shortName: 'Relay', summary: '', link: '' },
  { id: 'cerebellum', name: 'Cerebellum', shortName: 'Timing', summary: '', link: '' },
];

const regionColors: Record<string, { idle: string; active: string }> = {
  prefrontal: { idle: '#9a72bf', active: '#d86bff' },
  motor: { idle: '#bf7564', active: '#ff725f' },
  somatosensory: { idle: '#b99045', active: '#ffb43f' },
  visual: { idle: '#5f90c4', active: '#68c8ff' },
  temporal: { idle: '#b76ca2', active: '#f04fb2' },
  hippocampus: { idle: '#c58457', active: '#ff9852' },
  thalamus: { idle: '#6f83c4', active: '#8faaff' },
  cerebellum: { idle: '#5c9b89', active: '#62e0c0' },
};

function resolveRegionId(position: Vector3) {
  const x = position.x;
  const y = position.y;

  if (x > 1.1 && y < -0.62) return 'cerebellum';
  if (x > 1.05 && y > -0.28) return 'visual';
  if (x < -1.08 && y > -0.18) return 'prefrontal';
  if (y > 0.58 && x < 0.15) return 'motor';
  if (y > 0.46 && x >= 0.12) return 'somatosensory';
  if (x > -0.18 && x < 0.58 && y > -0.28 && y < 0.3) return 'thalamus';
  if (x > 0.05 && x < 0.95 && y < -0.25) return 'hippocampus';
  return 'temporal';
}

function findBrainGeometry(scene: { traverse: (callback: (child: unknown) => void) => void }): BufferGeometry | null {
  let geometry: BufferGeometry | null = null;
  scene.traverse((child) => {
    if (geometry) return;
    const maybeMesh = child as Mesh;
    if (maybeMesh.isMesh && maybeMesh.geometry instanceof BufferGeometry) {
      geometry = maybeMesh.geometry;
    }
  });
  return geometry;
}

function createBrainPointCloud(scene: { traverse: (callback: (child: unknown) => void) => void }): BrainPointCloud {
  const sourceGeometry = findBrainGeometry(scene);
  if (!sourceGeometry) {
    return {
      geometry: new BufferGeometry(),
      particles: [],
      particlesByRegion: Object.fromEntries(brainRegionTargets.map((r) => [r.id, []])),
    };
  }

  const geometry = sourceGeometry.clone();
  geometry.computeBoundingBox();

  const box = geometry.boundingBox ?? new Box3();
  const center = new Vector3();
  const size = new Vector3();
  box.getCenter(center);
  box.getSize(size);

  const scale = 3.35 / Math.max(size.x, size.y, size.z);
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(scale, scale, scale);
  geometry.rotateY(-0.12);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  const positionAttribute = geometry.getAttribute('position');
  const count = positionAttribute.count;
  const stride = Math.max(1, Math.ceil(count / 3200));
  const particles: BrainParticle[] = [];
  const particlesByRegion = Object.fromEntries(brainRegionTargets.map((r) => [r.id, [] as BrainParticle[]]));

  for (let i = 0; i < count; i += stride) {
    const position = new Vector3().fromBufferAttribute(positionAttribute, i);
    const seed = Math.sin(i * 12.9898) * 43758.5453;
    const noise = seed - Math.floor(seed);
    const regionId = resolveRegionId(position);
    const particle = {
      id: i,
      regionId,
      position,
      size: MathUtils.lerp(0.016, 0.038, noise),
      rotation: new Vector3(noise * Math.PI, (1 - noise) * Math.PI, noise * Math.PI * 0.5),
    };
    particles.push(particle);
    particlesByRegion[regionId].push(particle);
  }

  return { geometry, particles, particlesByRegion };
}

function BrainRegionMesh({
  regionId,
  particles,
  active,
  pointerPoint,
}: {
  regionId: string;
  particles: BrainParticle[];
  active: boolean;
  pointerPoint: React.MutableRefObject<Vector3 | null>;
}) {
  const meshRef = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const materialColor = active ? regionColors[regionId].active : regionColors[regionId].idle;

  useLayoutEffect(() => {
    if (!meshRef.current) return;
    meshRef.current.instanceMatrix.setUsage(35048);
  }, []);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    for (let index = 0; index < particles.length; index += 1) {
      const particle = particles[index];
      const distance = pointerPoint.current ? pointerPoint.current.distanceTo(particle.position) : 10;
      const cursorLift = Math.max(0, 1 - distance / 0.38);
      const breathe = Math.sin(clock.elapsedTime * 1.2 + particle.id * 0.015) * 0.08;
      const scale = particle.size * (1 + cursorLift * 5.4 + (active ? 1.7 : 0) + breathe);
      dummy.position.copy(particle.position);
      dummy.rotation.set(
        particle.rotation.x + clock.elapsedTime * 0.08,
        particle.rotation.y + clock.elapsedTime * 0.06,
        particle.rotation.z,
      );
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(index, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, particles.length]} renderOrder={active ? 2 : 1}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial
        color={materialColor}
        wireframe
        transparent
        opacity={active ? 1 : 0.82}
        depthWrite={false}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function BrainParticleModel({
  selectedRegion,
  onSelect,
}: {
  selectedRegion: BrainRegion;
  onSelect: (region: BrainRegion) => void;
}) {
  const gltf = useLoader(GLTFLoader, brainModelUrl);
  const pointerPoint = useRef<Vector3 | null>(null);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const pointerDragged = useRef(false);
  const { geometry, particles, particlesByRegion } = useMemo(() => createBrainPointCloud(gltf.scene), [gltf.scene]);

  const handlePointerDown = (event: ThreeEvent<PointerEvent>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    pointerDragged.current = false;
  };

  const handlePointerMove = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    pointerPoint.current = event.point.clone();
    if (!pointerStart.current) return;
    const distance = Math.hypot(event.clientX - pointerStart.current.x, event.clientY - pointerStart.current.y);
    if (distance > 6) pointerDragged.current = true;
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (pointerDragged.current) {
      pointerStart.current = null;
      pointerDragged.current = false;
      return;
    }
    const nearest = particles.reduce<BrainParticle | null>((current, particle) => {
      if (!current) return particle;
      return event.point.distanceTo(particle.position) < event.point.distanceTo(current.position) ? particle : current;
    }, null);
    const region = brainRegionTargets.find((item) => item.id === nearest?.regionId);
    if (region) onSelect(region);
  };

  return (
    <group rotation={[0.02, -0.38, 0]} scale={1.05}>
      {brainRegionTargets.map((region) => (
        <BrainRegionMesh
          key={region.id}
          regionId={region.id}
          particles={particlesByRegion[region.id]}
          active={selectedRegion.id === region.id}
          pointerPoint={pointerPoint}
        />
      ))}
      <mesh
        geometry={geometry}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerOut={() => {
          pointerPoint.current = null;
          pointerStart.current = null;
          pointerDragged.current = false;
        }}
      >
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function MarlonModel() {
  const gltf = useLoader(GLTFLoader, '/models/marlonjack.glb');
  const scene = useMemo(() => {
    const clonedScene = gltf.scene.clone(true);
    const box = new Box3().setFromObject(clonedScene);
    const center = new Vector3();
    const size = new Vector3();
    box.getCenter(center);
    box.getSize(size);
    const largestAxis = Math.max(size.x, size.y, size.z);
    const scale = largestAxis > 0 ? 2.7 / largestAxis : 1;
    clonedScene.scale.setScalar(scale);
    clonedScene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
    clonedScene.rotation.y = -0.18;
    return clonedScene;
  }, [gltf.scene]);

  return <primitive object={scene} />;
}

export function BrainExplorer({
  selectedRegion,
  onSelect,
}: {
  selectedRegion: BrainRegion;
  onSelect: (region: BrainRegion) => void;
}) {
  const shellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return undefined;
    const containWheel = (event: WheelEvent) => { event.preventDefault(); };
    shell.addEventListener('wheel', containWheel, { passive: false });
    return () => shell.removeEventListener('wheel', containWheel);
  }, []);

  return (
    <div ref={shellRef} className="brain-animation-shell">
      <Canvas
        className="brain-animation"
        camera={{ position: [0, 0.04, 4.75], fov: 38 }}
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true }}
      >
        <ambientLight intensity={1.45} />
        <directionalLight position={[2.5, 3, 4]} intensity={2.35} />
        <directionalLight position={[-3, 1, 2]} intensity={0.85} />
        {selectedRegion.id === 'marlon' ? (
          <MarlonModel />
        ) : (
          <BrainParticleModel selectedRegion={selectedRegion} onSelect={onSelect} />
        )}
        <OrbitControls
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minDistance={3.9}
          maxDistance={5.7}
          rotateSpeed={0.38}
        />
      </Canvas>
    </div>
  );
}
