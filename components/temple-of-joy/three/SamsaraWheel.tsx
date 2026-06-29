'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { useTap } from './useTap';

const SPOKES = 10; // one per wheel tier

/**
 * The Wheel of Samsara as a real, spinning 3D wheel standing on the temple
 * grounds. It turns continuously — faster the more Bliss Shards you hold and the
 * more prestiges you've completed — and opens the Wheel screen when tapped, where
 * shards buy the tiered upgrade tree.
 */
export function SamsaraWheel() {
  const { t } = useTranslation('c-temple-of-joy');
  const wheel = useRef<THREE.Group>(null);
  const spokeMats = useRef<THREE.MeshStandardMaterial[]>([]);
  const [snap, setSnap] = useState({ shards: 0, prestige: 0 });

  useEffect(() => {
    const sample = () => {
      const s = useTempleStore.getState();
      setSnap({ shards: s.blissShards, prestige: s.prestigeCount });
    };
    sample();
    const id = window.setInterval(sample, 800);
    return () => window.clearInterval(id);
  }, []);

  const spin = useMemo(() => 0.15 + Math.min(1.5, snap.shards * 0.01) + snap.prestige * 0.02, [snap]);

  spokeMats.current = [];
  const reg = (m: THREE.MeshStandardMaterial | null) => {
    if (m && !spokeMats.current.includes(m)) spokeMats.current.push(m);
  };

  useFrame((state, dt) => {
    if (wheel.current) wheel.current.rotation.z -= dt * spin;
    const t = state.clock.elapsedTime;
    spokeMats.current.forEach((m, i) => {
      m.emissiveIntensity = 0.4 + Math.sin(t * 2 + i * 0.6) * 0.3 + Math.min(1.2, snap.shards * 0.008);
    });
  });

  const tap = useTap(() => useTempleStore.getState().setActiveTab('wheel'));

  return (
    <group position={[0, 2.6, -8]} rotation={[0, 0, 0]}>
      {/* Hub */}
      <mesh {...tap} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.5, 16]} />
        <meshStandardMaterial color="#caa15a" emissive="#ffcf6b" emissiveIntensity={0.6} metalness={0.8} roughness={0.25} toneMapped={false} />
      </mesh>

      <group ref={wheel}>
        {/* Outer rim */}
        <mesh {...tap}>
          <torusGeometry args={[2.4, 0.18, 16, 64]} />
          <meshStandardMaterial color="#b98a4e" metalness={0.7} roughness={0.35} />
        </mesh>
        {/* Inner rim */}
        <mesh {...tap}>
          <torusGeometry args={[1.7, 0.08, 12, 48]} />
          <meshStandardMaterial color="#8a6534" metalness={0.6} roughness={0.4} />
        </mesh>
        {/* Spokes — one glowing bar per tier */}
        {Array.from({ length: SPOKES }).map((_, i) => {
          const a = (i / SPOKES) * Math.PI * 2;
          return (
            <group key={i} rotation={[0, 0, a]}>
              <mesh position={[0, 1.2, 0]} {...tap}>
                <boxGeometry args={[0.09, 2.4, 0.09]} />
                <meshStandardMaterial ref={reg} color="#e8b860" emissive="#ff9d2a" emissiveIntensity={0.5} metalness={0.7} roughness={0.3} toneMapped={false} />
              </mesh>
              {/* Tier jewel at the rim */}
              <mesh position={[0, 2.4, 0]} {...tap}>
                <octahedronGeometry args={[0.16, 0]} />
                <meshStandardMaterial
                  color={new THREE.Color().setHSL((i / SPOKES) % 1, 0.7, 0.6)}
                  emissive={new THREE.Color().setHSL((i / SPOKES) % 1, 0.7, 0.5)}
                  emissiveIntensity={1.4}
                  toneMapped={false}
                />
              </mesh>
            </group>
          );
        })}
      </group>

      <Html position={[0, -3, 0]} center distanceFactor={18} style={{ pointerEvents: 'none' }}>
        <div className="temple-world-hint">🔄 {t('wheel-of-samsara', { defaultValue: 'Wheel of Samsara' })}</div>
      </Html>
    </group>
  );
}
