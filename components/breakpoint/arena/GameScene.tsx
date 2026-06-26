'use client';

import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useMemo } from 'react';
import type { World, LocalInput } from '@/lib/breakpoint/engine/world';
import { getWeapon } from '@/lib/breakpoint/weapons';
import { EYE_HEIGHT, CROUCH_EYE_HEIGHT, PALETTE } from '@/lib/breakpoint/constants';
import { MapGeometry, Ground } from './Environment';
import { Character } from './Character';
import { Tracers, WorldEffects, DynamicWalls, SpikeMesh } from './Effects';
import { ViewModel } from './ViewModel';

/** In-canvas root: lights, environment, actors, fx, and per-frame camera +
 *  world simulation. Reads the mutable engine each frame (no React churn). */
export function GameScene({ world, input }: { world: World; input: LocalInput }) {
  const { camera } = useThree();
  // Actor set is fixed for the match → map once.
  const actors = useMemo(() => world.actors, [world]);
  const baseFov = useMemo(() => (camera as THREE.PerspectiveCamera).fov ?? 75, [camera]);

  useFrame((_, dt) => {
    // advance simulation (clamped)
    world.update(Math.min(50, dt * 1000));

    const local = world.local;
    if (local) {
      const eye = local.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
      // small recoil/death camera kick
      const recoilKick = local.recoil * 0.03;
      const dead = !local.alive;
      camera.position.set(local.pos.x, local.pos.y + (dead ? 0.5 : eye), local.pos.z);
      camera.rotation.set(local.pitch + recoilKick, -local.yaw, dead ? 0.5 : 0, 'YXZ');

      // ADS zoom
      const wpn = getWeapon(local.currentWeapon);
      const cam = camera as THREE.PerspectiveCamera;
      const wantFov = input.ads && wpn.zoom ? baseFov * wpn.zoom : (input.ads ? baseFov * 0.82 : baseFov);
      cam.fov += (wantFov - cam.fov) * Math.min(1, dt * 12);
      cam.updateProjectionMatrix();
    }
  });

  return (
    <>
      <hemisphereLight args={['#8a93a8', '#1b1f29', 1.1]} />
      <directionalLight
        position={[18, 30, 12]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-far={80}
      />
      <ambientLight intensity={0.35} />
      <color attach="background" args={[PALETTE.sky]} />
      <fog attach="fog" args={[PALETTE.sky, 40, 90]} />

      <Ground />
      <MapGeometry />
      {actors.filter((a) => !a.isLocal).map((a) => (
        <Character key={a.id} actor={a} getNow={() => world.now} />
      ))}
      <Tracers world={world} />
      <WorldEffects world={world} />
      <DynamicWalls world={world} />
      <SpikeMesh world={world} />
      <ViewModel world={world} input={input} />
    </>
  );
}
