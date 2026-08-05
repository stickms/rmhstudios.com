/**
 * Massive March — the installations, as objects in the world.
 *
 * Every puzzle's furniture is drawn from the same data the server validates
 * against, so a pad you can see is a pad the hub is watching. Nothing here reads
 * a client-side guess about state: the lit/held colours come from the world
 * snapshot, which is the hub's opinion, arriving fifteen times a second.
 *
 * Interaction deliberately does NOT live in these meshes. Pressing a console
 * button by clicking a two-centimetre box while pointer-locked in first person
 * is miserable with a mouse and impossible with a keyboard — so the world draws
 * the machine and the HUD, which knows how close you are and can be tabbed
 * through, drives it.
 */

'use client';

import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { CanvasTexture, LinearFilter, type Group, type Mesh } from 'three';
import { LAND, TOY } from '@/lib/massive-march/palette';
import { useMmStore } from '@/lib/massive-march/store';
import type { PuzzleStatus } from '@/lib/massive-march/net/events';
import { PUZZLE_SITES, siteMarker, type PuzzleSite } from '@/lib/massive-march/world/sites';
import { groundY } from '@/lib/massive-march/world/terrain';

const PAD_IDLE = LAND.granite;
const PAD_LIT = TOY.yellow;
const PAD_HELD = TOY.green;

function Pad({
  x,
  z,
  r,
  color,
  raised = 0.16,
}: {
  x: number;
  z: number;
  r: number;
  color: string;
  raised?: number;
}) {
  const y = groundY(x, z);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, raised / 2, 0]} receiveShadow>
        <cylinderGeometry args={[r, r * 1.06, raised, 20]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <mesh position={[0, raised + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.72, r * 0.86, 20]} />
        <meshBasicMaterial color={TOY.black} side={2} />
      </mesh>
    </group>
  );
}

/**
 * A totem: a post you can turn, with a head that points somewhere.
 *
 * Eight facings, one painted arrow, and a white band on the front face so the
 * direction is legible from behind as well — the person turning it is very
 * often not the person who knows which way it should go.
 */
function Totem({ x, z, facing }: { x: number; z: number; facing: number }) {
  const head = useRef<Group>(null);
  const y = groundY(x, z);

  useFrame((_, delta) => {
    if (!head.current) return;
    const target = (facing / 8) * Math.PI * 2;
    let delta2 = (target - head.current.rotation.y) % (Math.PI * 2);
    if (delta2 > Math.PI) delta2 -= Math.PI * 2;
    if (delta2 < -Math.PI) delta2 += Math.PI * 2;
    // Eased rather than snapped: a totem that jumps between facings gives no
    // feedback about which way it just went.
    head.current.rotation.y += delta2 * Math.min(1, delta * 9);
  });

  return (
    <group position={[x, y, z]}>
      <group ref={head} position={[0, 5.9, 0]}>
        <mesh castShadow>
          <boxGeometry args={[1.5, 1.1, 1.5]} />
          <meshLambertMaterial color={TOY.white} />
        </mesh>
        <mesh position={[0, 0, 1.05]} castShadow>
          <coneGeometry args={[0.55, 1.1, 4]} />
          <meshLambertMaterial color={TOY.red} />
        </mesh>
      </group>
      {/* The dial at hand height — where you stand to turn it. */}
      <mesh position={[0, 1.15, 0.85]}>
        <cylinderGeometry args={[0.32, 0.32, 0.22, 12]} />
        <meshLambertMaterial color={TOY.yellow} />
      </mesh>
    </group>
  );
}

/** Painted glyph faces on the console, so the machine looks like the puzzle. */
function makeConsoleTexture(count: number): CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#1b1a17';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cell = canvas.width / count;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#f7f3e8' : '#d8d2c2';
    ctx.fillRect(i * cell + 8, 26, cell - 16, 76);
  }
  const texture = new CanvasTexture(canvas);
  texture.minFilter = LinearFilter;
  return texture;
}

function Console({ x, z, buttons }: { x: number; z: number; buttons: number }) {
  const texture = useMemo(() => makeConsoleTexture(buttons), [buttons]);
  const y = groundY(x, z);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.4, 1.5, 1.4]} />
        <meshLambertMaterial color={TOY.black} />
      </mesh>
      {texture ? (
        <mesh position={[0, 1.42, 0]} rotation={[-Math.PI / 2.6, 0, 0]}>
          <planeGeometry args={[3.1, 0.8]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      ) : null}
    </group>
  );
}

function Hoop({ site }: { site: PuzzleSite }) {
  if (!site.hoop) return null;
  const { x, z, y, r, facing } = site.hoop;
  const ground = groundY(x, z);
  return (
    <group position={[x, ground, z]} rotation={[0, -facing, 0]}>
      <mesh position={[0, y / 2, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.45, y, 8]} />
        <meshLambertMaterial color={TOY.white} />
      </mesh>
      <mesh position={[0, y, 0]} rotation={[0, Math.PI / 2, 0]} castShadow>
        <torusGeometry args={[r, 0.32, 8, 28]} />
        <meshLambertMaterial color={TOY.red} />
      </mesh>
    </group>
  );
}

