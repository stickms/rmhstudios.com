/**
 * A character built from a skin's look (features/hearthworks/engine/skins/looks.ts): torso, head, hat, prop, and limbs that pivot
 * at the shoulders and hips so a caller can swing them. Shared by the player's avatar and by everyone else.
 */

import type { RefObject } from 'react';
import type * as THREE from 'three';
import { PALETTE, type PaletteKey } from '@features/hearthworks/engine/art';
import { FIGURE_SCALE, type SkinLook } from '@features/hearthworks/engine/skins';

const mat = (key: PaletteKey) => <meshStandardMaterial color={PALETTE[key]} roughness={0.85} />;

function Hat({ look }: { look: SkinLook }) {
  const hat = look.hat;
  if (!hat) return null;
  switch (hat.kind) {
    case 'cap':
      return (
        <group position={[0, 1.2, 0]}>
          <mesh position={[0, 0.02, 0]}>
            <sphereGeometry args={[0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            {mat(hat.color)}
          </mesh>
          <mesh position={[0, 0, 0.17]}>
            <boxGeometry args={[0.24, 0.025, 0.14]} />
            {mat(hat.color)}
          </mesh>
        </group>
      );
    case 'helmet':
      return (
        <mesh position={[0, 1.2, 0]}>
          <sphereGeometry args={[0.235, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          {mat(hat.color)}
        </mesh>
      );
    case 'hardhat':
      return (
        <group position={[0, 1.2, 0]}>
          <mesh>
            <sphereGeometry args={[0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            {mat(hat.color)}
          </mesh>
          <mesh position={[0, -0.005, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.025, 16]} />
            {mat(hat.color)}
          </mesh>
        </group>
      );
    case 'wide':
      return (
        <group position={[0, 1.2, 0]}>
          <mesh position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.13, 0.17, 0.14, 14]} />
            {mat(hat.color)}
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.3, 0.3, 0.02, 18]} />
            {mat(hat.color)}
          </mesh>
        </group>
      );
    case 'mask':
      return (
        <mesh position={[0, 1.1, 0.03]}>
          <sphereGeometry args={[0.215, 14, 10]} />
          {mat(hat.color)}
        </mesh>
      );
    case 'visor':
      return (
        <group position={[0, 1.1, 0]}>
          <mesh>
            <sphereGeometry args={[0.225, 14, 10]} />
            {mat('stone')}
          </mesh>
          <mesh position={[0, 0.0, 0.16]}>
            <boxGeometry args={[0.3, 0.07, 0.1]} />
            {mat(hat.color)}
          </mesh>
        </group>
      );
    case 'hair':
      return (
        <mesh position={[0, 1.15, -0.02]}>
          <sphereGeometry args={[0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          {mat(hat.color)}
        </mesh>
      );
  }
}

function Prop({ look }: { look: SkinLook }) {
  switch (look.prop) {
    case 'briefcase':
      return (
        <mesh position={[0, -0.22, 0.02]}>
          <boxGeometry args={[0.07, 0.2, 0.26]} />
          {mat('wood')}
        </mesh>
      );
    case 'crowbar':
      return (
        <mesh position={[0, -0.24, 0.1]} rotation={[0.5, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.5, 6]} />
          {mat('stone')}
        </mesh>
      );
    case 'wrench':
      return (
        <mesh position={[0, -0.24, 0.08]} rotation={[0.4, 0, 0]}>
          <boxGeometry args={[0.04, 0.04, 0.34]} />
          {mat('stone')}
        </mesh>
      );
    default:
      return null;
  }
}


export { FIGURE_SCALE };

export interface FigureRefs {
  body?: RefObject<THREE.Group | null>;
  legL?: RefObject<THREE.Group | null>;
  legR?: RefObject<THREE.Group | null>;
  armL?: RefObject<THREE.Group | null>;
  armR?: RefObject<THREE.Group | null>;
}

export function Figure({ look, refs = {} }: { look: SkinLook; refs?: FigureRefs }) {
  const w = look.build;
  return (
    <group scale={look.height * FIGURE_SCALE}>
      <group ref={refs.body}>
        <mesh position={[0, 0.7, 0]}>
          <boxGeometry args={[0.34 * w, 0.42, 0.2]} />
          {mat(look.suit)}
        </mesh>
        <mesh position={[0, 0.5, 0.0]}>
          <boxGeometry args={[0.35 * w, 0.06, 0.21]} />
          {mat(look.trim)}
        </mesh>
        <mesh position={[0, 1.08, 0]}>
          <sphereGeometry args={[0.18, 16, 12]} />
          {mat(look.skin)}
        </mesh>
        <Hat look={look} />
        <group ref={refs.armL} position={[0.22 * w, 0.88, 0]}>
          <mesh position={[0, -0.18, 0]}>
            <boxGeometry args={[0.09, 0.36, 0.09]} />
            {mat(look.suit)}
          </mesh>
        </group>
        <group ref={refs.armR} position={[-0.22 * w, 0.88, 0]}>
          <mesh position={[0, -0.18, 0]}>
            <boxGeometry args={[0.09, 0.36, 0.09]} />
            {mat(look.suit)}
          </mesh>
          <Prop look={look} />
        </group>
      </group>
      <group ref={refs.legL} position={[0.09 * w, 0.5, 0]}>
        <mesh position={[0, -0.22, 0]}>
          <boxGeometry args={[0.13, 0.44, 0.13]} />
          {mat(look.trim)}
        </mesh>
      </group>
      <group ref={refs.legR} position={[-0.09 * w, 0.5, 0]}>
        <mesh position={[0, -0.22, 0]}>
          <boxGeometry args={[0.13, 0.44, 0.13]} />
          {mat(look.trim)}
        </mesh>
      </group>
    </group>
  );
}
