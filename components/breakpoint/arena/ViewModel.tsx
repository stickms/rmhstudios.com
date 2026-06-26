'use client';

import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { World } from '@/lib/breakpoint/engine/world';
import { getWeapon } from '@/lib/breakpoint/weapons';
import type { LocalInput } from '@/lib/breakpoint/engine/world';

/**
 * First-person weapon viewmodel pinned to the camera, with rich procedural
 * animation: idle sway, walk bob, fire recoil kick, reload dip/spin, ADS pull-in.
 */
export function ViewModel({ world, input }: { world: World; input: LocalInput }) {
  const { camera } = useThree();
  const root = useRef<THREE.Group>(null);
  const gun = useRef<THREE.Group>(null);
  const muzzle = useRef<THREE.Mesh>(null);
  const bob = useRef(0);
  const lastYaw = useRef(0);
  const lastPitch = useRef(0);
  const swayX = useRef(0);
  const swayY = useRef(0);
  const recoilOffset = useRef(0);

  useFrame((_, dt) => {
    const r = root.current; const g = gun.current;
    if (!r || !g) return;
    const local = world.local;
    if (!local) { r.visible = false; return; }
    r.visible = local.alive;

    // pin to camera
    r.position.copy(camera.position);
    r.quaternion.copy(camera.quaternion);

    const wpn = getWeapon(local.currentWeapon);
    const now = world.now;

    // ── look sway ──
    const dYaw = local.yaw - lastYaw.current;
    const dPitch = local.pitch - lastPitch.current;
    lastYaw.current = local.yaw; lastPitch.current = local.pitch;
    swayX.current = THREE.MathUtils.lerp(swayX.current, -dYaw * 2.2, Math.min(1, dt * 10));
    swayY.current = THREE.MathUtils.lerp(swayY.current, dPitch * 2.2, Math.min(1, dt * 10));

    // ── walk bob ──
    bob.current += dt * (8 + local.anim.moveSpeed * 6);
    const bobX = Math.cos(bob.current) * 0.012 * local.anim.moveSpeed;
    const bobY = Math.abs(Math.sin(bob.current)) * 0.018 * local.anim.moveSpeed;

    // ── ADS ──
    const wantAds = input.ads && wpn.class !== 'melee';
    const adsT = (g.userData.ads ?? 0);
    const ads = THREE.MathUtils.lerp(adsT, wantAds ? 1 : 0, Math.min(1, dt * 14));
    g.userData.ads = ads;

    // ── recoil ──
    const firedAgo = now - local.anim.firing;
    if (firedAgo < 30) recoilOffset.current = Math.min(0.12, recoilOffset.current + 0.05);
    recoilOffset.current = THREE.MathUtils.lerp(recoilOffset.current, 0, Math.min(1, dt * 12));

    // ── reload ──
    let reloadY = 0, reloadRot = 0;
    if (local.reloading) {
      const wpnDef = getWeapon(local.currentWeapon);
      const total = wpnDef.reloadTime * 1000;
      const t = 1 - (local.reloadEnd - now) / total; // 0..1
      const arc = Math.sin(Math.PI * THREE.MathUtils.clamp(t, 0, 1));
      reloadY = -arc * 0.22;
      reloadRot = arc * 0.9;
    }

    // base hip position (right, down, forward) → pulled toward centre when ADS
    const baseX = THREE.MathUtils.lerp(0.28, 0.0, ads) + swayX.current + bobX;
    const baseY = THREE.MathUtils.lerp(-0.26, -0.16, ads) + swayY.current + bobY + reloadY;
    const baseZ = THREE.MathUtils.lerp(-0.55, -0.42, ads) + recoilOffset.current;

    g.position.set(baseX, baseY, baseZ);
    g.rotation.set(
      swayY.current * 0.5 + recoilOffset.current * 3 + reloadRot,
      Math.PI + swayX.current * 0.5,
      reloadRot * 0.4,
    );

    // muzzle flash
    if (muzzle.current) {
      const flash = firedAgo < 50 ? 1 : 0;
      muzzle.current.visible = flash > 0 && !local.reloading;
      muzzle.current.scale.setScalar(0.5 + Math.random() * 0.6);
    }

    // recolor barrel by weapon
    const barrel = g.getObjectByName('barrel') as THREE.Mesh | undefined;
    if (barrel) (barrel.material as THREE.MeshLambertMaterial).color.set(wpn.color);
  });

  return (
    <group ref={root}>
      <group ref={gun}>
        {/* receiver */}
        <mesh position={[0, 0, 0.1]}>
          <boxGeometry args={[0.07, 0.1, 0.4]} />
          <meshLambertMaterial color="#23272f" />
        </mesh>
        {/* barrel (recolored per-weapon) */}
        <mesh name="barrel" position={[0, 0.02, -0.18]}>
          <boxGeometry args={[0.05, 0.05, 0.45]} />
          <meshLambertMaterial color="#9a9a9a" />
        </mesh>
        {/* magazine */}
        <mesh position={[0, -0.12, 0.12]}>
          <boxGeometry args={[0.05, 0.16, 0.1]} />
          <meshLambertMaterial color="#1a1d23" />
        </mesh>
        {/* grip */}
        <mesh position={[0, -0.13, 0.26]} rotation={[0.4, 0, 0]}>
          <boxGeometry args={[0.05, 0.16, 0.07]} />
          <meshLambertMaterial color="#15171c" />
        </mesh>
        {/* muzzle flash */}
        <mesh ref={muzzle} position={[0, 0.02, -0.42]} visible={false}>
          <boxGeometry args={[0.18, 0.18, 0.18]} />
          <meshBasicMaterial color="#ffd35a" transparent opacity={0.9} />
        </mesh>
      </group>
    </group>
  );
}
