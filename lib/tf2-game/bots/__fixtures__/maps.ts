/**
 * TEST SUPPORT ONLY (Node): the nine hosted TF2 maps from TF2_ROOT with
 * their static prop collision, nav meshes (generated once per map per test
 * process), worlds with the map's mode, single-bot path walks and headless
 * bot matches. Used by the bots' map suites.
 */
import { gameFileSystem, readMap } from '../../formats/tf2-root.test-support';
import { loadMap, type LoadedMap } from '../../sim/map-loader';
import { propResolver } from '../../world/prop-collision';
import { GameWorld } from '../../sim/world';
import { gameModeForMap, registerAllSimModules } from '../../sim/register-all';
import { objectives, teamMayCapturePoint } from '../../sim/entities';
import { Tf2MatchHost } from '../../server/tf2-match-host';
import { matchOptions } from '../../server/match.test-support';
import { emptyUserCmd, type UserCmd } from '../../core/types';
import { encodeInputPacket } from '../../net/usercmd-codec';
import {
  IN_DUCK,
  IN_JUMP,
  TF_CLASS_COUNT,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  enemyTeam,
} from '../../core/constants';
import type { Vec3 } from '../../core/vec';
import type { Player } from '../../sim/player';
import type { Tf2Mode } from '../../data/maps';
import type { BotDifficulty } from '../../net/events';
import { NavGenerator, type NavGenStats } from '../nav/generate';
import type { NavMesh } from '../nav/nav-mesh';
import {
  NavBlockState,
  NavPathfinder,
  PathFollower,
  applyMoveIntent,
  newMoveIntent,
} from '../path';
import { provideNavMesh } from '../brain/manager';
import { TFBotBrain } from '../brain/tf-bot-brain';

export const TF2_ROOT = process.env.TF2_ROOT;

export const BOT_MAPS = [
  'ctf_2fort',
  'ctf_turbine',
  'cp_dustbowl',
  'cp_granary',
  'cp_badlands',
  'koth_viaduct',
  'koth_harvest_final',
  'pl_badwater',
  'pl_upward',
] as const;

const maps = new Map<string, LoadedMap>();
const navs = new Map<string, { mesh: NavMesh; stats: NavGenStats; ms: number }>();

/** The map with static prop collision (cached; worlds share it, as matches on one map do). */
export function loadBotMap(name: string): LoadedMap {
  let m = maps.get(name);
  if (!m) {
    m = loadMap(readMap(name), { name, propCollision: propResolver(gameFileSystem()) });
    maps.set(name, m);
  }
  return m;
}

/** The map's nav mesh, generated once (with its stats and wall time). */
export function navFor(name: string): { mesh: NavMesh; stats: NavGenStats; ms: number } {
  let n = navs.get(name);
  if (!n) {
    const map = loadBotMap(name);
    const t0 = performance.now();
    const g = new NavGenerator(map.bsp, map.collision);
    const mesh = g.run();
    n = { mesh, stats: g.stats, ms: performance.now() - t0 };
    navs.set(name, n);
  }
  return n;
}

export const modeOf = (name: string): Tf2Mode => name.split('_')[0] as Tf2Mode;

/** A server world on the map with its game mode and nav mesh. */
export function botWorld(name: string, seed = 11): GameWorld {
  registerAllSimModules();
  const map = loadBotMap(name);
  const world = new GameWorld({ map, options: { seed, isServer: true, lagCompensation: true } });
  const mode = gameModeForMap(world, name, modeOf(name));
  if (mode) world.setMode(mode);
  provideNavMesh(world, navFor(name).mesh);
  return world;
}

