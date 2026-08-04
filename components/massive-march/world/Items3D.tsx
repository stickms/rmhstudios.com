/**
 * Massive March — the loose objects.
 *
 * Every tool in the game is a thing lying somewhere until somebody picks it up,
 * and stays a thing while they carry it: in their hand, visible to everyone,
 * droppable, throwable and kickable (§10). There is no inventory icon that is
 * not also an object in the world, which is what makes "who has the radio" a
 * question with a physical answer.
 *
 * Positions come from the hub — including while an object is in flight, because
 * the hub simulates the throw. Two clients watching the same binoculars sail
 * into a gully see them land in the same gully.
 */

'use client';

import { useMemo, useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, LinearFilter, type Group, type PointLight } from 'three';
import type { ItemKind } from '@/lib/massive-march/items';
import { LAND, ORB_COLOR, TOY } from '@/lib/massive-march/palette';
import { live } from '@/lib/massive-march/live';
import { useMmStore } from '@/lib/massive-march/store';

const boardTextures = new Map<string, CanvasTexture>();

/** A whiteboard's message, drawn once per distinct text. */
function boardTexture(text: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const cached = boardTextures.get(text);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#fffdf6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#1c3fa8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 30px ui-sans-serif, system-ui, sans-serif';
  // Wrap by words: a whiteboard holds a short sentence and it should look
  // handwritten-ish rather than clipped.
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > canvas.width - 32 && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  lines.slice(0, 4).forEach((row, index) => {
    ctx.fillText(row, canvas.width / 2, 48 + index * 38);
  });
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  boardTextures.set(text, texture);
  return texture;
}

function ItemMesh({ kind, label }: { kind: ItemKind; label: string }) {
  const texture = useMemo(() => (kind === 'board' && label ? boardTexture(label) : null), [kind, label]);

  switch (kind) {
    case 'radio':
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.16, 0.34, 0.09]} />
            <meshLambertMaterial color={TOY.black} />
          </mesh>
          <mesh position={[0.05, 0.28, 0]} castShadow>
            <cylinderGeometry args={[0.014, 0.014, 0.26, 5]} />
            <meshLambertMaterial color={LAND.granite} />
          </mesh>
        </group>
      );
    case 'megaphone':
      return (
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <coneGeometry args={[0.22, 0.5, 10, 1, true]} />
          <meshLambertMaterial color={TOY.red} side={2} />
        </mesh>
      );
    case 'laser':
      return (
        <mesh castShadow>
          <boxGeometry args={[0.06, 0.06, 0.24]} />
          <meshLambertMaterial color={TOY.green} />
        </mesh>
      );
    case 'binoculars':
      return (
        <group>
          <mesh position={[-0.07, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.24, 8]} />
            <meshLambertMaterial color={TOY.blue} />
          </mesh>
          <mesh position={[0.07, 0, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
            <cylinderGeometry args={[0.07, 0.07, 0.24, 8]} />
            <meshLambertMaterial color={TOY.blue} />
          </mesh>
        </group>
      );
    case 'board':
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.74, 0.56, 0.04]} />
            <meshLambertMaterial color={TOY.white} />
          </mesh>
          {texture ? (
            <mesh position={[0, 0, 0.025]}>
              <planeGeometry args={[0.68, 0.5]} />
              <meshBasicMaterial map={texture} toneMapped={false} />
            </mesh>
          ) : null}
        </group>
      );
    case 'torch':
      return (
        <group>
          <mesh castShadow>
            <cylinderGeometry args={[0.055, 0.06, 0.3, 8]} />
            <meshLambertMaterial color={TOY.yellow} />
          </mesh>
          <mesh position={[0, 0.18, 0]}>
            <cylinderGeometry args={[0.07, 0.055, 0.08, 8]} />
            <meshLambertMaterial color={TOY.white} />
          </mesh>
        </group>
      );
    case 'flare':
      return (
        <mesh castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 8]} />
          <meshLambertMaterial color={TOY.pink} />
        </mesh>
      );
    case 'bell':
      return (
        <mesh castShadow>
          <coneGeometry args={[0.15, 0.24, 8]} />
          <meshLambertMaterial color={TOY.yellowDeep} />
        </mesh>
      );
    case 'detector':
      return (
        <group>
          <mesh castShadow>
            <boxGeometry args={[0.2, 0.14, 0.3]} />
            <meshLambertMaterial color={TOY.green} />
          </mesh>
          <mesh position={[0, -0.3, 0.1]} castShadow>
            <cylinderGeometry args={[0.03, 0.03, 0.6, 6]} />
            <meshLambertMaterial color={LAND.granite} />
          </mesh>
        </group>
      );
    case 'map':
      return (
        <mesh rotation={[-Math.PI / 2.4, 0, 0.3]} castShadow>
          <planeGeometry args={[0.44, 0.34]} />
          <meshLambertMaterial color={LAND.sandDry} side={2} />
        </mesh>
      );
    case 'bucket':
      return (
        <mesh castShadow>
          <cylinderGeometry args={[0.24, 0.2, 0.36, 12]} />
          <meshLambertMaterial color={TOY.blue} />
        </mesh>
      );
    case 'backpack':
      return (
        <mesh castShadow>
          <boxGeometry args={[0.4, 0.5, 0.26]} />
          <meshLambertMaterial color={TOY.green} />
        </mesh>
      );
    case 'ball':
      return (
        <mesh castShadow>
          <sphereGeometry args={[0.55, 16, 12]} />
          <meshLambertMaterial color={TOY.yellow} emissive={TOY.yellowDeep} emissiveIntensity={0.5} />
        </mesh>
      );
    case 'orb':
    default:
      return (
        <mesh castShadow>
          <sphereGeometry args={[0.3, 14, 10]} />
          <meshLambertMaterial color={ORB_COLOR} emissive="#5c0300" emissiveIntensity={0.35} />
        </mesh>
      );
  }
}

