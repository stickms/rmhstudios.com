'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useTranslation } from 'react-i18next';
import { useTempleStore } from '@/lib/temple-of-joy/store';
import type { RelicId } from '@/lib/temple-of-joy/types';
import { getGlowTexture } from './glowTexture';
import { useTap } from './useTap';

interface GemProps {
  relicId: RelicId;
  slot: number;
  total: number;
}

function RelicGem({ relicId, slot, total }: GemProps) {
  const color = useMemo(() => new THREE.Color().setHSL((0.55 + slot * 0.12) % 1, 0.7, 0.6), [slot]);
  const mesh = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (mesh.current) {
      const a = (slot / Math.max(1, total)) * Math.PI * 2 + t * 0.4;
      const r = 1.25;
      mesh.current.position.set(Math.cos(a) * r, 2.4 + Math.sin(t * 1.5 + slot) * 0.12, Math.sin(a) * r);
      mesh.current.rotation.y += 0.03;
      mesh.current.rotation.x += 0.02;
      mesh.current.scale.setScalar(hovered ? 0.34 : 0.26);
    }
  });

  const tap = useTap(() => useTempleStore.getState().unequipRelic(relicId));

  return (
    <mesh
      ref={mesh}
      {...tap}
      onPointerOver={() => setHovered(true)}
      onPointerOut={() => setHovered(false)}
    >
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.4} metalness={0.6} roughness={0.15} toneMapped={false} />
    </mesh>
  );
}

/**
 * The Relic Altar — equipped relics circle a glowing altar as gemstones. Tap a
 * gem to unequip it; tap the altar to open the relic browser (where karma buys
 * and equips new relics). Glows brighter the more relics are attuned.
 */
export function RelicAltar() {
  const { t } = useTranslation('c-temple-of-joy');
  const glow = useMemo(() => getGlowTexture(), []);
  const altarMat = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Sprite>(null);
  const [equipped, setEquipped] = useState<RelicId[]>([]);

  useEffect(() => {
    const sample = () => setEquipped([...useTempleStore.getState().activeRelics]);
    sample();
    const id = window.setInterval(sample, 600);
    return () => window.clearInterval(id);
  }, []);

  useFrame((state) => {
    const t2 = state.clock.elapsedTime;
    const lit = 0.4 + equipped.length * 0.25 + Math.sin(t2 * 2) * 0.1;
    if (altarMat.current) altarMat.current.emissiveIntensity = lit;
    if (halo.current) (halo.current.material as THREE.SpriteMaterial).opacity = 0.2 + equipped.length * 0.05;
  });

  const tapAltar = useTap(() => useTempleStore.getState().setActiveTab('relics'));

  return (
    <group position={[-6.5, 0, -2]}>
      {/* Altar base */}
      <mesh position={[0, 0.5, 0]} {...tapAltar}>
        <cylinderGeometry args={[1, 1.3, 1, 8]} />
        <meshStandardMaterial color="#6f4e25" metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh position={[0, 1.1, 0]} {...tapAltar}>
        <cylinderGeometry args={[0.7, 0.9, 0.3, 8]} />
        <meshStandardMaterial
          ref={altarMat}
          color="#caa15a"
          emissive="#ffcf6b"
          emissiveIntensity={0.5}
          metalness={0.7}
          roughness={0.3}
          toneMapped={false}
        />
      </mesh>
      <sprite ref={halo} position={[0, 2.4, 0]} scale={2.6}>
        <spriteMaterial map={glow} color="#cfe2ff" transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} opacity={0.25} />
      </sprite>

      {equipped.map((id, i) => (
        <RelicGem key={id} relicId={id} slot={i} total={equipped.length} />
      ))}

      {equipped.length === 0 && (
        <Html position={[0, 2.6, 0]} center distanceFactor={16} style={{ pointerEvents: 'none' }}>
          <div className="temple-world-hint">💍 {t('relic-altar', { defaultValue: 'Relic Altar' })}</div>
        </Html>
      )}
    </group>
  );
}