/** What a team plays for right now: positions to reach (the flag / capture zones / points / the cart). */
export function objectiveTargets(
  world: GameWorld,
  team: number,
): Array<{ label: string; pos: Vec3 }> {
  const o = objectives(world);
  const out: Array<{ label: string; pos: Vec3 }> = [];
  for (const f of o.flags)
    if (!f.removed && !f.disabled) out.push({ label: `flag ${f.team}`, pos: { ...f.origin } });
  for (const z of o.zones) {
    if (z.removed || z.disabled || (z.team !== team && z.team !== 0)) continue;
    const c = z.center({ x: 0, y: 0, z: 0 });
    out.push({
      label: `capture zone ${z.team}`,
      pos: { x: c.x, y: c.y, z: z.origin.z + z.mins.z },
    });
  }
  for (const w of o.watchers)
    if (w.train && !w.train.removed) out.push({ label: 'cart', pos: { ...w.train.origin } });
  if (o.watchers.length === 0) {
    for (const area of o.areas) {
      const pt = area.point;
      if (!pt || pt.removed || !pt.inMiniRound || !area.isActive()) continue;
      const mayCap =
        o.isKoth ||
        teamMayCapturePoint(world, team, pt.pointIndex) ||
        teamMayCapturePoint(world, enemyTeam(team), pt.pointIndex);
      if (!mayCap) continue;
      const c = area.worldSpaceCenter({ x: 0, y: 0, z: 0 });
      out.push({
        label: `point ${pt.pointIndex} (${pt.targetname})`,
        pos: { x: c.x, y: c.y, z: area.origin.z + area.mins.z },
      });
    }
  }
  return out;
}

export interface WalkResult {
  reached: boolean;
  seconds: number;
  closest: number;
}

/**
 * Respawns `p` at its team's spawn and walks it to `goal` with the path
 * follower (commands through playerMove, like a bot), within `budget`
 * seconds of game time; reached when within 64 units (z counts half).
 */
export function walkTo(world: GameWorld, p: Player, goal: Vec3, budget: number): WalkResult {
  const mesh = navFor(world.map!.name).mesh;
  const host = { pathfinder: new NavPathfinder(mesh, world, new NavBlockState(world, mesh)) };
  if (p.alive) p.commitSuicide();
  world.rules.respawnNow(p, true);
  const f = new PathFollower();
  const it = newMoveIntent();
  const cmd: UserCmd = emptyUserCmd();
  let closest = Infinity;
  const ticks = Math.ceil(budget / world.frametime);
  for (let t = 0; t < ticks; t++) {
    if (!p.alive) world.rules.respawnNow(p, true);
    f.setGoal(host, world, p.origin, goal, p.team);
    f.update(host, world, p.origin, p.velocity, p.move.flags, p.move.waterLevel, it);
    cmd.buttons = 0;
    cmd.commandNumber++;
    cmd.viewAngles.y = (Math.atan2(it.look.y - p.origin.y, it.look.x - p.origin.x) * 180) / Math.PI;
    applyMoveIntent(it, cmd.viewAngles.y, cmd, IN_JUMP, IN_DUCK);
    world.queueCommand(p.id, cmd);
    world.step();
    const d = Math.hypot(p.origin.x - goal.x, p.origin.y - goal.y, (p.origin.z - goal.z) * 0.5);
    if (d < closest) closest = d;
    if (d < 64) return { reached: true, seconds: t * world.frametime, closest };
  }
  return { reached: false, seconds: budget, closest };
}

export interface MatchResult {
  map: string;
  ticks: number;
  /** Mean / worst host tick in ms (wall clock of this process). */
  msPerTick: number;
  worstTickMs: number;
  /** Mean ms per tick inside the bots' think(). */
  brainMsPerTick: number;
  kills: number[];
  deaths: number[];
  captures: string[];
  flagEvents: Record<string, number>;
  cartProgress: number;
  teamScores: [number, number];
  flagCaptures: [number, number];
  /** Units per minute each bot moved (after the first minute). */
  movedPerMinute: number[];
  nonFinite: number;
  classesPlayed: number[];
}

