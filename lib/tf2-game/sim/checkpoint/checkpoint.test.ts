/**
 * World checkpoints (host migration): a world written down mid-match and
 * restored into a fresh one runs on exactly as the original does — the two are
 * compared field by field (their encodings) after N more ticks with the same
 * inputs. A synthetic room with scripted soldiers, demomen and engineers
 * (rockets, pipes, buildings), and, with TF2_ROOT, ctf_2fort with TFBots
 * through Tf2MatchHost (bots' brains, the console, the players' seats).
 */
import { describe, expect, it } from 'vitest';
import {
  IN_ATTACK,
  IN_ATTACK2,
  IN_DUCK,
  IN_FORWARD,
  IN_JUMP,
  IN_MOVELEFT,
  IN_RELOAD,
  TF_CLASS_DEMOMAN,
  TF_CLASS_ENGINEER,
  TF_CLASS_PYRO,
  TF_CLASS_SOLDIER,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
} from '../../core/constants';
import { emptyUserCmd, type UserCmd } from '../../core/types';
import { roomWorld } from '../../server/match.test-support';
import { registerAllSimModules } from '../register-all';
import type { GameWorld } from '../world';
import { checkpointCatalog } from '../../client/net/checkpoint-catalog';
import { RootIndex, withRoots } from './catalog';
import { encodeGraph, type EncodedGraph } from './graph';
import { captureWorld, restoreWorld } from './world-state';

registerAllSimModules();

/** A deterministic command for player `id` on `tick` (moves, turns, jumps, shoots, alt-fires). */
export function scriptedCmd(id: number, tick: number): UserCmd {
  const cmd = emptyUserCmd();
  const phase = (tick + id * 37) % 240;
  cmd.viewAngles = { x: ((tick * 3 + id * 11) % 60) - 30, y: (tick * 2 + id * 53) % 360, z: 0 };
  cmd.forwardMove = phase < 160 ? 450 : -200;
  cmd.sideMove = phase % 80 < 40 ? 300 : -300;
  cmd.buttons = IN_FORWARD | (phase % 80 < 40 ? 0 : IN_MOVELEFT);
  if (phase % 50 === 0) cmd.buttons |= IN_JUMP;
  if (phase > 100 && phase < 140) cmd.buttons |= IN_DUCK;
  if (phase % 30 < 12) cmd.buttons |= IN_ATTACK;
  if (phase === 200 || phase === 201) cmd.buttons |= IN_ATTACK2;
  if (phase === 220) cmd.buttons |= IN_RELOAD;
  if (phase === 120) cmd.weaponSelect = 1 + ((tick / 120) % 3);
  return cmd;
}

const CLASSES = [TF_CLASS_SOLDIER, TF_CLASS_DEMOMAN, TF_CLASS_ENGINEER, TF_CLASS_PYRO];

function populate(world: GameWorld, n: number): void {
  for (let i = 0; i < n; i++) {
    const p = world.addPlayer(`p${i}`, { bot: i % 2 === 1 });
    p.requestTeam(i % 2 === 0 ? TF_TEAM_RED : TF_TEAM_BLUE);
    p.requestClass(CLASSES[i % CLASSES.length]);
  }
}

function step(world: GameWorld, numbers: Map<number, number>): void {
  const tick = world.tickCount + 1;
  world.forEachPlayer((p) => {
    const cmd = scriptedCmd(p.id, tick);
    const n = (numbers.get(p.id) ?? 0) + 1;
    numbers.set(p.id, n);
    cmd.commandNumber = n;
    cmd.tickCount = tick;
    cmd.randomSeed = (n * 2654435761 + p.id) >>> 1;
    world.queueCommand(p.id, cmd);
  });
  world.step();
  world.drainEvents();
}

/** The world's whole state as the codec sees it (both worlds' roots name the same paths). */
function stateOf(world: GameWorld): EncodedGraph {
  const cp = captureWorld(world, null, checkpointCatalog());
  return cp.graph;
}

