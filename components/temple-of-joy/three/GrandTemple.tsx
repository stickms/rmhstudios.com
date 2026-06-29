'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { getGlowTexture } from './glowTexture';
import { getProgression } from './progression';

/**
 * The temple architecture. It grows *grander* as the game progresses: more
 * concentric pillar rings rise, the dais widens, ceremonial halo-rings appear and
 * orbit the sun, floating shards accrue, and everything glows more intensely.
 * Structural counts come from a coarse 1.5s sample (no per-frame React work);
 * brightness/animation is driven live in the render loop.
 */
export function GrandTemple() {
  const dark = useTempleStore((s) => s.theme) === 'dark';
  const glow = useMemo(() => getGlowTexture(), []);

  // Coarse structural state (how elaborate the temple is) — sampled, not per-frame.
  const [shape, setShape] = useState({ pillarRings: 1, haloRings: 0, tier: 0 });
  useEffect(() => {
    const sample = () => {
      const p = getProgression(useTempleStore.getState());
      setShape((prev) =>
        prev.pillarRings === p.pillarRings && prev.haloRings === p.haloRings && prev.tier === p.tier
          ? prev
          : { pillarRings: p.pillarRings, haloRings: p.haloRings, tier: p.tier },
      );
    };
    sample();
    const id = window.setInterval(sample, 1500);
    return () => window.clearInterval(id);
  }, []);

  const halos = useRef<THREE.Group>(null);
  const shards = useRef<THREE.Group>(null);
  const litMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const intensity = useRef(0.3);
  const sampler = useRef(0);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    sampler.current += dt;
    if (sampler.current > 0.4) {
      sampler.current = 0;
      intensity.current = getProgression(useTempleStore.getState()).intensity;
    }
    const glowPulse = 0.35 + intensity.current * 0.9 + Math.sin(t * 2) * 0.1;
    for (const m of litMats.current) m.emissiveIntensity = glowPulse;

    if (halos.current) {
      halos.current.children.forEach((ring, i) => {
        ring.rotation.z += dt * (0.12 + i * 0.05);
        ring.rotation.x = 0.4 + Math.sin(t * 0.3 + i) * 0.15;
      });
    }
    if (shards.current) {
      shards.current.rotation.y += dt * 0.25;
      shards.current.children.forEach((sh, i) => {
        sh.position.y = 3 + Math.sin(t * 0.8 + i) * 0.5;
        sh.rotation.x += dt * 0.5;
        sh.rotation.y += dt * 0.7;
      });
    }
  });

  litMats.current = [];
  const registerLit = (m: THREE.MeshStandardMaterial | null) => {
    if (m && !litMats.current.includes(m)) litMats.current.push(m);
  };

  const stone = dark ? '#9c7038' : '#c9a05a';
  const stoneDark = dark ? '#6f4e25' : '#a07c41';
  const daisScale = 1 + shape.tier * 0.06;

  return (
    <group>
      {/* Sacred dais — widens with grandeur */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={daisScale}>
        <circleGeometry args={[7, 64]} />
        <meshStandardMaterial color={dark ? '#241809' : '#cdbb95'} metalness={0.25} roughness={0.85} />
      </mesh>
      <mesh position={[0, 0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={daisScale}>
        <ringGeometry args={[4.4, 4.7, 64]} />
        <meshStandardMaterial ref={registerLit} color="#caa15a" emissive="#ff9d2a" emissiveIntensity={0.4} metalness={0.6} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>

      {/* Stepped ziggurat base */}
      {[
        { y: 0.3, r: 3.4, h: 0.6 },
        { y: 0.9, r: 2.7, h: 0.6 },
        { y: 1.45, r: 2.05, h: 0.5 },
        { y: 1.95, r: 1.4, h: 0.5 },
      ].map((step, i) => (
        <mesh key={i} position={[0, step.y, 0]}>
          <cylinderGeometry args={[step.r, step.r + 0.2, step.h, 8]} />
          <meshStandardMaterial color={i % 2 === 0 ? stone : stoneDark} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}

      {/* Altar plinth under the sun */}
      <mesh position={[0, 2.4, 0]}>
        <cylinderGeometry args={[0.9, 1.2, 0.5, 8]} />
        <meshStandardMaterial ref={registerLit} color={stoneDark} emissive="#ff9d2a" emissiveIntensity={0.4} metalness={0.6} roughness={0.35} />
      </mesh>

      {/* Concentric pillar rings — more rings rise as the temple grows grander */}
      {Array.from({ length: shape.pillarRings }).map((_, ring) => {
        const radius = 3.2 + ring * 1.5;
        const count = 6 + ring * 3;
        const height = 2.4 + ring * 0.55 + shape.tier * 0.12;
        return Array.from({ length: count }).map((_unused, i) => {
          const a = (i / count) * Math.PI * 2 + ring * 0.3;
          const x = Math.cos(a) * radius;
          const z = Math.sin(a) * radius;
          return (
            <group key={`${ring}-${i}`} position={[x, 0, z]}>
              <mesh position={[0, height / 2, 0]}>
                <cylinderGeometry args={[0.16, 0.2, height, 8]} />
                <meshStandardMaterial ref={registerLit} color={stone} emissive="#ff9d2a" emissiveIntensity={0.35} metalness={0.4} roughness={0.5} />
              </mesh>
              <mesh position={[0, height + 0.12, 0]}>
                <boxGeometry args={[0.5, 0.2, 0.5]} />
                <meshStandardMaterial color={stoneDark} metalness={0.4} roughness={0.5} />
              </mesh>
              <sprite position={[0, height + 0.45, 0]} scale={0.6}>
                <spriteMaterial map={glow} color="#ffb347" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} opacity={0.85} />
              </sprite>
            </group>
          );
        });
      })}

      {/* Ceremonial halo-rings orbiting the sun */}
      <group ref={halos} position={[0, 4.6, 0]}>
        {Array.from({ length: shape.haloRings }).map((_, i) => (
          <mesh key={i} rotation={[0.4, 0, i * 0.6]}>
            <torusGeometry args={[1.7 + i * 0.55, 0.05, 12, 64]} />
            <meshStandardMaterial color="#e8b860" emissive="#c98e2a" emissiveIntensity={0.7} metalness={1} roughness={0.25} toneMapped={false} />
          </mesh>
        ))}
      </group>

      {/* Floating shards accrue at high grandeur */}
      <group ref={shards} position={[0, 0, 0]}>
        {Array.from({ length: Math.min(12, shape.tier) }).map((_, i) => {
          const a = (i / Math.min(12, Math.max(1, shape.tier))) * Math.PI * 2;
          const r = 5 + (i % 3) * 0.8;
          return (
            <mesh key={i} position={[Math.cos(a) * r, 3, Math.sin(a) * r]}>
              <octahedronGeometry args={[0.22, 0]} />
              <meshStandardMaterial color="#ffe1a0" emissive="#ffb347" emissiveIntensity={1.4} metalness={0.6} roughness={0.2} toneMapped={false} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}
