/**
 * The player's character. All motion is derived from the avatar's speed through `locomotionBlend`, so idle → walk
 * → run crossfades continuously instead of switching clips, and every visible quantity (limb swing, bob, lean,
 * breathing) is smooth in time.
 *
 * Drawn by `SkinFigure`: the skin's skinned model with real skeletal animation when one is available, the procedural
 * figure (whose limbs this component swings) otherwise. Both read the same state: speed, whether the avatar is rising
 * or dropping (a ledge hop, a fall), whether it is downed, and one-shots from the world's events (shoot, reload, hurt,
 * interact).
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { PALETTE } from '@features/hearthworks/engine/art';
import { locomotionBlend } from '@features/hearthworks/engine/avatar';
import { runtime } from '@features/hearthworks/engine/runtime-instance';
import { newDrive } from '@features/hearthworks/engine/skins/animator';
import { airFromVelocity } from '@features/hearthworks/engine/skins/motion-estimator';
import { preloadSkinModel } from '@features/hearthworks/engine/skins/model-loader';
import { getManifest, loadManifest } from '@features/hearthworks/engine/skins/model-manifest';
import { hearthworksStore, useHearthworks } from '@features/hearthworks/engine/store';
import { tileTop } from '@features/hearthworks/engine/world';
import { driveFromEvents } from './figure-events';
import { GunProp } from './GunProp';
import { SkinFigure } from './SkinFigure';

export function Avatar() {
  const skin = useHearthworks((s) => s.world.players[s.playerId]?.skin ?? 'citizen');
  const playerId = useHearthworks((s) => s.playerId);
  const armed = useHearthworks((s) => (s.world.players[s.playerId]?.arms.equipped ?? null) !== null);
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const clock = useRef(0);
  const drive = useMemo(() => newDrive(), []);
  const vy = useRef(0);

  // Start fetching the worn skin's model as early as the skin is known, ahead of the first frame that needs it.
  useEffect(() => {
    let live = true;
    void loadManifest().then(() => {
      if (live) preloadSkinModel(skin, getManifest().models[skin], true);
    });
    return () => {
      live = false;
    };
  }, [skin]);

  // Shots, reloads, wounds and chores the world reports become one-shot clips.
  useEffect(() => driveFromEvents(hearthworksStore, { kind: 'player', id: playerId }, drive), [drive, playerId]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);
    clock.current += dt;
    const rt = runtime;
    const a = rt.avatar;
    const state = hearthworksStore.getState();
    const world = state.world;
    // Ease height so stepping a block up or down glides.
    const targetY = tileTop(world, a.x, a.z);
    const prevY = rt.avatarY;
    rt.avatarY += (targetY - rt.avatarY) * (1 - Math.exp(-16 * dt));
    const g = root.current;
    if (!g) return;
    g.position.set(a.x, rt.avatarY, a.z);
    g.rotation.y = a.yaw;

    // What the skinned model needs to know (the procedural limbs below read the same numbers).
    if (dt > 0) vy.current += ((rt.avatarY - prevY) / dt - vy.current) * (1 - Math.exp(-14 * dt));
    drive.speed = a.speed;
    drive.air = airFromVelocity(drive.air, vy.current);
    drive.dead = (world.players[state.playerId]?.arms.downedUntil ?? 0) > world.tick;

    const b = locomotionBlend(a.speed);
    // Gait advances with distance covered, so feet never skate.
    rt.gaitPhase += a.speed * dt * 6.2;
    const amp = b.walk * 0.62 + b.run * 1.0;
    const swing = Math.sin(rt.gaitPhase) * amp;
    if (legL.current) legL.current.rotation.x = swing;
    if (legR.current) legR.current.rotation.x = -swing;
    if (armL.current) armL.current.rotation.x = -swing * 0.9;
    if (armR.current) armR.current.rotation.x = swing * 0.9;
    if (body.current) {
      const bob = Math.abs(Math.sin(rt.gaitPhase)) * 0.016 * (b.walk + b.run * 1.4);
      const breathe = Math.sin(clock.current * 2.1) * 0.012 * b.idle;
      body.current.position.y = bob;
      body.current.scale.y = 1 + breathe;
      body.current.rotation.x = b.run * 0.2 + b.walk * 0.05;
    }
  });

  return (
    <group ref={root}>
      <SkinFigure
        skin={skin}
        drive={drive}
        refs={{ body, legL, legR, armL, armR }}
        held={armed ? <GunProp color={PALETTE.ink} /> : null}
        pinned
      />
    </group>
  );
}