/** Kinds that put light into the world when switched on. */
const LIGHT_COLOR: Partial<Record<ItemKind, string>> = {
  torch: '#ffe6b8',
  flare: '#ff5a7a',
  ball: '#ffe089',
};

function WorldItem({ id, litIds }: { id: number; litIds: RefObject<Set<number>> }) {
  const root = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const light = useRef<PointLight>(null);
  const meta = useMmStore((s) => s.itemMeta.get(id));

  useFrame(({ clock }) => {
    const item = live.items.get(id);
    if (!root.current) return;
    if (!item) {
      root.current.visible = false;
      return;
    }
    root.current.visible = true;

    if (item.holder >= 0) {
      // Carried: ride in the holder's right hand, slightly out in front.
      const holder =
        item.holder === live.selfSlot
          ? { x: live.self.x, y: live.self.y, z: live.self.z, yaw: live.self.yaw }
          : live.players.get(item.holder);
      if (!holder) {
        root.current.visible = false;
        return;
      }
      const side = 0.5;
      const forward = 0.4;
      root.current.position.set(
        holder.x + Math.sin(holder.yaw) * forward + Math.cos(holder.yaw) * side,
        holder.y + 1.02,
        holder.z + Math.cos(holder.yaw) * forward - Math.sin(holder.yaw) * side,
      );
      root.current.rotation.y = holder.yaw;
    } else {
      root.current.position.set(item.x, item.y, item.z);
      // A red round on the ground turns slowly, because it is the one object in
      // the game the group is actively looking for.
      if (item.kind === 'orb' && spin.current) {
        spin.current.rotation.y = clock.elapsedTime * 0.9;
        root.current.position.y = item.y + Math.sin(clock.elapsedTime * 1.6) * 0.08;
      }
    }

    if (light.current) {
      const on = item.lit && litIds.current.has(item.id);
      light.current.visible = on;
      light.current.intensity = on ? (item.kind === 'flare' ? 90 : 26) : 0;
    }
  });

  if (!meta) return null;
  const lightColor = LIGHT_COLOR[meta.kind];

  return (
    <group ref={root}>
      <group ref={spin}>
        <ItemMesh kind={meta.kind} label={meta.label} />
      </group>
      {lightColor ? (
        <pointLight
          ref={light}
          color={lightColor}
          distance={meta.kind === 'flare' ? 60 : 26}
          decay={1.6}
          visible={false}
        />
      ) : null}
    </group>
  );
}

/**
 * Every object on the island.
 *
 * Light budget: the eight objects nearest the player may cast light, everything
 * else is drawn unlit. Forward rendering pays per light per fragment, and a
 * torch behind a hill contributes nothing but cost.
 */
export function Items3D() {
  const ids = useMmStore((s) => [...s.itemMeta.keys()]);
  const lit = useRef<Set<number>>(new Set());

  useFrame(() => {
    // Recomputed cheaply: forty distance checks, a few times a second's worth
    // of work spread over every frame is still nothing.
    const near: { id: number; d: number }[] = [];
    for (const item of live.items.values()) {
      if (!item.lit) continue;
      near.push({ id: item.id, d: Math.hypot(item.x - live.self.x, item.z - live.self.z) });
    }
    near.sort((a, b) => a.d - b.d);
    lit.current = new Set(near.slice(0, 8).map((entry) => entry.id));
  });

  return (
    <>
      {ids.map((id) => (
        <WorldItem key={id} id={id} litIds={lit} />
      ))}
    </>
  );
}
