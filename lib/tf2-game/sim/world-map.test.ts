/**
 * The simulation on real maps (needs TF2_ROOT): ctf_2fort and cp_dustbowl
 * load, every class on both teams spawns at a team spawn, two minutes of
 * scripted play run without NaNs or players leaving the map, respawn waves
 * bring the dead back, and resupply cabinets refill.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  IN_ATTACK,
  IN_DUCK,
  IN_FORWARD,
  IN_JUMP,
  TF_CLASS_SOLDIER,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  TICK_INTERVAL,
} from '../core/constants';
import { emptyUserCmd, type UserCmd } from '../core/types';
import { UniformRandomStream } from '../core/random';
import { ALL_CLASSES } from './class-speeds';
import { loadMap, type LoadedMap } from './map-loader';
import { GameWorld } from './world';
import { GR_STATE_RND_RUNNING } from './rules';
import type { Player } from './player';
import { FuncRegenerate } from './triggers';
import { TeamSpawn } from './spawn';

const ROOT = process.env.TF2_ROOT;

function load(name: string): LoadedMap {
  const bytes = readFileSync(path.join(ROOT!, 'tf', 'maps', `${name}.bsp`));
  return loadMap(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength), { name });
}

function fill(world: GameWorld): Player[] {
  const players: Player[] = [];
  for (const team of [TF_TEAM_RED, TF_TEAM_BLUE]) {
    for (const cls of ALL_CLASSES) {
      const p = world.addPlayer(`${team === TF_TEAM_RED ? 'red' : 'blu'}-${cls}`, { bot: true });
      p.requestTeam(team);
      p.requestClass(cls);
      players.push(p);
    }
  }
  return players;
}

/** A deterministic wander: new heading every second, sometimes jump/duck/shoot. */
function scriptedCommand(p: Player, world: GameWorld, rng: UniformRandomStream, state: Map<number, UserCmd>): UserCmd {
  let cmd = state.get(p.id);
  if (!cmd || world.tickCount % 66 === p.id % 66) {
    cmd = emptyUserCmd();
    cmd.viewAngles = { x: rng.randomFloat(-30, 30), y: rng.randomFloat(0, 360), z: 0 };
    cmd.forwardMove = rng.randomInt(0, 2) === 0 ? 0 : 450;
    cmd.sideMove = rng.randomFloat(-450, 450);
    cmd.buttons = cmd.forwardMove ? IN_FORWARD : 0;
    const r = rng.randomInt(0, 9);
    if (r === 0) cmd.buttons |= IN_JUMP;
    if (r === 1) cmd.buttons |= IN_DUCK;
    if (r >= 7) cmd.buttons |= IN_ATTACK;
    state.set(p.id, cmd);
  }
  const out: UserCmd = { ...cmd, viewAngles: { ...cmd.viewAngles } };
  out.commandNumber = world.tickCount;
  out.tickCount = world.tickCount;
  out.randomSeed = (world.tickCount * 31 + p.id) | 0;
  // Release jump so it re-triggers.
  if (world.tickCount % 2) out.buttons &= ~IN_JUMP;
  return out;
}

function finite(v: { x: number; y: number; z: number }): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

