'use client';

/**
 * Everyone who is not the player: customers walking to and from their stalls and farmhands going about their day.
 * The simulation moves them in 50 ms ticks along routes that hop up ledges and drop down cliffs; here each one is
 * drawn between its last two ticks (so motion is smooth at any frame rate) and its limbs are driven by what it is
 * doing — walking swings, a jump tucks the legs, a fall throws the arms up, and work is a bob over the crop.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { locomotionBlend } from '@/lib/hearthworks/avatar';
import { moverY, stepTicks, type Mover } from '@/lib/hearthworks/nav';
import { SKIN_LOOKS, type SkinLook } from '@/lib/hearthworks/skins';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';
import { TICK_MS, type Worker } from '@/lib/hearthworks/world';
import { Figure } from './Figure';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Smoothing toward a target at `rate` per second, independent of frame rate. */
const ease = (dt: number, rate: number) => 1 - Math.exp(-rate * dt);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

interface Sample {
  x: number;
  y: number;
  z: number;
}

interface Pose {
  ready: boolean;
  tick: number;
  prev: Sample;
  cur: Sample;
  yaw: number;
  speed: number;
  phase: number;
  clock: number;
  jump: number;
  fall: number;
  work: number;
}

const newPose = (): Pose => ({
  ready: false,
  tick: -1,
  prev: { x: 0, y: 0, z: 0 },
  cur: { x: 0, y: 0, z: 0 },
  yaw: 0,
  speed: 0,
  phase: 0,
  clock: 0,
  jump: 0,
  fall: 0,
  work: 0,
});

function Person({ kind, id, look }: { kind: 'npc' | 'worker'; id: number; look: SkinLook }) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const pose = useRef<Pose>(newPose());

  useFrame((_, delta) => {
    const world = hearthworksStore.getState().world;
    const agent: (Mover & Partial<Pick<Worker, 'state'>>) | undefined =
      kind === 'npc' ? world.npcs.find((n) => n.id === id) : world.workers.find((k) => k.id === id);
    const g = root.current;
    if (!agent || !g) return;
    const dt = Math.min(delta, 0.1);
    const p = pose.current;

    // Sample the simulation once per tick; draw between the last two samples.
    if (world.tick !== p.tick) {
      const now = { x: agent.x, y: moverY(world, agent), z: agent.z };
      // After a gap (a background tab catching up, a loaded save) snap rather than glide across the map.
      p.prev = p.ready && world.tick - p.tick <= 1 ? p.cur : now;
      p.cur = now;
      p.tick = world.tick;
    }
    if (!p.ready) {
      p.ready = true;
      p.yaw = agent.yaw;
      g.visible = true;
    }
    const a = Math.min(1, Math.max(0, world.accMs / TICK_MS));
    g.position.set(
      lerp(p.prev.x, p.cur.x, a),
      lerp(p.prev.y, p.cur.y, a),
      lerp(p.prev.z, p.cur.z, a),
    );
    p.yaw += wrapAngle(agent.yaw - p.yaw) * ease(dt, 12);
    g.rotation.y = p.yaw;

    // What they are doing right now.
    const step = agent.path[0];
    const moving = step !== undefined && agent.leg > 0;
    const progress = moving
      ? agent.leg / stepTicks(step.kind, step.x - agent.fromX, step.z - agent.fromZ)
      : 0;
    const jumpTarget = moving && step.kind === 'jump' ? 1 : 0;
    const fallTarget = moving && step.kind === 'fall' && progress > 0.3 ? 1 : 0;
    const workTarget = agent.state === 'working' ? 1 : 0;
    p.jump += (jumpTarget - p.jump) * ease(dt, 16);
    p.fall += (fallTarget - p.fall) * ease(dt, 16);
    p.work += (workTarget - p.work) * ease(dt, 8);

    // Ground speed from how far they moved this tick, smoothed; the gait advances with distance so feet never skate.
    const tickDist = Math.hypot(p.cur.x - p.prev.x, p.cur.z - p.prev.z);
    const speed = moving && step.kind === 'walk' ? tickDist / (TICK_MS / 1000) : 0;
    p.speed += (speed - p.speed) * ease(dt, 10);
    p.clock += dt;
    p.phase += p.speed * dt * 6.2;

    const air = Math.min(1, p.jump + p.fall);
    const ground = 1 - air;
    const b = locomotionBlend(p.speed);
    const swing = Math.sin(p.phase) * 0.62 * b.walk * ground;
    const hack = Math.sin(p.clock * 9);

    // Legs: stride on the ground, knees tucked in a jump, dangling in a fall.
    const legTuck = -0.95 * p.jump + -0.2 * p.fall;
    if (legL.current) legL.current.rotation.x = swing * (1 - p.work) + legTuck;
    if (legR.current)
      legR.current.rotation.x = -swing * (1 - p.work) + legTuck * 0.6 + 0.25 * p.fall;
    // Arms: counter-swing; forward and up in a jump; flung overhead in a fall; chopping motion when working.
    const armWalk = -swing * 0.9;
    const armFall = -2.6 + Math.sin(p.clock * 14) * 0.15;
    const armJump = -1.1;
    const armWorkL = -0.7 + hack * 0.25;
    const armWorkR = -0.9 + Math.sin(p.clock * 9 + Math.PI) * 0.6;
    const armAir = p.fall > p.jump ? armFall : armJump;
    const armsAirBlend = Math.max(p.jump, p.fall);
    if (armL.current) {
      const base = lerp(armWalk, armAir, armsAirBlend);
      armL.current.rotation.x = lerp(base, armWorkL, p.work);
    }
    if (armR.current) {
      const base = lerp(-armWalk, armAir, armsAirBlend);
      armR.current.rotation.x = lerp(base, armWorkR, p.work);
    }
    if (body.current) {
      const bob = Math.abs(Math.sin(p.phase)) * 0.016 * b.walk * ground;
      const breathe = Math.sin(p.clock * 2.1) * 0.012 * b.idle * ground;
      body.current.position.y = bob - p.work * (0.015 + 0.015 * (hack * 0.5 + 0.5));
      body.current.scale.y = 1 + breathe;
      body.current.rotation.x = b.walk * 0.05 + p.work * (0.3 + 0.12 * hack) + p.fall * -0.15;
    }
  });

  return (
    <group ref={root} visible={false}>
      <Figure look={look} refs={{ body, legL, legR, armL, armR }} />
    </group>
  );
}

export function People() {
  const world = useHearthworks((s) => s.world);
  // Who is in the world changes only through events, which bump `rev`; where they stand changes every frame and is read there.
  useHearthworks((s) => s.rev);
  return (
    <>
      {world.npcs.map((n) => (
        <Person key={`n${n.id}`} kind="npc" id={n.id} look={SKIN_LOOKS[n.look]} />
      ))}
      {world.workers.map((k) => (
        <Person key={`w${k.id}`} kind="worker" id={k.id} look={SKIN_LOOKS.worker} />
      ))}
    </>
  );
}
