"use client";

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getCharacterLook, matteMaterialProps } from './palette';

/** Shortest-path angle damp — borrowed from StickFighter. */
function dampAngle(current: number, target: number, t: number): number {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return current + d * t;
}

interface CharacterProps {
  lookId: string;
  moving?: boolean;
  /** Yaw (radians) the body turns toward; consumer passes movement heading. Default 0. */
  facing?: number;
}

/**
 * Reusable articulated humanoid for player and buyers.
 *
 * Rig adapted from StickFighter (kowloon-knockout):
 *   root → body group [torso/head/arms] + lLeg/rLeg groups + blob shadow.
 *
 * Feet sit at local y=0; total standing height ≈ 1.7 units.
 * All animation is imperative (refs + useFrame) — no React state.
 */
export default function Character({ lookId, moving = false, facing = 0 }: CharacterProps) {
  const look = useMemo(() => getCharacterLook(lookId), [lookId]);

  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const lArm = useRef<THREE.Group>(null);
  const rArm = useRef<THREE.Group>(null);
  const lLeg = useRef<THREE.Group>(null);
  const rLeg = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (
      !root.current || !body.current ||
      !lArm.current || !rArm.current ||
      !lLeg.current || !rLeg.current
    ) return;

    const t = state.clock.elapsedTime;
    const r = root.current;
    const b = body.current;
    const la = lArm.current;
    const ra = rArm.current;
    const ll = lLeg.current;
    const rl = rLeg.current;

    // Smoothly yaw toward the current heading.
    r.rotation.y = dampAngle(r.rotation.y, facing, 0.15);

    let bodyY = 0;
    let llX = 0, rlX = 0;
    let laX = 0, raX = 0;

    if (moving) {
      // Walking: swing legs, counter-swing arms, subtle body bob.
      const ph = t * 9;
      llX =  Math.sin(ph) * 0.5;
      rlX = -Math.sin(ph) * 0.5;
      // Arms swing opposite to legs for natural gait.
      laX = -Math.sin(ph) * 0.28;
      raX =  Math.sin(ph) * 0.28;
      bodyY = Math.abs(Math.sin(ph)) * 0.04;
    } else {
      // Idle: gentle float bob + soft arm drift.
      bodyY = Math.sin(t * 2) * 0.02;
      laX = Math.sin(t * 2)       * 0.04;
      raX = Math.sin(t * 2 + 1.0) * 0.04;
    }

    b.position.y = 0.82 + bodyY;
    ll.rotation.x += (llX - ll.rotation.x) * 0.4;
    rl.rotation.x += (rlX - rl.rotation.x) * 0.4;
    la.rotation.x += (laX - la.rotation.x) * 0.45;
    ra.rotation.x += (raX - ra.rotation.x) * 0.45;
  });

  return (
    <group ref={root}>
      {/* ─── Soft blob shadow at feet ─── */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
        <circleGeometry args={[0.4, 16]} />
        <meshBasicMaterial color="#000" transparent opacity={0.3} />
      </mesh>

      {/* ─── Left leg (pivot at hip) ─── */}
      <group ref={lLeg} position={[-0.16, 0.75, 0]}>
        {/* Pants cylinder — bottom edge at y≈0.13 */}
        <mesh position={[0, -0.31, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.055, 0.62, 6]} />
          <meshStandardMaterial {...matteMaterialProps(look.bottom)} />
        </mesh>
        {/* Shoe box — bottom edge at y=0 */}
        <mesh position={[0, -0.68, 0.02]} castShadow>
          <boxGeometry args={[0.14, 0.14, 0.22]} />
          <meshStandardMaterial {...matteMaterialProps(look.shoes)} />
        </mesh>
      </group>

      {/* ─── Right leg (pivot at hip) ─── */}
      <group ref={rLeg} position={[0.16, 0.75, 0]}>
        {/* Pants cylinder */}
        <mesh position={[0, -0.31, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.055, 0.62, 6]} />
          <meshStandardMaterial {...matteMaterialProps(look.bottom)} />
        </mesh>
        {/* Shoe box */}
        <mesh position={[0, -0.68, 0.02]} castShadow>
          <boxGeometry args={[0.14, 0.14, 0.22]} />
          <meshStandardMaterial {...matteMaterialProps(look.shoes)} />
        </mesh>
      </group>

      {/* ─── Body group: torso + head + arms (bobs with animation) ─── */}
      <group ref={body} position={[0, 0.82, 0]}>
        {/* Hoodie/jacket torso — slightly flared at waist */}
        <mesh position={[0, 0.24, 0]} castShadow>
          <cylinderGeometry args={[0.135, 0.19, 0.58, 7]} />
          <meshStandardMaterial {...matteMaterialProps(look.top)} />
        </mesh>

        {/* Accent collar / zip strip */}
        <mesh position={[0, 0.54, 0.07]}>
          <boxGeometry args={[0.13, 0.09, 0.05]} />
          <meshStandardMaterial {...matteMaterialProps(look.accent)} />
        </mesh>

        {/* Head sphere — center at world y≈1.54; top at ≈1.725 */}
        <mesh position={[0, 0.72, 0]} castShadow>
          <sphereGeometry args={[0.185, 10, 8]} />
          <meshStandardMaterial {...matteMaterialProps(look.skin)} />
        </mesh>

        {/* Hair cap — tapered cylinder sitting on top of head */}
        <mesh position={[0, 0.845, 0]}>
          <cylinderGeometry args={[0.165, 0.18, 0.1, 8]} />
          <meshStandardMaterial {...matteMaterialProps(look.hair)} />
        </mesh>

        {/* Optional snapback/cap */}
        {look.cap && (
          <>
            {/* Brim */}
            <mesh position={[0, 0.92, 0.04]}>
              <boxGeometry args={[0.34, 0.03, 0.28]} />
              <meshStandardMaterial {...matteMaterialProps(look.accent)} />
            </mesh>
            {/* Dome */}
            <mesh position={[0, 0.955, 0]}>
              <sphereGeometry args={[0.155, 8, 6]} />
              <meshStandardMaterial {...matteMaterialProps(look.top)} />
            </mesh>
          </>
        )}

        {/* ─── Left arm (pivot at shoulder) ─── */}
        <group ref={lArm} position={[-0.27, 0.44, 0]}>
          {/* Sleeve cylinder */}
          <mesh position={[0, -0.24, 0]} castShadow>
            <cylinderGeometry args={[0.058, 0.046, 0.48, 6]} />
            <meshStandardMaterial {...matteMaterialProps(look.top)} />
          </mesh>
          {/* Hand sphere */}
          <mesh position={[0, -0.51, 0]}>
            <sphereGeometry args={[0.082, 8, 6]} />
            <meshStandardMaterial {...matteMaterialProps(look.skin)} />
          </mesh>
        </group>

        {/* ─── Right arm (pivot at shoulder) ─── */}
        <group ref={rArm} position={[0.27, 0.44, 0]}>
          {/* Sleeve cylinder */}
          <mesh position={[0, -0.24, 0]} castShadow>
            <cylinderGeometry args={[0.058, 0.046, 0.48, 6]} />
            <meshStandardMaterial {...matteMaterialProps(look.top)} />
          </mesh>
          {/* Hand sphere */}
          <mesh position={[0, -0.51, 0]}>
            <sphereGeometry args={[0.082, 8, 6]} />
            <meshStandardMaterial {...matteMaterialProps(look.skin)} />
          </mesh>
        </group>
      </group>
    </group>
  );
}
