'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import { computeCanAscend } from '@/lib/temple-of-joy/engine';
import { getGlowTexture } from './glowTexture';
import { useTap } from './useTap';
import { Label3D } from './ui3d/Label3D';

/**
 * A radiant obelisk on the temple grounds representing Ascension. It brightens
 * with accumulated Radiance, pulses invitingly when an Ascension is available,
 * and opens the Ascension screen when tapped — the in-world gateway to the
 * meta-prestige layer.
 */
export function AscensionMonument() {
  const { t } = useTranslation('c-temple-of-joy');
  const glow = useMemo(() => getGlowTexture(), []);
  const obelisk = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Sprite>(null);
  const [snap, setSnap] = useState({ radiance: 0, lifetimeRadiance: 0, canAscend: false });

  useEffect(() => {
    const sample = () => {
      const s = useTempleStore.getState();
      setSnap({ radiance: s.radiance, lifetimeRadiance: s.lifetimeRadiance, canAscend: computeCanAscend(s) });
    };
    sample();
    const id = window.setInterval(sample, 800);
    return () => window.clearInterval(id);
  }, []);

  useFrame((state) => {
    const t2 = state.clock.elapsedTime;
    const lit = 0.5 + Math.min(2.5, snap.radiance * 0.05) + (snap.canAscend ? 1.2 + Math.sin(t2 * 4) * 0.6 : 0);
    if (obelisk.current) obelisk.current.emissiveIntensity = lit;
    if (halo.current) {
      const m = halo.current.material as THREE.SpriteMaterial;
      m.opacity = 0.25 + Math.min(0.4, snap.radiance * 0.01) + (snap.canAscend ? 0.3 + Math.sin(t2 * 4) * 0.2 : 0);
      halo.current.scale.setScalar(2 + (snap.canAscend ? 0.6 + Math.sin(t2 * 3) * 0.2 : 0));
    }
  });

  const tap = useTap(() => useTempleStore.getState().setActiveTab('ascension'));

  // Sits off to one side of the dais.
  return (
    <group position={[6.5, 0, -2]}>
      <mesh position={[0, 1.6, 0]} {...tap}>
        <cylinderGeometry args={[0.25, 0.4, 3.2, 4]} />
        <meshStandardMaterial
          ref={obelisk}
          color="#caa15a"
          emissive="#ffcf6b"
          emissiveIntensity={0.6}
          metalness={0.8}
          roughness={0.25}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[0, 3.35, 0]} {...tap}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshStandardMaterial color="#fff2d0" emissive="#ffd27a" emissiveIntensity={2} metalness={0.5} roughness={0.15} toneMapped={false} />
      </mesh>
      <sprite ref={halo} position={[0, 3.35, 0]} scale={2}>
        <spriteMaterial map={glow} color="#ffe6b0" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} opacity={0.3} />
      </sprite>

      {snap.canAscend && (
        <Label3D text={`☀ ${t('ascension-ready', { defaultValue: 'Ascension ready' })}`} height={0.4} options={{ color: '#f0c84a', fontSize: 44 }} position={[0, 4.3, 0]} />
      )}
    </group>
  );
}
