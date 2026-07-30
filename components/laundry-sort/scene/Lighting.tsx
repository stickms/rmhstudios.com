'use client';

/**
 * Lighting for the laundry room.
 *
 * One key light with shadows (tier-gated), a cool fill from the opposite side
 * so garments read against the dark back wall, and a warm bounce off the floor.
 * Shadow map size comes from the render tier — the shadow is the first thing
 * that goes on a weak GPU, because cloth silhouettes stay legible without it.
 */

import { useMemo } from 'react';
import * as THREE from 'three';
import { ARENA } from '@/lib/laundry-sort/constants';
import type { QualityFlags } from '@/lib/render/tier';

export function Lighting({ quality }: { quality: QualityFlags }) {
  // A tight ortho frustum around the play slab: a bigger one wastes shadow
  // resolution on empty room and makes the cloth's contact shadows mushy.
  const shadowCamera = useMemo(
    () => ({
      left: -ARENA.halfWidth - 1,
      right: ARENA.halfWidth + 1,
      top: ARENA.spawnY,
      bottom: -1,
      near: 1,
      far: 26,
    }),
    [],
  );

  return (
    <>
      <ambientLight intensity={1.15} color="#cdd6ff" />

      <directionalLight
        position={[4.5, 9, 6.5]}
        intensity={2.6}
        color="#fff6e8"
        castShadow={quality.shadows}
        shadow-mapSize-width={quality.shadowMapSize}
        shadow-mapSize-height={quality.shadowMapSize}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-camera-left={shadowCamera.left}
        shadow-camera-right={shadowCamera.right}
        shadow-camera-top={shadowCamera.top}
        shadow-camera-bottom={shadowCamera.bottom}
        shadow-camera-near={shadowCamera.near}
        shadow-camera-far={shadowCamera.far}
      />

      {/* Cool rim from behind-left, so a garment turning edge-on still has an
          outline against the back wall. */}
      <directionalLight position={[-6, 5, -4]} intensity={0.95} color="#7aa2ff" />

      {/* Fill from the camera's own direction. Without it the face of a garment
          turned toward the player — which is most of them, most of the time —
          sits in its own shadow and the colour that the whole game is about
          becomes unreadable. */}
      <directionalLight position={[0, 4, 12]} intensity={1.1} color="#ffffff" />

      {/* Warm bounce off the floor, faked with a hemisphere rather than paid
          for with GI. */}
      <hemisphereLight args={[new THREE.Color('#4a5a8a'), new THREE.Color('#3a2f28'), 0.7]} />
    </>
  );
}
