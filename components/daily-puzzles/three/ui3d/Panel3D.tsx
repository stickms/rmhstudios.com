'use client';

import { useRef, type ReactNode } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Billboard, RoundedBox } from '@react-three/drei';

interface Panel3DProps {
  width: number;
  height: number;
  children?: ReactNode;
  position?: [number, number, number];
  billboard?: boolean;
  accent?: string;
}

/**
 * A floating 3D panel slab — a translucent dark surface with a glowing accent
 * border that gently breathes with energy. Used as the backing for in-world menus
 * and modals; children are laid out in its local space (origin at centre).
 */
export function Panel3D({ width, height, children, position = [0, 0, 0], billboard = true, accent = '#d4a847' }: Panel3DProps) {
  const border = useRef<THREE.MeshStandardMaterial>(null);

  useFrame((state) => {
    if (border.current) border.current.emissiveIntensity = 0.5 + Math.sin(state.clock.elapsedTime * 2) * 0.25;
  });

  const inner = (
    <>
      {/* Glowing border frame (slightly larger slab behind) */}
      <RoundedBox args={[width + 0.12, height + 0.12, 0.06]} radius={0.14} smoothness={3} position={[0, 0, -0.04]}>
        <meshStandardMaterial ref={border} color={accent} emissive={accent} emissiveIntensity={0.5} metalness={0.6} roughness={0.3} toneMapped={false} />
      </RoundedBox>
      {/* Surface */}
      <RoundedBox args={[width, height, 0.1]} radius={0.12} smoothness={3}>
        <meshStandardMaterial color="#160f08" emissive="#160f08" emissiveIntensity={0.2} metalness={0.3} roughness={0.6} transparent opacity={0.92} />
      </RoundedBox>
      <group position={[0, 0, 0.06]}>{children}</group>
    </>
  );

  return billboard ? <Billboard position={position}>{inner}</Billboard> : <group position={position}>{inner}</group>;
}