/** The first difference between two encodings, readably. */
export function firstDifference(a: EncodedGraph, b: EncodedGraph): string | null {
  if (JSON.stringify(a.classes) !== JSON.stringify(b.classes)) return 'classes differ';
  if (JSON.stringify(a.shapes) !== JSON.stringify(b.shapes)) {
    for (let i = 0; i < Math.max(a.shapes.length, b.shapes.length); i++) {
      if (JSON.stringify(a.shapes[i]) !== JSON.stringify(b.shapes[i])) {
        return `shape ${i}: ${JSON.stringify(a.shapes[i])} vs ${JSON.stringify(b.shapes[i])}`;
      }
    }
  }
  const n = Math.max(a.objs.length, b.objs.length);
  for (let i = 0; i < n; i++) {
    const ea = JSON.stringify(a.objs[i]);
    const eb = JSON.stringify(b.objs[i]);
    if (ea === eb) continue;
    const e = a.objs[i] ?? b.objs[i];
    if (e && e[0] === 0) {
      const shape = a.shapes[e[1] as number];
      const cls = a.classes[shape[0]];
      const va = a.objs[i] as unknown[];
      const vb = (b.objs[i] ?? []) as unknown[];
      for (let k = 1; k < shape.length; k++) {
        if (JSON.stringify(va[k + 1]) !== JSON.stringify(vb[k + 1])) {
          return `object ${i} (${cls}).${shape[k]}: ${JSON.stringify(va[k + 1])?.slice(0, 200)} vs ${JSON.stringify(vb[k + 1])?.slice(0, 200)}`;
        }
      }
    }
    return `object ${i}: ${ea?.slice(0, 300)} vs ${eb?.slice(0, 300)}`;
  }
  if (JSON.stringify(a.closures) !== JSON.stringify(b.closures)) return 'closures differ';
  if (JSON.stringify(a.root) !== JSON.stringify(b.root)) return 'roots differ';
  return null;
}

describe('world checkpoints', () => {
  it('a synthetic room mid-fight restores into a fresh world and runs on identically', () => {
    const a = roomWorld(11);
    populate(a, 8);
    const na = new Map<number, number>();
    for (let i = 0; i < 900; i++) step(a, na);

    const cp = captureWorld(a, { numbers: [...na] }, checkpointCatalog());
    const json = JSON.stringify(cp);
    const b = roomWorld(11);
    const { extra, report } = restoreWorld(b, JSON.parse(json), checkpointCatalog(), { numbers: [] as Array<[number, number]> });
    expect(report.unresolvedClosures.join("\n")).toBe("");
    const nb = new Map(extra.numbers);
    // Right after the restore the two are already the same…
    expect(firstDifference(stateOf(a), stateOf(b))).toBeNull();
    // …and stay so.
    for (let i = 0; i < 600; i++) {
      step(a, na);
      step(b, nb);
    }
    expect(firstDifference(stateOf(a), stateOf(b))).toBeNull();
    expect(a.tickCount).toBe(b.tickCount);
  });

  it('names statics by path from each world’s own roots', () => {
    const a = roomWorld(3);
    const idx = new RootIndex([['collision', a.mapCollision]]);
    const g = encodeGraph({ c: a.mapCollision }, withRoots(checkpointCatalog(), idx));
    expect(g.root).toEqual(['r', 0]);
    expect(g.objs[0]).toEqual([0, 0, ['s', '@collision']]);
  });
});

// ─── A real match: ctf_2fort, TFBots, two scripted humans, the console ──────

