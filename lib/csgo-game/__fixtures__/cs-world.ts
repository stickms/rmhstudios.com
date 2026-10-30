/**
 * TEST SUPPORT ONLY: a synthetic Counter-Strike map on the shared BoxWorld — a 3000 × 2000 room with
 * Terrorist spawns in the west, Counter-Terrorist spawns in the east, two bomb sites (A north, B south)
 * with crates, buy zones round the spawns, a deathmatch spawn set, and info_map_parameters — plus the
 * hand-written weapon data fixture installed. Its brush volumes take `mins` / `maxs` keyvalues (no BSP).
 */

import { BspEntity } from '../../tf2-game/formats/keyvalues';
import type { BspFile } from '../../tf2-game/formats/bsp';
import { parseEntityLump } from '../../tf2-game/formats/keyvalues';
import {
  BoxWorld,
  boxBrush,
  roomBrushes,
  type Brush,
} from '../../tf2-game/sim/__fixtures__/box-world';
import type { MapCollision } from '../../tf2-game/world/map-collision';
import { emptyUserCmd, type UserCmd } from '../../tf2-game/core/types';
import { setCsWeaponData } from '../data/weapon-data';
import { WEAPON_DATA_FIXTURE } from '../data/__fixtures__/weapon-data.fixture';
import { registerCsGame } from '../register';
import type { CsMode } from '../constants';
import { CsWorld, type CsWorldInit } from '../world';
import type { CsSettings } from '../rules';

export const SITE_A = { x: 0, y: 650, z: 0 };
export const SITE_B = { x: 0, y: -650, z: 0 };
const SITE_HALF = 160;

/** Installs the fixture weapon data and registers the CS module (call before building worlds). */
export function setupCs(): void {
  registerCsGame();
  setCsWeaponData(WEAPON_DATA_FIXTURE);
}

const kv = (pairs: Record<string, string>): BspEntity => new BspEntity(Object.entries(pairs));

export function csBrushes(extra: Brush[] = []): Brush[] {
  return [
    // A 3000 × 2000 room (roomBrushes is square: ±1500, with walls closing y to ±1000).
    ...roomBrushes(1500, 400),
    boxBrush({ x: -1500, y: 1000, z: 0 }, { x: 1500, y: 1500, z: 400 }),
    boxBrush({ x: -1500, y: -1500, z: 0 }, { x: 1500, y: -1000, z: 400 }),
    // Cover: crates at each site and mid.
    boxBrush({ x: 200, y: 560, z: 0 }, { x: 260, y: 620, z: 56 }, { surfaceName: 'wood/crate' }),
    boxBrush(
      { x: -260, y: -620, z: 0 },
      { x: -200, y: -560, z: 56 },
      { surfaceName: 'wood/crate' },
    ),
    boxBrush({ x: -60, y: -120, z: 0 }, { x: 60, y: 120, z: 72 }, { surfaceName: 'concrete/wall' }),
    ...extra,
  ];
}

export function csEntities(): BspEntity[] {
  const out: BspEntity[] = [kv({ classname: 'worldspawn' })];
  for (let i = 0; i < 6; i++) {
    out.push(
      kv({
        classname: 'info_player_terrorist',
        origin: `-1300 ${-250 + i * 100} 8`,
        angles: '0 0 0',
      }),
    );
    out.push(
      kv({
        classname: 'info_player_counterterrorist',
        origin: `1300 ${-250 + i * 100} 8`,
        angles: '0 180 0',
      }),
    );
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    out.push(
      kv({
        classname: 'info_deathmatch_spawn',
        origin: `${Math.round(Math.cos(a) * 900)} ${Math.round(Math.sin(a) * 700)} 8`,
        angles: `0 ${(i * 45) % 360} 0`,
      }),
    );
  }
  const box = (
    cls: string,
    c: { x: number; y: number },
    half: number,
    extra: Record<string, string> = {},
  ) =>
    kv({
      classname: cls,
      origin: `${c.x} ${c.y} 0`,
      mins: `${-half} ${-half} 0`,
      maxs: `${half} ${half} 128`,
      ...extra,
    });
  out.push(box('func_bomb_target', SITE_A, SITE_HALF, { targetname: 'bombsite_a', model: '*1' }));
  out.push(box('func_bomb_target', SITE_B, SITE_HALF, { targetname: 'bombsite_b', model: '*2' }));
  out.push(box('func_buyzone', { x: -1300, y: 0 }, 300, { TeamNum: '2' }));
  out.push(box('func_buyzone', { x: 1300, y: 0 }, 300, { TeamNum: '3' }));
  out.push(kv({ classname: 'info_map_parameters', bombradius: '500' }));
  return out;
}

export interface CsTestWorldOptions {
  mode?: CsMode;
  seed?: number;
  settings?: Partial<CsSettings>;
  extraBrushes?: Brush[];
  isServer?: boolean;
  friendlyFire?: boolean;
}

export function csCollision(extra: Brush[] = []): BoxWorld {
  return new BoxWorld(csBrushes(extra));
}

export function csTestWorld(o: CsTestWorldOptions = {}): CsWorld {
  setupCs();
  const init: CsWorldInit = {
    collision: csCollision(o.extraBrushes),
    entities: csEntities(),
    mode: o.mode ?? 'de',
    settings: o.settings,
    options: {
      seed: o.seed ?? 11,
      lagCompensation: o.isServer !== false,
      isServer: o.isServer !== false,
      friendlyFire: o.friendlyFire ?? false,
    },
  };
  return new CsWorld(init);
}

/** A fake BSP for the nav generator: the map's entities and the two bomb targets' brush models. */
export function csNavBsp(): BspFile {
  const lump = csEntities()
    .map((e) => `{\n${e.props.map(([k, v]) => `"${k}" "${v}"`).join('\n')}\n}`)
    .join('\n');
  // Brush model bounds are relative to the entity's origin (the generator adds it).
  const model = () => ({
    mins: { x: -SITE_HALF, y: -SITE_HALF, z: 0 },
    maxs: { x: SITE_HALF, y: SITE_HALF, z: 128 },
    origin: { x: 0, y: 0, z: 0 },
    headNode: 0,
    firstFace: 0,
    numFaces: 0,
  });
  return {
    version: 21,
    entities: parseEntityLump(lump),
    models: [model(), model(), model()],
    planes: {
      count: 1,
      normal: Float32Array.from([0, 0, 1]),
      dist: Float32Array.from([0]),
      type: Int32Array.from([2]),
    },
    nodes: { count: 1, planeNum: Int32Array.from([0]), children: Int32Array.from([-1, -1]) },
    leafs: { count: 1, cluster: Int16Array.from([0]) },
    visibility: null,
  } as unknown as BspFile;
}

/** The BoxWorld as the nav generator's MapCollision (no brush models move). */
export function asMapCollision(box: BoxWorld): MapCollision {
  return Object.assign(box, {
    isModelSolid: () => true,
    setModelSolid: () => {},
    pointInModel: () => false,
  }) as unknown as MapCollision;
}

/** A command for a scripted player. */
export function cmdFor(world: CsWorld, n: number, over: Partial<UserCmd> = {}): UserCmd {
  const c = emptyUserCmd();
  c.commandNumber = n;
  c.tickCount = world.tickCount + 1;
  c.randomSeed = (n * 2654435761) >>> 1;
  return { ...c, ...over, viewAngles: { ...c.viewAngles, ...(over.viewAngles ?? {}) } };
}
