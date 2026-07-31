'use client';

/**
 * Isleworks — chimney smoke.
 *
 * The city's one honest pollution indicator that needs no menu: if you can see
 * smoke, something near it is being made dirty. Only buildings that are actually
 * *running* emit — a factory with no power is a quiet factory, which is exactly
 * the read the warning pip is also giving.
 *
 * One instanced faceted sphere for the whole city. Each puff walks a fixed
 * lifetime, rising and swelling and fading by shrinking to nothing; there is no
 * transparency animation because a per-instance opacity would need a custom
 * material, and at this scale a puff that shrinks away is indistinguishable from
 * one that fades.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

import { tryGetDefinition } from '@/lib/isleworks/catalog';
import { footprintCenter } from '@/lib/isleworks/grid';
import { buildingModel } from '@/lib/isleworks/models';
import type { CityState } from '@/lib/isleworks/types';

import { world } from './clock';
import { GEOMETRY, scratch } from './geometry';

/** Puffs per chimney, and how long each one lives. */
const PER_STACK = 5;
const LIFETIME = 3.4;
const MAX_STACKS = 26;

interface Stack {
  x: number;
  y: number;
  z: number;
  /** Staggers the puffs so two chimneys never breathe in unison. */
  phase: number;
  strength: number;
}

function collectStacks(city: CityState): Stack[] {
  const stacks: Stack[] = [];
  for (const instance of city.buildings) {
    if (stacks.length >= MAX_STACKS) break;
    const def = tryGetDefinition(instance.definitionId);
    if (!def || instance.efficiency <= 0.15) continue;
    const model = buildingModel(def.modelId, instance.level, instance.gridX * 31 + instance.gridY);
    if (!model.smoke?.length) continue;

    const [cx, cz] = footprintCenter(
      instance.gridX,
      instance.gridY,
      def.footprint,
      instance.rotation,
      city.width,
      city.height,
    );
    const yaw = (instance.rotation * Math.PI) / 2;
    for (const [lx, ly, lz] of model.smoke) {
      const rx = lx * Math.cos(yaw) + lz * Math.sin(yaw);
      const rz = -lx * Math.sin(yaw) + lz * Math.cos(yaw);
      stacks.push({
        x: cx + rx,
        y: ly,
        z: cz + rz,
        phase: ((instance.gridX * 7 + instance.gridY * 13) % 100) / 100,
        strength: 0.6 + Math.min(1, (def.pollution ?? 6) / 24),
      });
    }
  }
  return stacks;
}

export function Smoke({ city, reducedMotion }: { city: CityState; reducedMotion: boolean }) {
  const stacks = useMemo(() => collectStacks(city), [city]);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = stacks.length * PER_STACK;

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || !count) return;

    let n = 0;
    for (const stack of stacks) {
      for (let p = 0; p < PER_STACK; p++) {
        const age = reducedMotion
          ? (p / PER_STACK) * LIFETIME
          : (world.time * 0.9 + stack.phase * LIFETIME + (p / PER_STACK) * LIFETIME) % LIFETIME;
        const t = age / LIFETIME;
        // Rise, drift downwind, swell, then shrink out of existence.
        const size = (0.1 + t * 0.34) * stack.strength * (1 - t * t);
        scratch.position.set(
          stack.x + t * 0.55 + Math.sin(t * 5 + stack.phase * 6) * 0.06,
          stack.y + t * 1.15,
          stack.z + t * 0.2,
        );
        scratch.euler.set(t * 2.1, stack.phase * 6.28, t * 1.4);
        scratch.quaternion.setFromEuler(scratch.euler);
        scratch.scale.set(size, size * 0.85, size);
        scratch.matrix.compose(scratch.position, scratch.quaternion, scratch.scale);
        mesh.setMatrixAt(n++, scratch.matrix);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  if (!count) return null;

  return (
    <instancedMesh
      ref={meshRef}
      args={[GEOMETRY.facet, undefined, count]}
      frustumCulled={false}
      raycast={() => null}
    >
      <meshLambertMaterial
        color="#e6e9f0"
        transparent
        opacity={0.6}
        flatShading
        depthWrite={false}
      />
    </instancedMesh>
  );
}
