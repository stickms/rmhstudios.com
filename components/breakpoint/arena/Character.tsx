'use client';

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { Actor } from '@/lib/breakpoint/types';
import { getAgent } from '@/lib/breakpoint/agents';
import { PALETTE } from '@/lib/breakpoint/constants';

/**
 * Low-poly, flat-shaded humanoid with fully procedural animation:
 *  - locomotion: legs + arms swing, torso bob, scaled by move speed
 *  - firing: arm punch-out + recoil kick
 *  - casting: arm raise
 *  - hit: brief flash tint
 *  - death: topple + sink
 * Reads the (mutable) actor each frame — no React churn.
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
  const teamColor = actor.team === 'attackers' ? PALETTE.attacker : PALETTE.defender;

  useFrame((_, dt) => {
    const g = group.current; const b = body.current;
    if (!g || !b) return;
    const now = getNow ? getNow() : performance.now();

    g.position.set(actor.pos.x, actor.pos.y, actor.pos.z);
    g.rotation.y = actor.yaw;

    const dead = !actor.alive;
    const speed = actor.anim.moveSpeed;
    phase.current += dt * (6 + speed * 8) * (speed > 0.05 ? 1 : 0.2);
    const sw = Math.sin(phase.current);

    if (dead) {
      // topple over and sink
      const t = Math.min(1, (now - actor.anim.deathTime) / 600);
      b.rotation.x = (Math.PI / 2) * t;
      g.position.y = actor.pos.y - 0.1 * t;
      b.position.y = 0.5 - 0.4 * t;
      if (torsoMat.current) torsoMat.current.opacity = 1 - t * 0.35;
    } else {
      b.rotation.x = 0;
      b.position.y = 0.5 + Math.abs(sw) * 0.04 * speed; // bob
      if (torsoMat.current) { torsoMat.current.opacity = 1; }
    }

    // crouch squash
    const crouchY = actor.crouch ? 0.72 : 1;
    b.scale.y = THREE.MathUtils.lerp(b.scale.y || 1, crouchY, Math.min(1, dt * 12));

    // legs
    if (legL.current && legR.current && !dead) {
      legL.current.rotation.x = sw * 0.7 * speed;
      legR.current.rotation.x = -sw * 0.7 * speed;
    }

    // arms — hold weapon forward; opposite swing while walking
    const firing = now - actor.anim.firing < 90;
    const casting = now - actor.anim.casting < 350;
    if (armR.current) {
      const base = -1.2; // raised forward
      const kick = firing ? 0.35 : 0;
      const cast = casting ? -0.9 : 0;
      armR.current.rotation.x = THREE.MathUtils.lerp(armR.current.rotation.x, base + kick + cast - sw * 0.25 * speed, Math.min(1, dt * 18));
    }
    if (armL.current) {
      const cast = casting ? -0.6 : 0;
      armL.current.rotation.x = THREE.MathUtils.lerp(armL.current.rotation.x, -1.0 + cast + sw * 0.25 * speed, Math.min(1, dt * 18));
    }
    if (head.current) head.current.rotation.x = THREE.MathUtils.clamp(-actor.pitch * 0.5, -0.5, 0.5);

    // hit flash
    if (torsoMat.current) {
      const since = now - actor.anim.hitFlash;
      const flash = since < 140 ? 1 - since / 140 : 0;
      (torsoMat.current.emissive as THREE.Color).setRGB(flash, flash * 0.2, flash * 0.2);
    }

    // revealed pulse (enemy recon) — emissive glow on head handled via scale tag below
    g.visible = true;
  });

  return (
    <group ref={group}>
      <group ref={body} position={[0, 0.5, 0]}>
        {/* torso */}
        <mesh castShadow position={[0, 0.55, 0]}>
          <boxGeometry args={[0.55, 0.7, 0.34]} />
          <meshLambertMaterial ref={torsoMat} color={agent.color} transparent />
        </mesh>
        {/* team chest stripe */}
        <mesh position={[0, 0.55, 0.18]}>
          <boxGeometry args={[0.5, 0.18, 0.04]} />
          <meshBasicMaterial color={teamColor} />
        </mesh>
        {/* head */}
        <mesh ref={head} castShadow position={[0, 1.12, 0]}>
          <boxGeometry args={[0.32, 0.32, 0.32]} />
          <meshLambertMaterial color="#e7c8a0" />
        </mesh>
        {/* visor */}
        <mesh position={[0, 1.14, 0.17]}>
          <boxGeometry args={[0.26, 0.1, 0.02]} />
          <meshBasicMaterial color={teamColor} />
        </mesh>
        {/* arms */}
        <group ref={armR} position={[0.34, 0.78, 0]}>
          <mesh castShadow position={[0, -0.22, 0.18]}>
            <boxGeometry args={[0.16, 0.5, 0.16]} />
            <meshLambertMaterial color={agent.color} />
          </mesh>
          {/* gun stub in right hand */}
          {actor.alive && (
            <mesh position={[0, -0.4, 0.42]}>
              <boxGeometry args={[0.1, 0.12, 0.5]} />
              <meshLambertMaterial color="#222831" />
            </mesh>
          )}
        </group>
        <group ref={armL} position={[-0.34, 0.78, 0]}>
          <mesh castShadow position={[0, -0.22, 0.18]}>
            <boxGeometry args={[0.16, 0.5, 0.16]} />
            <meshLambertMaterial color={agent.color} />
          </mesh>
        </group>
        {/* legs */}
        <mesh ref={legL} castShadow position={[0.15, 0.1, 0]}>
          <boxGeometry args={[0.18, 0.5, 0.2]} />
          <meshLambertMaterial color="#2c3038" />
        </mesh>
        <mesh ref={legR} castShadow position={[-0.15, 0.1, 0]}>
          <boxGeometry args={[0.18, 0.5, 0.2]} />
          <meshLambertMaterial color="#2c3038" />
        </mesh>
      </group>
    </group>
  );
}