describe.skipIf(!ROOT)('GameWorld on real maps', () => {
  let fort: LoadedMap;
  beforeAll(() => {
    fort = load('ctf_2fort');
  });

  it('ctf_2fort: all classes spawn and two minutes of scripted play stay sane', () => {
    const world = new GameWorld({ map: fort, options: { seed: 42, lagCompensation: true } });
    const spawns = world.spawns.spawnPoints();
    expect(spawns.filter((s) => s.team === TF_TEAM_RED).length).toBeGreaterThan(5);
    expect(spawns.filter((s) => s.team === TF_TEAM_BLUE).length).toBeGreaterThan(5);
    const players = fill(world);
    for (let i = 0; i < 600 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
    expect(world.rules.state).toBe(GR_STATE_RND_RUNNING);
    for (const p of players) {
      expect(p.alive, p.name).toBe(true);
      // At one of its team's spawn points (dropped to the ground).
      const near = spawns.some(
        (s: TeamSpawn) => s.team === p.team && Math.hypot(s.origin.x - p.origin.x, s.origin.y - p.origin.y) < 1,
      );
      expect(near, p.name).toBe(true);
    }

    const startPos = new Map(players.map((p) => [p.id, { ...p.origin }]));
    let maxTravel = 0;
    const bounds = fort.bsp.models[0];
    const rng = new UniformRandomStream(1234);
    const cmds = new Map<number, UserCmd>();
    let deaths = 0;
    let respawns = 0;
    const ticks = Math.round(120 / TICK_INTERVAL);
    world.drainEvents();
    const t0 = performance.now();
    for (let i = 0; i < ticks; i++) {
      // The bases are far apart on 2fort: every 30 s a few players die so the waves run.
      if (i > 0 && i % Math.round(30 / TICK_INTERVAL) === 0) {
        for (let k = 0; k < 4; k++) players[(i + k * 5) % players.length].commitSuicide();
      }
      for (const p of players) world.queueCommand(p.id, scriptedCommand(p, world, rng, cmds));
      world.step();
      for (const e of world.drainEvents()) {
        if (e.type === 'death') deaths++;
        if (e.type === 'spawn') respawns++;
      }
      if (i % 66 === 0) {
        for (const p of players) {
          expect(finite(p.origin), `${p.name} origin`).toBe(true);
          expect(finite(p.velocity), `${p.name} velocity`).toBe(true);
          if (!p.alive) continue;
          const s0 = startPos.get(p.id)!;
          maxTravel = Math.max(maxTravel, Math.hypot(p.origin.x - s0.x, p.origin.y - s0.y));
          expect(p.origin.x).toBeGreaterThanOrEqual(bounds.mins.x - 64);
          expect(p.origin.y).toBeGreaterThanOrEqual(bounds.mins.y - 64);
          expect(p.origin.z).toBeGreaterThanOrEqual(bounds.mins.z - 64);
          expect(p.origin.x).toBeLessThanOrEqual(bounds.maxs.x + 64);
          expect(p.origin.y).toBeLessThanOrEqual(bounds.maxs.y + 64);
          expect(p.origin.z).toBeLessThanOrEqual(bounds.maxs.z + 64);
        }
      }
    }
    const ms = performance.now() - t0;
    expect(maxTravel).toBeGreaterThan(300);
    expect(deaths).toBeGreaterThanOrEqual(12);
    expect(respawns).toBeGreaterThanOrEqual(8);
    // Budget: 18 players at 66.67 Hz must simulate far faster than real time.
    expect(ms / ticks).toBeLessThan(15);
  });

  it('ctf_2fort: respawn waves bring a dead soldier back at a red spawn', () => {
    const world = new GameWorld({ map: fort, options: { seed: 3 } });
    const s = world.addPlayer('s', { bot: true });
    s.requestTeam(TF_TEAM_RED);
    s.requestClass(TF_CLASS_SOLDIER);
    const b = world.addPlayer('b', { bot: true });
    b.requestTeam(TF_TEAM_BLUE);
    b.requestClass(TF_CLASS_SOLDIER);
    for (let i = 0; i < 600 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
    s.commitSuicide();
    const died = world.curtime;
    let back = -1;
    for (let i = 0; i < Math.round(40 / TICK_INTERVAL) && back < 0; i++) {
      world.step();
      if (s.alive) back = world.curtime;
    }
    expect(back).toBeGreaterThan(died + 6.4);
    expect(back - died).toBeLessThan(6.4 + 30);
    expect(s.health).toBe(200);
  });

  it('ctf_2fort: a resupply cabinet refills health and ammo, then cools down', () => {
    const world = new GameWorld({ map: fort, options: { seed: 5 } });
    const p = world.addPlayer('p', { bot: true });
    p.requestTeam(TF_TEAM_RED);
    p.requestClass(TF_CLASS_SOLDIER);
    const q = world.addPlayer('q', { bot: true });
    q.requestTeam(TF_TEAM_BLUE);
    q.requestClass(TF_CLASS_SOLDIER);
    for (let i = 0; i < 600 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
    const cabinets = world.findAllByClassname('func_regenerate') as FuncRegenerate[];
    expect(cabinets.length).toBeGreaterThan(0);
    const cab = cabinets.find((c) => c.team === TF_TEAM_RED || c.team === 0)!;
    expect(cab).toBeDefined();
    p.health = 20;
    p.ammo[1] = 0;
    const c = world.centerOf(cab);
    // Stand in the volume: put the hull's centre at the cabinet volume's centre.
    world.teleportEntity(p, { x: c.x, y: c.y, z: c.z - 41 }, null, { x: 0, y: 0, z: 0 });
    world.step();
    world.step();
    expect(p.health).toBe(200);
    expect(p.ammo[1]).toBe(p.maxAmmo[1]);
    p.health = 20;
    world.step();
    expect(p.health).toBe(20);
  });

  it('ctf_2fort: a won round restarts with the map entities re-created (CleanUpMap)', () => {
    const world = new GameWorld({ map: fort, options: { seed: 11, rules: { bonusRoundTime: 2 } } });
    const players = fill(world);
    for (let i = 0; i < 600 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
    const count = (cls: string) => world.findAllByClassname(cls).length;
    const before = {
      regen: count('func_regenerate'),
      spawns: count('info_player_teamspawn'),
      kits: count('item_healthkit_medium') + count('item_healthkit_full') + count('item_healthkit_small'),
      rooms: count('func_respawnroom'),
    };
    expect(before.regen).toBeGreaterThan(0);
    world.rules.setWinningTeam(TF_TEAM_RED, 3);
    for (let i = 0; i < 800 && world.rules.state !== GR_STATE_RND_RUNNING; i++) world.step();
    expect(world.rules.state).toBe(GR_STATE_RND_RUNNING);
    expect(world.rules.teamScores[TF_TEAM_RED]).toBe(1);
    expect({
      regen: count('func_regenerate'),
      spawns: count('info_player_teamspawn'),
      kits: count('item_healthkit_medium') + count('item_healthkit_full') + count('item_healthkit_small'),
      rooms: count('func_respawnroom'),
    }).toEqual(before);
    for (const p of players) expect(p.alive, p.name).toBe(true);
    // Everyone is back in a respawn room of their team.
    expect(players.filter((p) => p.inRespawnRoom()).length).toBe(players.length);
  });

  it('cp_dustbowl loads and runs 20 seconds with a full server', () => {
    const map = load('cp_dustbowl');
    const world = new GameWorld({ map, options: { seed: 9 } });
    const players = fill(world);
    const rng = new UniformRandomStream(77);
    const cmds = new Map<number, UserCmd>();
    for (let i = 0; i < Math.round(20 / TICK_INTERVAL); i++) {
      for (const p of players) world.queueCommand(p.id, scriptedCommand(p, world, rng, cmds));
      world.step();
      world.drainEvents();
    }
    expect(players.filter((p) => p.alive).length).toBeGreaterThan(0);
    for (const p of players) expect(finite(p.origin)).toBe(true);
  });
});
