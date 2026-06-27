"use client";
import type { ReactNode } from 'react';
import { RigidBody } from '@react-three/rapier';
import { PALETTE, matteMaterialProps } from '../../models/palette';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WallDef {
  pos: [number, number, number];
  size: [number, number, number];
}

export interface GroundDef {
  /** World-space centre of the ground plane — y should be 0. */
  center: [number, number, number];
  /** [width (X), depth (Z)] of the ground plane. */
  size: [number, number];
  /** Hex colour string from PALETTE. */
  color: string;
}

interface Props {
  ground: GroundDef;
  /** Array of wall segments; each gets a Rapier fixed cuboid collider. */
  walls: WallDef[];
  children?: ReactNode;
}

// ─── District wall — Rapier fixed cuboid ────────────────────────────────────

function DistrictWall({ pos, size }: WallDef) {
  return (
    <RigidBody type="fixed" colliders="cuboid" position={pos}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={size} />
        <meshStandardMaterial {...matteMaterialProps(PALETTE.wall)} />
      </mesh>
    </RigidBody>
  );
}

// ─── DistrictScene ───────────────────────────────────────────────────────────
//
// Renders:
//   • a Rapier fixed-collider ground plane positioned at ground.center
//   • wall segments (each with its own Rapier fixed-cuboid collider)
//   • children (buildings, stalls, props, etc.)
//
// Corridor gaps are left open in the wall array — the caller excludes the gap
// segments.  Gate barriers (Task 6) will slot into those openings later.

export function DistrictScene({ ground, walls, children }: Props) {
  return (
    <group>
      {/* Ground plane — fixed Rapier body; auto-cuboid from rotated plane geometry */}
      <RigidBody type="fixed" colliders="cuboid" position={ground.center}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={ground.size} />
          <meshStandardMaterial {...matteMaterialProps(ground.color)} />
        </mesh>
      </RigidBody>

      {/* Perimeter walls with corridor gaps */}
      {walls.map((w, i) => (
        <DistrictWall key={i} pos={w.pos} size={w.size} />
      ))}

      {children}
    </group>
  );
}
