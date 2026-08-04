/**
 * Massive March — everything inside the Canvas.
 *
 * Composition only; each part explains itself. Two small systems live here
 * because they are about the relationship between the player and the world
 * rather than about drawing any one thing: the proximity watcher (which site am
 * I standing in, which tower am I at) and the laser dots.
 */

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group, Mesh, PerspectiveCamera } from 'three';
import type { QualityFlags, RenderTier } from '@/lib/render/tier';
import { TOY } from '@/lib/massive-march/palette';
import { live } from '@/lib/massive-march/live';
import { BIT } from '@/lib/massive-march/net/events';
import { useMmSettings } from '@/lib/massive-march/settings';
import { useMmStore } from '@/lib/massive-march/store';
import { siteHere, towerHere } from '@/lib/massive-march/interaction';
import { raycastGround } from '@/lib/massive-march/world/terrain';
import { Avatars, SelfHands } from './Avatars';
import { Items3D } from './Items3D';
import { PlayerController } from './PlayerController';
import { PuzzleProps } from './PuzzleProps';
import { Scatter } from './Scatter';
import { Sky } from './Sky';
import { Cart, Structures } from './Structures';
import { Ocean, Terrain } from './Terrain';

/**
 * Tells the HUD where the player is standing.
 *
 * Sampled at 5Hz rather than per frame: the answer changes when you walk into a
 * site, which is a thing that happens seconds apart, and pushing it into the
 * store sixty times a second would re-render the whole HUD for no reason.
 */
function ProximityWatcher() {
  const setNear = useMmStore((s) => s.setNear);
  const last = useRef(0);

  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 200) return;
    last.current = now;
    setNear(siteHere()?.id ?? null, towerHere());
  });

  return null;
}

/**
 * Laser dots.
 *
 * A pointer is the shortest unambiguous way to say "that one" (§8.3), so the
 * dot has to land where the person holding it means, in everybody's view. It is
 * traced against the height *function* rather than the drawn mesh, so two
 * players on different render tiers see the dot on the same rock.
 */
function LaserDots() {
  const dots = useRef<Group>(null);
  const members = useMmStore((s) => s.session?.members ?? []);
  const slots = useMemo(() => members.map((m) => m.slot), [members]);

  return (
    <group ref={dots}>
      {slots.map((slot) => (
        <LaserDot key={slot} slot={slot} />
      ))}
    </group>
  );
}

function LaserDot({ slot }: { slot: number }) {
  const dot = useRef<Mesh>(null);
  const beam = useRef<Mesh>(null);

  useFrame(() => {
    if (!dot.current || !beam.current) return;
    const self = slot === live.selfSlot;
    const source = self
      ? { x: live.self.x, y: live.self.y, z: live.self.z, yaw: live.self.yaw, pitch: live.self.pitch, bits: live.self.bits }
      : live.players.get(slot);
    if (!source || (source.bits & BIT.LASER) === 0) {
      dot.current.visible = false;
      beam.current.visible = false;
      return;
    }

    const origin = { x: source.x, y: source.y + 1.4, z: source.z };
    const direction = {
      x: Math.sin(source.yaw) * Math.cos(source.pitch),
      y: Math.sin(source.pitch),
      z: Math.cos(source.yaw) * Math.cos(source.pitch),
    };
    const hit = raycastGround(origin, direction, 320);
    if (!hit) {
      dot.current.visible = false;
      beam.current.visible = false;
      return;
    }

    dot.current.visible = true;
    dot.current.position.set(hit.x, hit.y + 0.06, hit.z);
    // Scaled with distance so a dot two hundred metres away is still a dot you
    // can see, which is the only reason to carry one.
    dot.current.scale.setScalar(0.12 + hit.distance * 0.004);

    beam.current.visible = hit.distance > 3;
    beam.current.position.set(
      (origin.x + hit.x) / 2,
      (origin.y + hit.y) / 2,
      (origin.z + hit.z) / 2,
    );
    beam.current.scale.set(1, hit.distance, 1);
    beam.current.lookAt(hit.x, hit.y, hit.z);
    beam.current.rotateX(Math.PI / 2);
  });

  return (
    <group>
      <mesh ref={dot} visible={false}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshBasicMaterial color={TOY.green} toneMapped={false} />
      </mesh>
      <mesh ref={beam} visible={false}>
        <cylinderGeometry args={[0.012, 0.012, 1, 5]} />
        <meshBasicMaterial color={TOY.green} transparent opacity={0.35} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** Keep the camera's field of view honest to the setting (§17). */
function FieldOfView() {
  const { camera } = useThree();
  const fov = useMmSettings((s) => s.fov);
  useEffect(() => {
    const perspective = camera as PerspectiveCamera;
    if (perspective.isPerspectiveCamera) {
      perspective.fov = fov;
      perspective.updateProjectionMatrix();
    }
  }, [camera, fov]);
  return null;
}

export function Scene({
  quality,
  tier,
  onInteract,
}: {
  quality: QualityFlags;
  tier: RenderTier;
  onInteract: () => void;
}) {
  const towers = useMmStore((s) => s.world?.towers);
  const satisfied = useMemo(
    () => new Set((towers ?? []).filter((t) => t.satisfied).map((t) => t.id)),
    [towers],
  );
  const highlight = useMmSettings((s) => s.highlightInteractive);

  return (
    <>
      <FieldOfView />
      <Sky quality={quality} />
      <Terrain tier={tier} />
      <Ocean />
      <Scatter quality={quality} />
      <Structures quality={quality} satisfied={satisfied} />
      <Cart shadows={quality.shadows} />
      <PuzzleProps />
      <Avatars />
      <Items3D />
      <LaserDots />
      {highlight ? <InteractHalo /> : null}
      <ProximityWatcher />
      <PlayerController onInteract={onInteract} />
      <SelfHandsRig />
    </>
  );
}

/** Your own arms, parented to the camera so they come along. */
function SelfHandsRig() {
  const { camera } = useThree();
  const group = useRef<Group>(null);

  useEffect(() => {
    const node = group.current;
    if (!node) return;
    camera.add(node);
    return () => {
      camera.remove(node);
    };
  }, [camera]);

  return (
    <group ref={group}>
      <SelfHands />
    </group>
  );
}

/**
 * A soft ring under whatever the interact key would act on.
 *
 * This is `highlightInteractive` from §17 — the in-world equivalent of the
 * item that highlights interactive objects. On by default, because a first
 * person view of a scrubby hillside genuinely does hide a dropped radio.
 */
function InteractHalo() {
  const ring = useRef<Mesh>(null);

  useFrame(() => {
    if (!ring.current) return;
    let nearest: { x: number; y: number; z: number; d: number } | null = null;
    for (const item of live.items.values()) {
      if (item.holder >= 0) continue;
      const d = Math.hypot(item.x - live.self.x, item.z - live.self.z);
      if (d > 3.4) continue;
      if (!nearest || d < nearest.d) nearest = { x: item.x, y: item.y, z: item.z, d };
    }
    if (!nearest) {
      ring.current.visible = false;
      return;
    }
    ring.current.visible = true;
    ring.current.position.set(nearest.x, live.self.ground + 0.06, nearest.z);
  });

  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
      <ringGeometry args={[0.5, 0.68, 20]} />
      <meshBasicMaterial color={TOY.white} transparent opacity={0.55} toneMapped={false} side={2} />
    </mesh>
  );
}