/** The lookout: a painted platform that says "the answer is visible from here". */
function Lookout({ x, z, r }: { x: number; z: number; r: number }) {
  const y = groundY(x, z);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.12, 0]} receiveShadow>
        <cylinderGeometry args={[r, r, 0.24, 24]} />
        <meshLambertMaterial color={TOY.white} />
      </mesh>
      <mesh position={[0, 0.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.55, r * 0.75, 24]} />
        <meshBasicMaterial color={TOY.blue} side={2} />
      </mesh>
    </group>
  );
}

/** A cairn where a marker has been dug up, so a swept area stays swept. */
function Cairn({ x, z }: { x: number; z: number }) {
  const y = groundY(x, z);
  return (
    <group position={[x, y, z]}>
      <mesh position={[0, 0.35, 0]} castShadow>
        <dodecahedronGeometry args={[0.6, 0]} />
        <meshLambertMaterial color={LAND.granite} flatShading />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <dodecahedronGeometry args={[0.38, 0]} />
        <meshLambertMaterial color={LAND.graniteWarm} flatShading />
      </mesh>
    </group>
  );
}

function padColor(id: string, status: PuzzleStatus | undefined): string {
  if (!status) return PAD_IDLE;
  if (status.state === 'solved' || status.state === 'skipped') return PAD_HELD;
  if (status.held?.includes(id)) return PAD_HELD;
  if (status.lit?.includes(id)) return PAD_LIT;
  return PAD_IDLE;
}

function SiteProps({ site, status }: { site: PuzzleSite; status: PuzzleStatus | undefined }) {
  const reveal = useMmStore((s) => s.reveal);
  const done = status?.state === 'solved' || status?.state === 'skipped';

  return (
    <group>
      {site.pads?.map((padSpot) => (
        <Pad
          key={padSpot.id}
          x={padSpot.x}
          z={padSpot.z}
          r={padSpot.r}
          color={padColor(padSpot.id, status)}
        />
      ))}

      {site.plates?.map((plate, index) => {
        // Only the guides see which plate is next — the reveal is the entitlement,
        // and the person wearing the bucket is never sent one.
        const isNext =
          reveal?.kind === 'plate' && reveal.site === site.id && reveal.plate === plate.id;
        const walked = (status?.step ?? 0) > index;
        return (
          <Pad
            key={plate.id}
            x={plate.x}
            z={plate.z}
            r={plate.r}
            raised={0.1}
            color={done ? PAD_HELD : isNext ? PAD_LIT : walked ? LAND.graniteWarm : PAD_IDLE}
          />
        );
      })}

      {site.totems?.map((totem, index) => (
        <Totem key={totem.id} x={totem.x} z={totem.z} facing={status?.facings?.[index] ?? 0} />
      ))}

      {site.console ? (
        <Console x={site.console.x} z={site.console.z} buttons={site.console.buttons} />
      ) : null}

      {site.lookout ? (
        <Lookout x={site.lookout.x} z={site.lookout.z} r={site.lookout.r} />
      ) : null}

      <Hoop site={site} />

      {/* A cairn at the centre of a finished hunt, so the area reads as done. */}
      {site.hunt && done ? <Cairn x={site.x} z={site.z} /> : null}

      {/* The mast. Always up, because a site you cannot see from the next ridge
          is a site nobody walks to; the flag is what says whether it is done. */}
      <SiteMast x={site.x} z={site.z} solved={done} />
    </group>
  );
}

/**
 * The mast over an installation — the thing you spot from the next ridge and
 * decide to walk to.
 *
 * Deliberately plain: a pole and a flag, in the same language as the `mast`
 * landmarks already on the island, so it reads as part of the world rather than
 * as a quest marker floating over it. Red is done, cream is not — which is the
 * meaning the red flag already carried, just no longer the only state that gets
 * a pole.
 */
function SiteMast({ x, z, solved }: { x: number; z: number; solved: boolean }) {
  const flag = useRef<Mesh>(null);
  const y = groundY(x, z);
  const { height, flag: state } = siteMarker(solved);

  useFrame(({ clock }) => {
    if (!flag.current) return;
    flag.current.rotation.y = Math.sin(clock.elapsedTime * 1.6) * 0.22;
  });

  return (
    <group position={[x, y, z]}>
      <mesh position={[0, height / 2, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.13, height, 6]} />
        <meshLambertMaterial color={TOY.white} />
      </mesh>
      <mesh ref={flag} position={[0.75, height - 0.9, 0]} castShadow>
        <boxGeometry args={[1.5, 1, 0.06]} />
        <meshLambertMaterial color={state === 'done' ? TOY.red : TOY.concrete} />
      </mesh>
    </group>
  );
}

export function PuzzleProps() {
  const puzzles = useMmStore((s) => s.world?.puzzles);
  const byId = useMemo(() => new Map((puzzles ?? []).map((p) => [p.id, p])), [puzzles]);

  return (
    <>
      {PUZZLE_SITES.map((site) => (
        <SiteProps key={site.id} site={site} status={byId.get(site.id)} />
      ))}
    </>
  );
}
