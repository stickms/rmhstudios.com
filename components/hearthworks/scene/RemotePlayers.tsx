'use client';

/**
 * The other people in a shared world. Their position, heading and speed come from the pose buffer the session keeps
 * (lib/hearthworks/net/poses.ts): they are drawn a hundred milliseconds in the past, interpolated between the two
 * snapshots around that moment (extrapolated for at most 250 ms when one is late), so they move smoothly whatever
 * the update rate, and the same sample says how fast and which way, so they walk, run and turn with the right clip.
 * Jumps and falls are read off the drawn height. Without a pose buffer (no driver yet) a `MotionEstimator` eases the
 * figure toward where the host last saw them instead. Their own skin shows (model or stand-in).
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { PALETTE } from '@/lib/hearthworks/art';
import { newDrive, type AirState } from '@/lib/hearthworks/skins/animator';
import { MotionEstimator, airFromVelocity } from '@/lib/hearthworks/skins/motion-estimator';
import { hearthworksStore, useHearthworks } from '@/lib/hearthworks/store';
import { tileTop } from '@/lib/hearthworks/world';
import { driveFromEvents } from './figure-events';
import { GunProp } from './GunProp';
import { SkinFigure } from './SkinFigure';

function RemotePlayer({ id }: { id: string }) {
  const root = useRef<THREE.Group>(null);
  const skin = useHearthworks((s) => s.world.players[id]?.skin ?? 'citizen');
  const armed = useHearthworks((s) => (s.world.players[id]?.arms.equipped ?? null) !== null);
  const poses = useHearthworks((s) => s.driver?.poses);
  const drive = useMemo(() => newDrive(), []);
  const motion = useMemo(() => new MotionEstimator(), []);
  const lastY = useRef<number | null>(null);
  const air = useRef<AirState>('ground');

  useEffect(() => driveFromEvents(hearthworksStore, { kind: 'player', id }, drive), [drive, id]);

  useFrame((_, delta) => {
    const g = root.current;
    const w = hearthworksStore.getState().world;
    const p = w.players[id];
    if (!g || !p) return;
    const pose = poses?.sample(id, performance.now());
    if (pose) {
      const y = tileTop(w, Math.round(pose.x), Math.round(pose.z));
      const vy = lastY.current === null || delta <= 0 ? 0 : (y - lastY.current) / delta;
      lastY.current = y;
      air.current = airFromVelocity(air.current, vy);
      g.visible = true;
      g.position.set(pose.x, y, pose.z);
      // Face the way they are heading; stand as they were last facing when they stop.
      g.rotation.y = pose.yaw;
      drive.speed = pose.speed;
      drive.air = air.current;
    } else {
      motion.observe(p.x, tileTop(w, Math.round(p.x), Math.round(p.z)), p.z);
      const m = motion.step(delta);
      g.visible = true;
      g.position.set(m.x, m.y, m.z);
      g.rotation.y = m.yaw;
      drive.speed = m.speed;
      drive.air = m.air;
    }
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
