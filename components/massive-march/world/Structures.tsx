/**
 * Massive March — everything somebody built.
 *
 * Flat primary solids at a scale nothing on a real coast has any business being:
 * a fifty-metre yellow tower, a red arch over a beach, three coloured posts in a
 * gully. They are navigation first and architecture second — the test each one
 * has to pass is whether you can name it from three hundred metres away and be
 * understood.
 *
 * Nothing here is lit like it is real. `meshLambertMaterial` with no roughness
 * and no metalness gives a flat wash that keeps the built world reading as
 * painted against terrain that reads as observed, which is the whole contrast
 * the art direction rests on.
 *
 * Sign lettering goes through a canvas texture rather than a text mesh: an SDF
 * text renderer wants to fetch a font, and the production CSP does not allow a
 * page to fetch anything at all.
 */

'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, LinearFilter, type Mesh, type MeshBasicMaterial } from 'three';
import type { QualityFlags } from '@/lib/render/tier';
import { LAND, TOY } from '@/lib/massive-march/palette';
import { daylight } from '@/lib/massive-march/constants';
import { currentDayFraction } from '@/lib/massive-march/live';
import { STRUCTURES, type Structure } from '@/lib/massive-march/world/regions';
import { PUZZLE_SITES, TOWERS } from '@/lib/massive-march/world/sites';
import { groundY } from '@/lib/massive-march/world/terrain';

/** Paint a sign face: cream board, black condensed capitals, hard border. */
function makeSignTexture(text: string): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#f7f3e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = TOY.black;
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);

  ctx.fillStyle = TOY.black;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Shrink to fit rather than wrap: these are three or four words and a wrapped
  // sign at forty metres is a smudge.
  let size = 58;
  do {
    ctx.font = `900 ${size}px ui-sans-serif, system-ui, sans-serif`;
    size -= 3;
  } while (ctx.measureText(text).width > canvas.width - 60 && size > 16);
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  texture.anisotropy = 4;
  return texture;
}