/** A headless bot match: `bots` TFBots on the map for `minutes` of game time, as fast as it runs. */
export function runBotMatch(
  name: string,
  opts: {
    minutes: number;
    bots?: number;
    maxPlayers?: number;
    seed?: number;
    difficulty?: BotDifficulty;
    scriptedHuman?: boolean;
  } = { minutes: 5 },
): MatchResult & { host: Tf2MatchHost; human: Player | null } {
  const world = botWorld(name, opts.seed);
  const brains = new Map<number, TFBotBrain>();
  let brainMs = 0;
  const bots = opts.bots ?? 24;
  const host = new Tf2MatchHost(
    matchOptions({
      map: name,
      mode: modeOf(name),
      maxPlayers: opts.maxPlayers ?? 24,
      botCount: bots,
      botDifficulty: opts.difficulty ?? 'normal',
    }),
    {
      world,
      botBrain: (d, p) => {
        const b = new TFBotBrain(p, { difficulty: d });
        brains.set(p.id, b);
        return {
          think: (w, pl) => {
            const t0 = performance.now();
            const c = b.think(w, pl);
            brainMs += performance.now() - t0;
            return c;
          },
        };
      },
    },
  );
  // An offline-style human: joins through the host (team and class commands) and sends
  // input packets like a client; a TFBotBrain plays the script.
  const HUMAN_ID = 1001;
  let human: Player | null = null;
  let humanBrain: TFBotBrain | null = null;
  let humanCmd = 0;
  if (opts.scriptedHuman) {
    host.addPlayer(HUMAN_ID, { name: 'Scripted Human' });
    host.onCommand(HUMAN_ID, { kind: 'team', team: 'red' });
    host.onCommand(HUMAN_ID, { kind: 'class', cls: 'soldier' });
    human = host.playerOf(HUMAN_ID);
    if (human) humanBrain = new TFBotBrain(human, { difficulty: 'normal' });
  }
  const kills = new Array<number>(TF_CLASS_COUNT).fill(0);
  const deaths = new Array<number>(TF_CLASS_COUNT).fill(0);
  const captures: string[] = [];
  const flagEvents: Record<string, number> = {};
  const classesPlayed = new Array<number>(TF_CLASS_COUNT).fill(0);
  const drain = world.drainEvents.bind(world);
  world.drainEvents = () => {
    const events = drain();
    for (const e of events) {
      if (e.type === 'death') {
        deaths[e.victimClass]++;
        const a = world.player(e.attacker);
        if (a && e.attacker !== e.victim && a.team !== world.player(e.victim)?.team)
          kills[a.playerClass]++;
      } else if (e.type === 'capture' && e.kind === 'captured')
        captures.push(`${e.pointName}→${e.team}@${(world.curtime / 60).toFixed(1)}m`);
      else if (e.type === 'flag') flagEvents[e.kind] = (flagEvents[e.kind] ?? 0) + 1;
      else if (e.type === 'spawn') classesPlayed[e.cls]++;
    }
    return events;
  };
  const ticks = Math.round((opts.minutes * 60) / world.frametime);
  const minuteTicks = Math.round(60 / world.frametime);
  const movedAt1 = new Map<number, number>();
  let nonFinite = 0;
  let cartProgress = 0;
  let worst = 0;
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    if (human && humanBrain) {
      const c = { ...humanBrain.think(world, human) };
      c.viewAngles = { ...c.viewAngles };
      c.commandNumber = ++humanCmd;
      c.tickCount = world.tickCount;
      host.onInput(HUMAN_ID, encodeInputPacket({ ackTick: 0, interpTicks: 2, cmds: [c] }));
    }
    const a = performance.now();
    host.tick();
    const dt = performance.now() - a;
    if (t > 0 && dt > worst) worst = dt;
    for (const w of objectives(world).watchers)
      if (w.totalProgress > cartProgress) cartProgress = w.totalProgress;
    if (t === minuteTicks) for (const [id, b] of brains) movedAt1.set(id, b.stats.distanceMoved);
    if (t % 66 === 0) {
      world.forEachPlayer((p) => {
        if (
          !Number.isFinite(
            p.origin.x + p.origin.y + p.origin.z + p.velocity.x + p.velocity.y + p.velocity.z,
          )
        )
          nonFinite++;
      });
    }
  }
  const elapsed = performance.now() - t0;
  const span = Math.max(1, opts.minutes - 1);
  const movedPerMinute = [...brains].map(
    ([id, b]) => (b.stats.distanceMoved - (movedAt1.get(id) ?? 0)) / span,
  );
  return {
    map: name,
    host,
    human,
    ticks,
    msPerTick: elapsed / ticks,
    worstTickMs: worst,
    brainMsPerTick: brainMs / ticks,
    kills,
    deaths,
    captures,
    flagEvents,
    cartProgress,
    teamScores: [world.rules.teamScores[TF_TEAM_RED], world.rules.teamScores[TF_TEAM_BLUE]],
    flagCaptures: [world.rules.flagCaptures[TF_TEAM_RED], world.rules.flagCaptures[TF_TEAM_BLUE]],
    movedPerMinute,
    nonFinite,
    classesPlayed,
  };
}
