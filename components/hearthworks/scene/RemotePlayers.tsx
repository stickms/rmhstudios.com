'use client';

/**
 * The other people in a shared world. The host tells us where each last stood, in jumps; a `MotionEstimator` eases the
 * drawn figure toward that and reads speed, heading and vertical motion off the drawn movement, so they walk, run, hop
 * and fall with the right clip whatever the update rate. Their own skin shows (model or stand-in).
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { PALETTE } from '@/lib/hearthworks/art';
import { newDrive } from '@/lib/hearthworks/skins/animator';
import { MotionEstimator } from '@/lib/hearthworks/skins/motion-estimator';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';
import { tileTop } from '@/lib/hearthworks/world';
import { driveFromEvents } from './figure-events';
import { GunProp } from './GunProp';
import { SkinFigure } from './SkinFigure';

function RemotePlayer({ id }: { id: string }) {
  const root = useRef<THREE.Group>(null);
  const skin = useHearthworks((s) => s.world.players[id]?.skin ?? 'citizen');
  const armed = useHearthworks((s) => (s.world.players[id]?.arms.equipped ?? null) !== null);
  const drive = useMemo(() => newDrive(), []);
  const motion = useMemo(() => new MotionEstimator(), []);

  useEffect(() => driveFromEvents(hearthworksStore, { kind: 'player', id }, drive), [drive, id]);

  useFrame((_, delta) => {
    const g = root.current;
    const w = hearthworksStore.getState().world;
    const p = w.players[id];
    if (!g || !p) return;
    motion.observe(p.x, tileTop(w, Math.round(p.x), Math.round(p.z)), p.z);
    const m = motion.step(delta);
    g.visible = true;
    g.position.set(m.x, m.y, m.z);
    // Face the way they are heading; stand as they were last facing when they stop.
    g.rotation.y = m.yaw;
    drive.speed = m.speed;
    drive.air = m.air;
    drive.dead = p.arms.downedUntil > w.tick;
  });

  return (
    <group ref={root} visible={false}>
      <SkinFigure skin={skin} drive={drive} held={armed ? <GunProp color={PALETTE.ink} /> : null} />
    </group>
  );
}

export function RemotePlayers() {
  const world = useHearthworks((s) => s.world);
  const me = useHearthworks((s) => s.playerId);
  const shared = useHearthworks((s) => s.driver !== null);
  useHearthworks((s) => s.rev);
  if (!shared) return null;
  return (
    <>
      {Object.values(world.players)
        .filter((p) => p.id !== me)
        .map((p) => (
          <RemotePlayer key={p.id} id={p.id} />
        ))}
    </>
  );
}
