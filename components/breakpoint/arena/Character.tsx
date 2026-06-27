'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Actor } from '@/lib/breakpoint/types';
import { getAgent } from '@/lib/breakpoint/agents';
import { TEAM_COLORS, ZOMBIE_TYPES } from '@/lib/breakpoint/constants';

/**
 * Low-poly humanoid with procedural animation. Body colour is the TEAM colour
 * (red attackers / blue defenders / green zombies) so identification is instant,
 * and each team has a distinct silhouette (attackers = angular shoulder pads +
 * visor spike, defenders = domed helmet + backpack). Agent identity is a small
 * accent stripe. Zombies get type-based colour, size, and a hunched posture.
 */
export function Character({ actor, getNow }: { actor: Actor; getNow?: () => number }) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Mesh>(null);
  const legR = useRef<THREE.Mesh>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const head = useRef<THREE.Mesh>(null);
  const torsoMat = useRef<THREE.MeshLambertMaterial>(null);
  const phase = useRef(0);

  const agent = getAgent(actor.agentId);
  const isZombie = !!actor.isZombie;
  const team = actor.team;
  const isAtt = team === 'attackers';
  const zType = isZombie ? (ZOMBIE_TYPES[actor.zombieType ?? 'walker'] ?? ZOMBIE_TYPES.walker) : null;
  const bodyColor = isZombie ? zType!.color : isAtt ? TEAM_COLORS.attackers : TEAM_COLORS.defenders;
  const limbColor = isZombie ? zType!.limb : isAtt ? '#b8323c' : '#2a5bd0';
  const accent = agent.color;
  const scale = isZombie ? zType!.scale : 1;

  useFrame((_, dt) => {
    const g = group.current; const b = body.current;
    if (!g || !b) return;
    const now = getNow ? getNow() : performance.now();

    g.position.set(actor.pos.x, actor.pos.y, actor.pos.z);
    g.rotation.y = actor.yaw;
    g.scale.setScalar(scale);

    const dead = !actor.alive;
    const speed = actor.anim.moveSpeed;
    phase.current += dt * (6 + speed * 8) * (speed > 0.05 ? 1 : 0.2);
    const sw = Math.sin(phase.current);

    if (dead) {
      const t = Math.min(1, (now - actor.anim.deathTime) / 600);
      b.rotation.x = (Math.PI / 2) * t;
      g.position.y = actor.pos.y - 0.1 * t;
      b.position.y = 0.5 - 0.4 * t;
      if (torsoMat.current) torsoMat.current.opacity = 1 - t * 0.35;
    } else {
      b.rotation.x = isZombie ? 0.22 : 0; // zombies hunch forward
      b.position.y = 0.5 + Math.abs(sw) * 0.04 * speed;
      if (torsoMat.current) torsoMat.current.opacity = 1;
    }

    const crouchY = actor.crouch ? 0.72 : 1;
    b.scale.y = THREE.MathUtils.lerp(b.scale.y || 1, crouchY, Math.min(1, dt * 12));

    if (legL.current && legR.current && !dead) {
      legL.current.rotation.x = sw * 0.7 * speed;
      legR.current.rotation.x = -sw * 0.7 * speed;
    }

    const firing = now - actor.anim.firing < 90;
    const casting = now - actor.anim.casting < 350;
    if (armR.current) {
      const base = isZombie ? -1.5 : -1.2;          // zombies reach forward
      const kick = firing ? 0.35 : 0;
      const cast = casting ? -0.9 : 0;
      armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, base + kick + cast - sw * 0.25 * speed, Math.min(1, dt * 18));
    }
    if (armL.current) {
      const cast = casting ? -0.6 : 0;
      const base = isZombie ? -1.5 : -1.0;
      armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, base + cast + sw * 0.25 * speed, Math.min(1, dt * 18));
    }
    if (head.current) head.current.rotation.x = THREE.MathUtils.clamp(-actor.pitch * 0.5, -0.5, 0.5);

    if (torsoMat.current) {
      const since = now - actor.anim.hitFlash;
      const flash = since < 140 ? 1 - since / 140 : 0;
      (torsoMat.current.emissive as THREE.Color).setRGB(flash, flash * 0.2, flash * 0.2);
    }
    g.visible = true;
  });

  return (
    <group ref={group}>
      <group ref={body} position={[0, 0.5, 0]}>
        {/* torso */}
        <mesh castShadow position={[0, 0.55, 0]}>
          <boxGeometry args={[0.55, 0.7, 0.34]} />
          <meshLambertMaterial ref={torsoMat} color={bodyColor} transparent />
        </mesh>
        {/* agent accent stripe (small) */}
        {!isZombie && (
          <mesh position={[0, 0.55, 0.18]}>
            <boxGeometry args={[0.12, 0.4, 0.04]} />
            <meshBasicMaterial color={accent} />
          </mesh>
        )}

        {/* head */}
        <mesh ref={head} castShadow position={[0, 1.12, 0]}>
          <boxGeometry args={[0.32, 0.32, 0.32]} />
          <meshLambertMaterial color={isZombie ? zType!.limb : '#e7c8a0'} />
        </mesh>
        {/* eyes / visor */}
        <mesh position={[0, 1.14, 0.17]}>
          <boxGeometry args={[0.26, 0.08, 0.02]} />
          <meshBasicMaterial color={isZombie ? '#ff3030' : bodyColor} />
        </mesh>

        {/* ── Team-distinct silhouette ── */}
        {!isZombie && isAtt && (
          <>
            {/* angular shoulder pads */}
            <mesh position={[0.34, 0.92, 0]} rotation={[0, 0, 0.5]}><boxGeometry args={[0.22, 0.16, 0.4]} /><meshLambertMaterial color={bodyColor} /></mesh>
            <mesh position={[-0.34, 0.92, 0]} rotation={[0, 0, -0.5]}><boxGeometry args={[0.22, 0.16, 0.4]} /><meshLambertMaterial color={bodyColor} /></mesh>
            {/* visor spike */}
            <mesh position={[0, 1.28, 0.12]} rotation={[0.5, 0, 0]}><boxGeometry args={[0.1, 0.22, 0.1]} /><meshLambertMaterial color={limbColor} /></mesh>
          </>
        )}
        {!isZombie && !isAtt && (
          <>
            {/* domed helmet */}
            <mesh position={[0, 1.3, 0]}><sphereGeometry args={[0.2, 8, 6]} /><meshLambertMaterial color={bodyColor} /></mesh>
            {/* backpack */}
            <mesh position={[0, 0.6, -0.24]}><boxGeometry args={[0.4, 0.5, 0.16]} /><meshLambertMaterial color={limbColor} /></mesh>
          </>
        )}

        {/* arms */}
        <group ref={armR} position={[0.34, 0.78, 0]}>
          <mesh castShadow position={[0, -0.22, 0.18]}><boxGeometry args={[0.16, 0.5, 0.16]} /><meshLambertMaterial color={limbColor} /></mesh>
          {!isZombie && actor.alive && (
            <mesh position={[0, -0.4, 0.42]}><boxGeometry args={[0.1, 0.12, 0.5]} /><meshLambertMaterial color="#222831" /></mesh>
          )}
        </group>
        <group ref={armL} position={[-0.34, 0.78, 0]}>
          <mesh castShadow position={[0, -0.22, 0.18]}><boxGeometry args={[0.16, 0.5, 0.16]} /><meshLambertMaterial color={limbColor} /></mesh>
        </group>

        {/* legs */}
        <mesh ref={legL} castShadow position={[0.15, 0.1, 0]}><boxGeometry args={[0.18, 0.5, 0.2]} /><meshLambertMaterial color={isZombie ? zType!.color : '#2c3038'} /></mesh>
        <mesh ref={legR} castShadow position={[-0.15, 0.1, 0]}><boxGeometry args={[0.18, 0.5, 0.2]} /><meshLambertMaterial color={isZombie ? zType!.color : '#2c3038'} /></mesh>
      </group>
    </group>
  );
}
