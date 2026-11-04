'use client';

/**
 * The player's character: a small procedural figure built from the active skin's look (see
 * lib/hearthworks/skins/looks.ts). All motion is derived from the avatar's speed through
 * `locomotionBlend`, so idle → walk → run crossfades continuously instead of switching clips, and every
 * visible quantity (limb swing, bob, lean, breathing) is smooth in time.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE, type PaletteKey } from '@/lib/hearthworks/art';
import { locomotionBlend } from '@/lib/hearthworks/avatar';
import { runtime } from '@/lib/hearthworks/runtime-instance';
import { useHearthworks } from '@/lib/hearthworks/store';
import { SKIN_LOOKS, type SkinLook } from '@/lib/hearthworks/skins';
import { tileTop } from '@/lib/hearthworks/world';
import { hearthworksStore } from '@/lib/hearthworks/store';

const mat = (key: PaletteKey) => <meshStandardMaterial color={PALETTE[key]} roughness={0.85} />;

function Hat({ look }: { look: SkinLook }) {
  const hat = look.hat;
  if (!hat) return null;
  switch (hat.kind) {
    case 'cap':
      return (
        <group position={[0, 1.2, 0]}>
          <mesh position={[0, 0.02, 0]}>
            <sphereGeometry args={[0.2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            {mat(hat.color)}
          </mesh>
          <mesh position={[0, 0, 0.17]}>
            <boxGeometry args={[0.24, 0.025, 0.14]} />
            {mat(hat.color)}
          </mesh>
        </group>
      );
    case 'helmet':
      return (
        <mesh position={[0, 1.2, 0]}>
          <sphereGeometry args={[0.235, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
          {mat(hat.color)}
        </mesh>
      );
    case 'hardhat':
      return (
        <group position={[0, 1.2, 0]}>
          <mesh>
            <sphereGeometry args={[0.215, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            {mat(hat.color)}
          </mesh>
          <mesh position={[0, -0.005, 0]}>
            <cylinderGeometry args={[0.27, 0.27, 0.025, 16]} />
            {mat(hat.color)}
          </mesh>
        </group>
      );
    case 'wide':
      return (
        <group position={[0, 1.2, 0]}>
          <mesh position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.13, 0.17, 0.14, 14]} />
            {mat(hat.color)}
          </mesh>
          <mesh>
            <cylinderGeometry args={[0.3, 0.3, 0.02, 18]} />
            {mat(hat.color)}
          </mesh>
        </group>
      );
    case 'mask':
      return (
        <mesh position={[0, 1.1, 0.03]}>
          <sphereGeometry args={[0.215, 14, 10]} />
          {mat(hat.color)}
        </mesh>
      );
    case 'visor':
      return (
        <group position={[0, 1.1, 0]}>
          <mesh>
            <sphereGeometry args={[0.225, 14, 10]} />
            {mat('stone')}
          </mesh>
          <mesh position={[0, 0.0, 0.16]}>
            <boxGeometry args={[0.3, 0.07, 0.1]} />
            {mat(hat.color)}
          </mesh>
        </group>
      );
    case 'hair':
      return (
        <mesh position={[0, 1.15, -0.02]}>
          <sphereGeometry args={[0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          {mat(hat.color)}
        </mesh>
      );
  }
}

function Prop({ look }: { look: SkinLook }) {
  switch (look.prop) {
    case 'briefcase':
      return (
        <mesh position={[0, -0.22, 0.02]}>
          <boxGeometry args={[0.07, 0.2, 0.26]} />
          {mat('wood')}
        </mesh>
      );
    case 'crowbar':
      return (
        <mesh position={[0, -0.24, 0.1]} rotation={[0.5, 0, 0]}>
          <cylinderGeometry args={[0.018, 0.018, 0.5, 6]} />
          {mat('stone')}
        </mesh>
      );
    case 'wrench':
      return (
        <mesh position={[0, -0.24, 0.08]} rotation={[0.4, 0, 0]}>
          <boxGeometry args={[0.04, 0.04, 0.34]} />
          {mat('stone')}
        </mesh>
      );
    default:
      return null;
  }
}

export function Avatar() {
  const skin = useHearthworks((s) => s.world.players[s.playerId]?.skin ?? 'citizen');
  const look = SKIN_LOOKS[skin];
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const clock = useRef(0);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    clock.current += dt;
    const rt = runtime;
    const a = rt.avatar;
    const world = hearthworksStore.getState().world;
    // Ease height so stepping a block up or down glides.
    const targetY = tileTop(world, a.x, a.z);
    rt.avatarY += (targetY - rt.avatarY) * (1 - Math.exp(-16 * dt));
    const g = root.current;
    if (!g) return;
    g.position.set(a.x, rt.avatarY, a.z);
    g.rotation.y = a.yaw;

    const b = locomotionBlend(a.speed);
    // Gait advances with distance covered, so feet never skate.
    rt.gaitPhase += a.speed * dt * 4.2;
    const amp = b.walk * 0.62 + b.run * 1.0;
    const swing = Math.sin(rt.gaitPhase) * amp;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.9;
    if (armR.current) armR.current.rotation.x = swing * 0.9;
    if (body.current) {
      const bob = Math.abs(Math.sin(rt.gaitPhase)) * 0.05 * (b.walk + b.run * 1.4);
      const breathe = Math.sin(clock.current * 2.1) * 0.012 * b.idle;
      body.current.position.y = bob;
      body.current.scale.y = 1 + breathe;
      body.current.rotation.x = b.run * 0.2 + b.walk * 0.05;
    }
  });

  const w = look.build;
  return (
    <group ref={root} scale={look.height}>
      <group ref={body}>
        {/* torso */}
        <mesh position={[0, 0.7, 0]}>
          <boxGeometry args={[0.34 * w, 0.42, 0.2]} />
          {mat(look.suit)}
        </mesh>
        <mesh position={[0, 0.5, 0.0]}>
          <boxGeometry args={[0.35 * w, 0.06, 0.21]} />
          {mat(look.trim)}
        </mesh>
        {/* head */}
        <mesh position={[0, 1.08, 0]}>
          <sphereGeometry args={[0.18, 16, 12]} />
          {mat(look.skin)}
        </mesh>
        <Hat look={look} />
        {/* arms pivot at the shoulders */}
        <group ref={armL} position={[0.22 * w, 0.88, 0]}>
          <mesh position={[0, -0.18, 0]}>
            <boxGeometry args={[0.09, 0.36, 0.09]} />
            {mat(look.suit)}
          </mesh>
        </group>
        <group ref={armR} position={[-0.22 * w, 0.88, 0]}>
          <mesh position={[0, -0.18, 0]}>
            <boxGeometry args={[0.09, 0.36, 0.09]} />
            {mat(look.suit)}
          </mesh>
          <Prop look={look} />
        </group>
      </group>
      {/* legs pivot at the hips */}
      <group ref={legL} position={[0.09 * w, 0.5, 0]}>
        <mesh position={[0, -0.22, 0]}>
          <boxGeometry args={[0.13, 0.44, 0.13]} />
          {mat(look.trim)}
        </mesh>
      </group>
      <group ref={legR} position={[-0.09 * w, 0.5, 0]}>
        <mesh position={[0, -0.22, 0]}>
          <boxGeometry args={[0.13, 0.44, 0.13]} />
          {mat(look.trim)}
        </mesh>
      </group>
    </group>
  );
}
