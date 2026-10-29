/**
 * Test scaffolding for the weapon suites: a large box room with team spawns,
 * players on teams, command builders and event filters. Test-only.
 */

import { TICK_INTERVAL } from '../../../core/constants';
import { hashSeed } from '../../../core/random';
import { emptyUserCmd, type UserCmd } from '../../../core/types';
import { vec3, type Vec3 } from '../../../core/vec';
import { BspEntity } from '../../../formats/keyvalues';
import { BoxWorld, roomBrushes } from '../../__fixtures__/box-world';
import type { DamageEvent, SimEvent } from '../../events';
import type { Player } from '../../player';
import { GR_STATE_RND_RUNNING } from '../../rules';
import { GameWorld } from '../../world';
import { registerStockWeapons } from '../index';
import { setRandomCritsEnabled } from '../tf-weapon';

registerStockWeapons();

const kv = (pairs: Record<string, string>): BspEntity => new BspEntity(Object.entries(pairs));

/** A (2·half)-wide room, 512 high, with RED spawns on −x and BLUE on +x. */
export function makeWorld(half = 2048, seed = 7): GameWorld {
  const collision = new BoxWorld(roomBrushes(half, 1024));
  const entities = [
    kv({ classname: 'worldspawn' }),
    kv({ classname: 'info_player_teamspawn', origin: `${-half + 200} 0 8`, TeamNum: '2', angles: '0 0 0' }),
    kv({ classname: 'info_player_teamspawn', origin: `${-half + 200} 200 8`, TeamNum: '2', angles: '0 0 0' }),
    kv({ classname: 'info_player_teamspawn', origin: `${-half + 200} -200 8`, TeamNum: '2', angles: '0 0 0' }),
    kv({ classname: 'info_player_teamspawn', origin: `${half - 200} 0 8`, TeamNum: '3', angles: '0 180 0' }),
    kv({ classname: 'info_player_teamspawn', origin: `${half - 200} 200 8`, TeamNum: '3', angles: '0 180 0' }),
    kv({ classname: 'info_player_teamspawn', origin: `${half - 200} -200 8`, TeamNum: '3', angles: '0 180 0' }),
  ];
  return new GameWorld({ collision, entities, options: { seed, lagCompensation: false } });
}

export function addPlayer(world: GameWorld, name: string, team: number, cls: number): Player {
  const p = world.addPlayer(name, { bot: true });
  p.requestTeam(team);
  p.requestClass(cls);
  return p;
}

export function startRound(world: GameWorld): void {
  for (let i = 0; i < 3000 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
  if (world.rules.state !== GR_STATE_RND_RUNNING) throw new Error('round never started');
}

/** A command aiming at (pitch, yaw) with buttons, seeded per tick and player. */
export function cmd(p: Player, buttons = 0, pitch = 0, yaw = 0, select = 0): UserCmd {
  const c = emptyUserCmd();
  c.buttons = buttons;
  c.viewAngles.x = pitch;
  c.viewAngles.y = yaw;
  c.weaponSelect = select;
  c.tickCount = p.world.tickCount + 1;
  c.commandNumber = p.world.tickCount + 1;
  c.randomSeed = hashSeed(((p.world.tickCount + 1) * 7919) ^ (p.id * 104729));
  return c;
}

export type CmdFn = (p: Player) => UserCmd | null;

/** Steps `n` ticks queueing one command per player from `fn` (null = idle command). */
export function run(world: GameWorld, n: number, fn?: CmdFn): void {
  for (let i = 0; i < n; i++) {
    world.forEachPlayer((p) => {
      const c = fn ? fn(p) : null;
      world.queueCommand(p.id, c ?? cmd(p, 0, p.eyeAngles.x, p.eyeAngles.y));
    });
    world.step();
  }
}

export const ticks = (seconds: number): number => Math.round(seconds / TICK_INTERVAL);

/** Puts a player at a spot looking along `yaw`, at rest. */
export function place(world: GameWorld, p: Player, x: number, y: number, yaw = 0, z = 1): void {
  world.teleportEntity(p, vec3(x, y, z), vec3(0, yaw, 0), vec3());
  p.eyeAngles.y = yaw;
}

/** Damage events against a victim among `events`. */
export const damageTo = (events: readonly SimEvent[], victim: number): DamageEvent[] =>
  events.filter((e): e is DamageEvent => e.type === 'damage' && e.victim === victim);

export const totalDamage = (events: readonly SimEvent[], victim: number): number =>
  damageTo(events, victim).reduce((a, e) => a + e.amount, 0);

/** Tops up every ammo type and clip so rate tests aren't interrupted. */
export function topUp(p: Player): void {
  p.ammo.set(p.maxAmmo);
  for (const w of p.weapons) if (w && w.maxClip > 0) w.clip = w.maxClip;
}

export const centerDistance = (a: Player, b: Player): number => {
  const ca = a.worldSpaceCenter(vec3());
  const cb = b.worldSpaceCenter(vec3());
  return Math.hypot(ca.x - cb.x, ca.y - cb.y, ca.z - cb.z);
};

export const pitchTo = (from: Vec3, to: Vec3): number =>
  (-Math.atan2(to.z - from.z, Math.hypot(to.x - from.x, to.y - from.y)) * 180) / Math.PI;

export { setRandomCritsEnabled };
