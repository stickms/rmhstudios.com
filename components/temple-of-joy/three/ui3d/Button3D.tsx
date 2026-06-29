'use client';

import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Billboard, RoundedBox } from '@react-three/drei';
import { makeLabelTexture } from './canvasLabel';
import { getGlowTexture } from '../glowTexture';
import { templeAudio } from '@/lib/temple-of-joy/audio';
import { useTap } from '../useTap';

interface Button3DProps {
  label: string;
  onClick: () => void;
  width?: number;
  height?: number;
  enabled?: boolean;
  /** Accent/emissive colour. */
  color?: string;
  textColor?: string;
  /** Energetic pulsing glow (e.g. affordable / ready). */
  pulse?: boolean;
  fontSize?: number;
  position?: [number, number, number];
  billboard?: boolean;
}

/**
 * A real 3D button: a rounded slab with a canvas-text face, a glow halo and
 * springy hover/press animation. Emissive pulses when `pulse` is set, giving the
 * UI lots of energy. Tap vs camera-drag is handled by useTap.
 */
export function Button3D({
  label,
  onClick,
  width = 2,
  height = 0.6,
  enabled = true,
  color = '#d4a847',
  textColor = '#ffffff',
  pulse = false,
  fontSize = 44,
  position = [0, 0, 0],
  billboard = true,
}: Button3DProps) {
  const lbl = useMemo(() => makeLabelTexture(label, { fontSize, color: textColor, maxWidth: 520 }), [label, fontSize, textColor]);
  const glow = useMemo(() => getGlowTexture(), []);
  const accent = useMemo(() => new THREE.Color(color), [color]);

  const group = useRef<THREE.Group>(null);
  const backMat = useRef<THREE.MeshStandardMaterial>(null);
  const halo = useRef<THREE.Sprite>(null);
  const [hovered, setHovered] = useState(false);
  const punch = useRef(0);

  // Fit the label inside the button face.
  const maxW = width * 0.88;
  const maxH = height * 0.62;
  let lw = maxW;
  let lh = lw / lbl.aspect;
  if (lh > maxH) { lh = maxH; lw = lh * lbl.aspect; }

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    punch.current = Math.max(0, punch.current - dt * 4);
    if (group.current) {
      const target = (hovered && enabled ? 1.09 : 1) * (1 - punch.current * 0.12);
      group.current.scale.x += (target - group.current.scale.x) * Math.min(1, dt * 14);
      group.current.scale.y = group.current.scale.z = group.current.scale.x;
    }
    if (backMat.current) {
      const base = enabled ? (pulse ? 0.55 + Math.sin(t * 5) * 0.4 : 0.28) : 0.05;
      backMat.current.emissiveIntensity = base + (hovered && enabled ? 0.6 : 0);
    }
    if (halo.current) {
      const m = halo.current.material as THREE.SpriteMaterial;
      m.opacity = (pulse && enabled ? 0.4 + Math.sin(t * 5) * 0.2 : 0.12) + (hovered && enabled ? 0.3 : 0);
      halo.current.scale.set(width * 1.5, height * 2.2, 1);
    }
  });

  const tap = useTap(() => { if (enabled) { templeAudio.playClick(); onClick(); } });

  const content = (
    <group ref={group} position={position}>
      <sprite ref={halo} position={[0, 0, -0.08]} scale={[width * 1.5, height * 2.2, 1]}>
        <spriteMaterial map={glow} color={accent} transparent depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} opacity={0.12} />
      </sprite>
      <RoundedBox
        args={[width, height, 0.14]}
        radius={Math.min(0.12, height * 0.28)}
        smoothness={3}
        {...tap}
        onPointerOver={() => setHovered(true)}
        onPointerOut={() => setHovered(false)}
        onPointerDown={(e: ThreeEvent<PointerEvent>) => { punch.current = 1; tap.onPointerDown(e); }}
      >
        <meshStandardMaterial
          ref={backMat}
          color={enabled ? '#2c1d12' : '#1a120b'}
          emissive={accent}
          emissiveIntensity={0.28}
          metalness={0.5}
          roughness={0.35}
          transparent
          opacity={0.96}
        />
      </RoundedBox>
      <mesh position={[0, 0, 0.085]} renderOrder={3}>
        <planeGeometry args={[lw, lh]} />
        <meshBasicMaterial map={lbl.texture} transparent depthWrite={false} toneMapped={false} opacity={enabled ? 1 : 0.5} />
      </mesh>
    </group>
  );

  return billboard ? <Billboard>{content}</Billboard> : content;
}
