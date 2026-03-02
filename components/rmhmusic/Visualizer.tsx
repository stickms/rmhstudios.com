'use client';

import { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useRmhMusicStore } from '@/lib/rmhmusic/store';
import { extractDominantColors } from '@/lib/rmhmusic/color-extract';

const PARTICLE_COUNT = 3000;
const MOBILE_PARTICLE_COUNT = 1000;

// ─── Curl Noise helpers ──────────────────────────────────────────

function noise3D(x: number, y: number, z: number): number {
  const p = Math.sin(x * 1.1 + y * 2.3 + z * 0.7) * 43758.5453;
  return p - Math.floor(p);
}

function curlNoise(x: number, y: number, z: number, time: number): [number, number, number] {
  const e = 0.01;
  const t = time * 0.3;
  const dx = (noise3D(x, y + e, z + t) - noise3D(x, y - e, z + t)) / (2 * e);
  const dy = (noise3D(x + t, y, z + e) - noise3D(x + t, y, z - e)) / (2 * e);
  const dz = (noise3D(x + e, y + t, z) - noise3D(x - e, y + t, z)) / (2 * e);
  return [dy - dz, dz - dx, dx - dy];
}

// ─── Particle Field ──────────────────────────────────────────────

function ParticleField({ colors, isPlaying }: { colors: [number, number, number][]; isPlaying: boolean }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const count = isMobile ? MOBILE_PARTICLE_COUNT : PARTICLE_COUNT;

  const { positions, velocities } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10;
      velocities[i * 3] = 0;
      velocities[i * 3 + 1] = 0;
      velocities[i * 3 + 2] = 0;
    }
    return { positions, velocities };
  }, [count]);

  const targetColors = useRef(colors);
  const currentColors = useRef(colors.map((c) => [...c] as [number, number, number]));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const colorObj = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    targetColors.current = colors;
  }, [colors]);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const time = clock.getElapsedTime();
    const speed = isPlaying ? 1.0 : 0.2;
    const pulse = isPlaying ? Math.sin(time * 2.5) * 0.15 + 1.0 : 1.0;

    for (let c = 0; c < 3; c++) {
      for (let ch = 0; ch < 3; ch++) {
        currentColors.current[c][ch] += (targetColors.current[c][ch] - currentColors.current[c][ch]) * 0.02;
      }
    }

    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      const x = positions[ix];
      const y = positions[ix + 1];
      const z = positions[ix + 2];

      const [cx, cy, cz] = curlNoise(x * 0.1, y * 0.1, z * 0.1, time);

      velocities[ix] += cx * 0.002 * speed;
      velocities[ix + 1] += cy * 0.002 * speed;
      velocities[ix + 2] += cz * 0.001 * speed;

      velocities[ix] *= 0.98;
      velocities[ix + 1] *= 0.98;
      velocities[ix + 2] *= 0.98;

      positions[ix] += velocities[ix];
      positions[ix + 1] += velocities[ix + 1];
      positions[ix + 2] += velocities[ix + 2];

      if (Math.abs(positions[ix]) > 12) positions[ix] *= -0.5;
      if (Math.abs(positions[ix + 1]) > 12) positions[ix + 1] *= -0.5;
      if (Math.abs(positions[ix + 2]) > 6) positions[ix + 2] *= -0.5;

      const scale = (0.02 + Math.sin(time + i * 0.01) * 0.01) * pulse;
      dummy.position.set(positions[ix], positions[ix + 1], positions[ix + 2]);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const colorIdx = i % 3;
      const col = currentColors.current[colorIdx];
      colorObj.setRGB(col[0] / 255, col[1] / 255, col[2] / 255);
      mesh.setColorAt(i, colorObj);
    }

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshBasicMaterial transparent opacity={0.6} toneMapped={false} />
    </instancedMesh>
  );
}

// ─── Camera Drift ────────────────────────────────────────────────

function CameraDrift({ isPlaying }: { isPlaying: boolean }) {
  useFrame(({ camera, clock }) => {
    const t = clock.getElapsedTime();
    const speed = isPlaying ? 1 : 0.3;
    camera.position.x = Math.sin(t * 0.1 * speed) * 2;
    camera.position.y = Math.cos(t * 0.08 * speed) * 1.5;
    camera.lookAt(0, 0, 0);
  });
  return null;
}

// ─── Main Visualizer ─────────────────────────────────────────────

const DEFAULT_COLORS: [number, number, number][] = [
  [155, 122, 216],
  [100, 180, 255],
  [200, 100, 255],
];

export default function Visualizer() {
  const { currentTrack, playback } = useRmhMusicStore();
  const [colors, setColors] = useState(DEFAULT_COLORS);

  useEffect(() => {
    if (currentTrack?.albumArt) {
      extractDominantColors(currentTrack.albumArt).then(setColors);
    } else {
      setColors(DEFAULT_COLORS);
    }
  }, [currentTrack?.albumArt]);

  return (
    <div className="fixed inset-0 -z-10">
      <Canvas
        camera={{ position: [0, 0, 15], fov: 60 }}
        dpr={[1, 1.5]}
        gl={{ antialias: false, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <ParticleField colors={colors} isPlaying={playback.isPlaying} />
        <CameraDrift isPlaying={playback.isPlaying} />
      </Canvas>
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60 pointer-events-none" />
    </div>
  );
}
