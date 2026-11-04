'use client';

/**
 * The player's character. All motion is derived from the avatar's speed through `locomotionBlend`, so idle → walk
 * → run crossfades continuously instead of switching clips, and every visible quantity (limb swing, bob, lean,
 * breathing) is smooth in time.
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { locomotionBlend } from '@/lib/hearthworks/avatar';
import { runtime } from '@/lib/hearthworks/runtime-instance';
import { SKIN_LOOKS } from '@/lib/hearthworks/skins';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';
import { tileTop } from '@/lib/hearthworks/world';
import { Figure } from './Figure';

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

  return (
    <group ref={root}>
      <Figure look={look} refs={{ body, legL, legR, armL, armR }} />
    </group>
  );
}
