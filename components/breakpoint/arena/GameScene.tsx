'use client';

import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useMemo, useRef, useState } from 'react';
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
  const baseFov = useMemo(() => (camera as THREE.PerspectiveCamera).fov ?? 75, [camera]);
  // Re-render whenever the actor roster changes (spawns / joins / removals) so
  // dynamically-added actors (zombies, late joiners) get mounted.
  const [, force] = useState(0);
  const rosterSig = useRef('');
  const specIdx = useRef(0);
  const lastCycle = useRef(0);
  const tmp = useRef(new THREE.Vector3());

  useFrame((_, dt) => {
    // (simulation is advanced by GameView's interval so it survives backgrounding)
    // detect roster changes → force a React re-render to (un)mount actors
    let sig = '';
    for (const a of world.actors) sig += a.id + ',';
    if (sig !== rosterSig.current) { rosterSig.current = sig; force((n) => n + 1); }

    const local = world.local;
    if (!local) return;
    const cam = camera as THREE.PerspectiveCamera;
    const now = world.now;
    const dead = !local.alive;

    if (dead && world.phase !== 'roundEnd') {
      // ── Spectate a living teammate (third-person chase) ──
      const mates = world.actors.filter((a) => a.alive && a.team === local.team && !a.isLocal);
      if (mates.length) {
        if (input.firing && now - lastCycle.current > 450) { specIdx.current++; lastCycle.current = now; }
        const tgt = mates[specIdx.current % mates.length];
        const eye = tgt.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
        const dist = 3.4, height = 1.1;
        tmp.current.set(tgt.pos.x - Math.sin(tgt.yaw) * dist, tgt.pos.y + eye + height, tgt.pos.z + Math.cos(tgt.yaw) * dist);
        camera.position.lerp(tmp.current, Math.min(1, dt * 6));
        camera.lookAt(tgt.pos.x, tgt.pos.y + eye, tgt.pos.z);
        if (cam.fov !== baseFov) { cam.fov = baseFov; cam.updateProjectionMatrix(); }
        return;
      }
      // nobody to spectate → look from the corpse
      camera.position.set(local.pos.x, local.pos.y + 0.6, local.pos.z);
      camera.rotation.set(local.pitch, -local.yaw, 0, 'YXZ');
      return;
    }

    // ── Alive: first-person ──
    const eye = local.crouch ? CROUCH_EYE_HEIGHT : EYE_HEIGHT;
    const recoilKick = local.recoil * 0.03;
    camera.position.set(local.pos.x, local.pos.y + eye, local.pos.z);
    camera.rotation.set(local.pitch + recoilKick, -local.yaw, 0, 'YXZ');
    const wpn = getWeapon(local.currentWeapon);
    const wantFov = input.ads && wpn.zoom ? baseFov * wpn.zoom : (input.ads ? baseFov * 0.82 : baseFov);
    cam.fov += (wantFov - cam.fov) * Math.min(1, dt * 12);
    cam.updateProjectionMatrix();
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
      {world.actors.filter((a) => !a.isLocal).map((a) => (
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