describe.skipIf(!process.env.TF2_ROOT)('host checkpoints on ctf_2fort (TF2_ROOT)', () => {
  it('a match with TFBots restores mid-fight and runs on identically (bots, buildings, humans, cvars)', async () => {
    const { loadMap } = await import('../map-loader');
    const { propResolver } = await import('../../world/prop-collision');
    const { gameFileSystem, readMap } = await import('../../formats/tf2-root.test-support');
    const { navFor } = await import('../../bots/__fixtures__/maps');
    const { Tf2MatchHost } = await import('../../server/tf2-match-host');
    const { matchOptions } = await import('../../server/match.test-support');
    const { InputSender } = await import('../../client/net/input');
    const { packCheckpoint, unpackCheckpoint } = await import('./pack');

    const fs = gameFileSystem();
    // Two separate map loads: brush models move in each world's own collision.
    const mapA = loadMap(readMap('ctf_2fort'), { name: 'ctf_2fort', propCollision: propResolver(fs) });
    const mapB = loadMap(readMap('ctf_2fort'), { name: 'ctf_2fort', propCollision: propResolver(fs) });
    const nav = navFor('ctf_2fort').mesh;
    const options = matchOptions({ botCount: 10, maxPlayers: 12, seed: 4242, botDifficulty: 'hard' });
    const a = new Tf2MatchHost({ ...options }, { map: mapA, nav, console: { kind: 'listen', ownerId: 1 } });
    // Every class on the field: buildings, stickies, rockets, syringes, flames, disguises.
    a.setBotClassPreference(TF_TEAM_RED, [TF_CLASS_ENGINEER, TF_CLASS_SOLDIER, 5, 2, 8]);
    a.setBotClassPreference(TF_TEAM_BLUE, [TF_CLASS_ENGINEER, TF_CLASS_DEMOMAN, TF_CLASS_PYRO, 6, 1]);
    a.addPlayer(1, { name: 'Host', userId: 'u1' });
    a.addPlayer(2, { name: 'Friend', userId: 'u2' });
    a.onCommand(1, { kind: 'team', team: 'red' });
    a.onCommand(1, { kind: 'class', cls: 'engineer' });
    a.onCommand(2, { kind: 'team', team: 'blue' });
    a.onCommand(2, { kind: 'class', cls: 'demoman' });
    a.onCommand(1, { kind: 'extra', command: 'sv_cheats', args: ['1'] });
    a.onCommand(1, { kind: 'extra', command: 'sv_gravity', args: ['650'] });

    const senders = new Map([
      [1, new InputSender()],
      [2, new InputSender()],
    ]);
    const drive = (h: InstanceType<typeof Tf2MatchHost>, s: Map<number, InstanceType<typeof InputSender>>) => {
      const tick = h.world.tickCount + 1;
      for (const [id, sender] of s) {
        const ent = h.playerOf(id)!.id;
        sender.createCommand(tick, (c) => Object.assign(c, scriptedCmd(ent, tick), { commandNumber: c.commandNumber, tickCount: tick }));
        h.onInput(id, sender.packet(0, 0)!);
      }
      h.tick();
      h.drainOutgoing();
    };
    // A minute and a bit of play: spawn waves, fights, buildings, flags.
    for (let i = 0; i < 4500; i++) drive(a, senders);
    // The engineer's buildings, the demoman's stickies (cheats on: `build` works as in the menu).
    a.onCommand(1, { kind: 'extra', command: 'build', args: [2, 0] });
    for (let i = 0; i < 400; i++) drive(a, senders);

    const catalog = checkpointCatalog();
    const t0 = performance.now();
    const cp = a.checkpoint(catalog);
    const packed = await packCheckpoint(cp);
    const tPack = performance.now() - t0;
    const restored = await unpackCheckpoint(packed);
    const t1 = performance.now();
    const b = Tf2MatchHost.restore({ ...options }, { map: mapB, nav, console: { kind: 'listen', ownerId: 1 } }, restored, catalog);
    const tRestore = performance.now() - t1;
    const classes = new Set<string>();
    a.world.forEachEntity((e) => classes.add(e.classname));
    // TF2_CHECKPOINT_REPORT=1 prints the measurement (docs/tf2-game.md quotes it).
    if (process.env.TF2_CHECKPOINT_REPORT) process.stdout.write(
      `ctf_2fort checkpoint: ${a.world.players().length} players, ${[...classes].length} classnames, ${cp.graph.objs.length} objects; ` +
        `JSON ${(JSON.stringify(cp).length / 1024).toFixed(0)} KB, packed ${(packed.byteLength / 1024).toFixed(0)} KB; ` +
        `capture+pack ${tPack.toFixed(0)} ms, restore ${tRestore.toFixed(0)} ms\n`,
    );
    expect(Tf2MatchHost.checkpointSeats(cp).map((s) => s.userId)).toEqual(['u1', 'u2']);
    // A real fight is in the checkpoint: buildings and projectiles in flight.
    expect([...classes].some((c) => c.startsWith('obj_'))).toBe(true);
    expect([...classes].some((c) => c.startsWith('tf_projectile'))).toBe(true);

    // The senders' command numbers carry on (the restored clients start over at any number above 0).
    const sendersB = new Map([...senders].map(([id, s]) => [id, new InputSender(s.lastCommandNumber)] as const));
    // (Compared after each tick: the restored console tells its rejoining clients the replicated cvars.)
    for (let i = 0; i < 1500; i++) {
      drive(a, senders);
      drive(b, sendersB);
      if (i === 0 || i % 500 === 499) expect(firstDifference(a.checkpoint(catalog).graph, b.checkpoint(catalog).graph)).toBeNull();
    }
    expect(b.serverConsole.value('sv_gravity')).toBe('650');
    expect(b.world.gravity).toBe(650);
  }, 400_000);
});
