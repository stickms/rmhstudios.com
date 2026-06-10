'use client';

import { Canvas, ThreeEvent, useFrame, useLoader } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Brain as BrainIcon, CornerDownLeft } from 'lucide-react';
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
import './lockdown.css';

type BrainRegion = {
  id: string;
  name: string;
  shortName: string;
  summary: string;
  link: string;
};

const brainRegions: BrainRegion[] = [
  {
    id: 'prefrontal',
    name: 'Prefrontal Cortex',
    shortName: 'PFC',
    summary: 'Executive intent, planning, restraint, and context switching.',
    link: 'RMHlink would prioritize high-bandwidth intent decoding here, turning deliberate goals into interface commands for software, robotics, and simulated worlds.',
  },
  {
    id: 'motor',
    name: 'Motor Cortex',
    shortName: 'Motor',
    summary: 'Voluntary movement plans before they become muscle action.',
    link: 'RMHlink would map imagined movement into precise controls, enabling full-body VR agency, prosthetic output, and low-latency digital embodiment.',
  },
  {
    id: 'somatosensory',
    name: 'Somatosensory Cortex',
    shortName: 'Touch',
    summary: 'Touch, pressure, body position, and surface perception.',
    link: 'RMHlink would close the loop with synthetic touch, making AR objects and VR environments feel physically present rather than merely visible.',
  },
  {
    id: 'visual',
    name: 'Visual Cortex',
    shortName: 'Vision',
    summary: 'Image formation, motion, edges, depth, and visual prediction.',
    link: 'RMHlink would align neural visual processing with rendered scenes for realistic VR/AR overlays, perceptual stabilization, and simulation fidelity.',
  },
  {
    id: 'temporal',
    name: 'Temporal Lobe',
    shortName: 'Memory',
    summary: 'Language, auditory meaning, memory association, and recognition.',
    link: 'RMHlink would use this region to anchor persistent virtual identities, spatial memories, voice interfaces, and context-aware recall.',
  },
  {
    id: 'hippocampus',
    name: 'Hippocampal System',
    shortName: 'Map',
    summary: 'Spatial maps, episode formation, and memory indexing.',
    link: 'RMHlink would coordinate simulated places with memory maps so VR spaces feel learnable, navigable, and continuous across sessions.',
  },
  {
    id: 'thalamus',
    name: 'Thalamic Relay',
    shortName: 'Relay',
    summary: 'Routing hub for sensory streams and attention-gated signals.',
    link: 'RMHlink would treat this as a timing and routing target, synchronizing multisensory input before it reaches conscious simulation.',
  },
  {
    id: 'cerebellum',
    name: 'Cerebellum',
    shortName: 'Timing',
    summary: 'Prediction, timing, balance, correction, and fluent control.',
    link: 'RMHlink would use cerebellar prediction to make avatars, robotics, and AR interaction feel smooth, immediate, and physically believable.',
  },
  {
    id: 'marlon',
    name: 'Marlon Jack',
    shortName: 'Marlon',
    summary: 'Lead scientist and developer of RMHlink.',
    link: 'Marlon Jack leads the scientific and engineering direction for RMHlink, bringing the BCI interface, simulation stack, and full-brain interaction roadmap into one system.',
  },
];

const brainRegionTargets = brainRegions.filter((region) => region.id !== 'marlon');

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
      particlesByRegion: Object.fromEntries(brainRegionTargets.map((region) => [region.id, []])),
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
  const particlesByRegion = Object.fromEntries(brainRegionTargets.map((region) => [region.id, [] as BrainParticle[]]));

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

function BrainExplorer({
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

    const containWheel = (event: WheelEvent) => {
      event.preventDefault();
    };

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

export function LockdownPage() {
  const [selectedRegion, setSelectedRegion] = useState(brainRegions[0]);
  const [password, setPassword] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const submittedTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (submittedTimer.current !== null) window.clearTimeout(submittedTimer.current);
    };
  }, []);

  const submitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPassword('');
    setSubmitted(true);
    if (submittedTimer.current !== null) window.clearTimeout(submittedTimer.current);
    submittedTimer.current = window.setTimeout(() => setSubmitted(false), 1800);
  };

  return (
    <main className="lockdown-page">
      <div className="lockdown-bg" aria-hidden="true">
        <span className="lockdown-form lockdown-form-a" />
        <span className="lockdown-form lockdown-form-b" />
        <span className="lockdown-form lockdown-form-c" />
        <span className="lockdown-grid" />
      </div>

      <section className="lockdown-stage" aria-labelledby="lockdown-title">
        <div className="lockdown-brand">
          <img src="/favicon.svg" alt="" aria-hidden="true" />
          <span>RMHStudios</span>
        </div>

        <h1 id="lockdown-title" className="lockdown-title">COMING SOON</h1>

        <div className="brain-console" aria-label="Interactive RMHlink brain region explorer">
          <div className="brain-viewport">
            <BrainExplorer selectedRegion={selectedRegion} onSelect={setSelectedRegion} />
          </div>

          <aside className="region-panel" aria-live="polite">
            <div className="region-panel__eyebrow">
              <BrainIcon size={16} aria-hidden="true" />
              <span>RMHlink target</span>
            </div>
            <h2>{selectedRegion.name}</h2>
            <p className="region-panel__summary">{selectedRegion.summary}</p>
            <p>{selectedRegion.link}</p>
          </aside>
        </div>

        <div className="region-selector" aria-label="Brain regions">
          {brainRegions.map((region) => (
            <button
              key={region.id}
              type="button"
              className={region.id === selectedRegion.id ? 'is-active' : ''}
              onClick={() => setSelectedRegion(region)}
            >
              {region.shortName}
            </button>
          ))}
        </div>
      </section>

      <form className="password-dock" onSubmit={submitPassword}>
        <div className="password-row" data-submitted={submitted}>
          <input
            id="lockdown-password"
            type="text"
            name="rmh-access-entry"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={submitted ? 'Coming soon' : 'Password'}
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-form-type="other"
            aria-label="Access password"
          />
          <button type="submit" aria-label="Enter password">
            <CornerDownLeft size={17} aria-hidden="true" />
          </button>
        </div>
      </form>
    </main>
  );
}