function Sign({ text, x, z, facing = 0 }: { text: string; x: number; z: number; facing?: number }) {
  const texture = useMemo(() => makeSignTexture(text), [text]);
  useEffect(() => () => texture?.dispose(), [texture]);
  const y = groundY(x, z);
  if (!texture) return null;
  return (
    <group position={[x, y, z]} rotation={[0, facing, 0]}>
      <mesh position={[0, 1.1, 0]} castShadow>
        <boxGeometry args={[0.18, 2.2, 0.18]} />
        <meshLambertMaterial color={TOY.black} />
      </mesh>
      <mesh position={[0, 2.5, 0.02]}>
        <planeGeometry args={[2.6, 0.65]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <mesh position={[0, 2.5, -0.02]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[2.6, 0.65]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Block({ s, shadows }: { s: Structure; shadows: boolean }) {
  const y = groundY(s.x, s.z) + (s.y ?? 0);
  return (
    <mesh
      position={[s.x, y + s.h / 2, s.z]}
      rotation={[0, s.rot ?? 0, 0]}
      castShadow={shadows}
      receiveShadow={shadows}
    >
      <boxGeometry args={[s.w, s.h, s.d]} />
      <meshLambertMaterial color={s.color} />
    </mesh>
  );
}

function Column({ s, shadows }: { s: Structure; shadows: boolean }) {
  const y = groundY(s.x, s.z) + (s.y ?? 0);
  return (
    <mesh position={[s.x, y + s.h / 2, s.z]} castShadow={shadows} receiveShadow={shadows}>
      <cylinderGeometry args={[s.w / 2, s.w / 2, s.h, 12]} />
      <meshLambertMaterial color={s.color} />
    </mesh>
  );
}

function Mast({ s, shadows }: { s: Structure; shadows: boolean }) {
  const y = groundY(s.x, s.z);
  return (
    <group position={[s.x, y, s.z]}>
      <mesh position={[0, s.h / 2, 0]} castShadow={shadows}>
        <cylinderGeometry args={[s.w / 2, s.w / 2, s.h, 8]} />
        <meshLambertMaterial color={TOY.white} />
      </mesh>
      <mesh position={[0.9, s.h - 1.4, 0]} castShadow={shadows}>
        <boxGeometry args={[1.8, 1.2, 0.12]} />
        <meshLambertMaterial color={s.color} />
      </mesh>
    </group>
  );
}

function Arch({ s, shadows }: { s: Structure; shadows: boolean }) {
  const y = groundY(s.x, s.z);
  const legWidth = Math.max(1.2, s.w * 0.14);
  return (
    <group position={[s.x, y, s.z]} rotation={[0, s.rot ?? 0, 0]}>
      <mesh position={[-s.w / 2 + legWidth / 2, s.h / 2, 0]} castShadow={shadows}>
        <boxGeometry args={[legWidth, s.h, s.d]} />
        <meshLambertMaterial color={s.color} />
      </mesh>
      <mesh position={[s.w / 2 - legWidth / 2, s.h / 2, 0]} castShadow={shadows}>
        <boxGeometry args={[legWidth, s.h, s.d]} />
        <meshLambertMaterial color={s.color} />
      </mesh>
      <mesh position={[0, s.h - legWidth / 2, 0]} castShadow={shadows}>
        <boxGeometry args={[s.w, legWidth, s.d]} />
        <meshLambertMaterial color={s.color} />
      </mesh>
    </group>
  );
}

function Disc({ s }: { s: Structure }) {
  const y = groundY(s.x, s.z);
  return (
    <mesh position={[s.x, y + s.h / 2, s.z]} receiveShadow>
      <cylinderGeometry args={[s.w / 2, s.w / 2, s.h, 20]} />
      <meshLambertMaterial color={s.color} />
    </mesh>
  );
}

/**
 * A booth: a wall with a doorway and no roof.
 *
 * The gap in the geometry is the same gap the collider has, so walking in
 * through the door works and walking through the wall does not. No roof, because
 * the enclosure only has to break line of sight at head height — and a lid would
 * make the inside pitch dark at exactly the moment somebody is trying to read
 * four glyphs off the wall.
 */
function Booth({ s, shadows }: { s: Structure; shadows: boolean }) {
  const y = groundY(s.x, s.z);
  const [door, arc] = s.door ?? [0, 0.9];
  const radius = s.w / 2;
  return (
    <group position={[s.x, y, s.z]}>
      <mesh position={[0, s.h / 2, 0]} castShadow={shadows} receiveShadow={shadows}>
        <cylinderGeometry
          args={[radius, radius, s.h, 32, 1, true, door + arc / 2, Math.PI * 2 - arc]}
        />
        <meshLambertMaterial color={s.color} side={2} />
      </mesh>
      {/* A painted lintel over the doorway, so the way in reads from outside. */}
      <mesh position={[Math.cos(door) * radius, s.h, Math.sin(door) * radius]} castShadow={shadows}>
        <boxGeometry args={[1.4, 0.4, 1.4]} />
        <meshLambertMaterial color={TOY.red} />
      </mesh>
    </group>
  );
}

/**
 * A progression hub.
 *
 * Three tapering stages and a lamp. The lamp is the reason for the shape: it is
 * the highest fixed light on the island, it comes on at dusk, and it is what a
 * group separated after dark steers by.
 */
function Tower({ s, shadows, satisfied }: { s: Structure; shadows: boolean; satisfied: boolean }) {
  const lamp = useRef<Mesh>(null);
  const y = groundY(s.x, s.z);
  const stage = s.h / 3;

  useFrame(() => {
    if (!lamp.current) return;
    const light = daylight(currentDayFraction());
    const material = lamp.current.material as unknown as MeshBasicMaterial;
    // Bright after dark; brighter still once the tower has what it wanted.
    const glow = (1 - light) * (satisfied ? 1 : 0.55);
    material.opacity = 0.35 + glow * 0.65;
    lamp.current.scale.setScalar(1 + glow * 0.25);
  });

  return (
    <group position={[s.x, y, s.z]}>
      <mesh position={[0, stage / 2, 0]} castShadow={shadows} receiveShadow={shadows}>
        <boxGeometry args={[s.w, stage, s.d]} />
        <meshLambertMaterial color={s.color} />
      </mesh>
      <mesh position={[0, stage * 1.5, 0]} castShadow={shadows}>
        <boxGeometry args={[s.w * 0.74, stage, s.d * 0.74]} />
        <meshLambertMaterial color={s.color} />
      </mesh>
      <mesh position={[0, stage * 2.5, 0]} castShadow={shadows}>
        <boxGeometry args={[s.w * 0.5, stage, s.d * 0.5]} />
        <meshLambertMaterial color={s.color} />
      </mesh>
      {/* The slot the red rounds go into, at eye level and unmistakably a mouth. */}
      <mesh position={[0, 1.6, s.d / 2 + 0.05]}>
        <boxGeometry args={[1.6, 1.2, 0.3]} />
        <meshLambertMaterial color={TOY.black} />
      </mesh>
      <mesh ref={lamp} position={[0, s.h + 1.4, 0]}>
        <sphereGeometry args={[1.5, 12, 10]} />
        <meshBasicMaterial color={TOY.white} transparent opacity={0.4} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function Structures({ quality, satisfied }: { quality: QualityFlags; satisfied: Set<string> }) {
  const shadows = quality.shadows;

  return (
    <>
      {STRUCTURES.map((s) => {
        switch (s.kind) {
          case 'tower': {
            const tower = TOWERS.find((t) => Math.hypot(t.x - s.x, t.z - s.z) < 2);
            return (
              <Tower
                key={s.id}
                s={s}
                shadows={shadows}
                satisfied={tower ? satisfied.has(tower.id) : false}
              />
            );
          }
          case 'arch':
            return <Arch key={s.id} s={s} shadows={shadows} />;
          case 'column':
            return <Column key={s.id} s={s} shadows={shadows} />;
          case 'mast':
            return <Mast key={s.id} s={s} shadows={shadows} />;
          case 'ring':
            return <Booth key={s.id} s={s} shadows={shadows} />;
          case 'disc':
            return <Disc key={s.id} s={s} />;
          default:
            return <Block key={s.id} s={s} shadows={shadows} />;
        }
      })}

      {/* One sign per installation, planted where you arrive at it. */}
      {PUZZLE_SITES.map((site) => (
        <Sign
          key={`sign-${site.id}`}
          text={site.sign}
          x={site.x}
          z={site.z + site.radius * 0.55}
          facing={Math.PI}
        />
      ))}

      {/* The waterline marker at the landing — the first thing anybody sees. */}
      <Sign text="TIDAL LANDING" x={4} z={306} facing={Math.PI} />
    </>
  );
}

/** The cart: a toy train that exists to be a landmark, a lift and a horn. */
export function Cart({ shadows }: { shadows: boolean }) {
  const body = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (!body.current) return;
    // It never actually goes anywhere on its own; it just rocks, which is enough
    // to make it read as a thing rather than a prop.
    body.current.rotation.z = Math.sin(clock.elapsedTime * 1.3) * 0.02;
  });

  const y = groundY(22, 246);
  return (
    <group position={[22, y, 246]}>
      <mesh ref={body} position={[0, 1.6, 0]} castShadow={shadows}>
        <boxGeometry args={[3.4, 2.2, 6.2]} />
        <meshLambertMaterial color={TOY.green} />
      </mesh>
      <mesh position={[0, 3.1, 0]} castShadow={shadows}>
        <boxGeometry args={[2.4, 0.9, 4.4]} />
        <meshLambertMaterial color={TOY.white} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <boxGeometry args={[4, 0.5, 7.4]} />
        <meshLambertMaterial color={LAND.granite} />
      </mesh>
    </group>
  );
}
