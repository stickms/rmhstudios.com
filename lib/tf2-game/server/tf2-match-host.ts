/**
 * `Tf2MatchHost` — the real game behind the `MatchHost` seam (./match-host.ts):
 * a GameWorld on a loaded map, humans and bots in it, user commands in, and
 * per-client snapshots and reliable event batches out (lib/tf2-game/net/).
 *
 * The frame (one `tick()`, 15 ms of game time), in the SDK's order:
 *   1. bots think (`BotBrain`) and queue a command each;
 *   2. each human's queued commands go to the world, at most what the
 *      player's command budget allows (one per tick, banked up to 8 —
 *      the role of sv_maxusrcmdprocessticks: a burst after a stall catches up,
 *      a client that sends faster than real time cannot speed up). A human
 *      with nothing queued is NOT simulated this tick (the world would repeat
 *      the last command; Source leaves a client with no usercmds where it
 *      is), so a late packet never moves the player twice and prediction
 *      stays exact;
 *   3. `world.step()`;
 *   4. events are encoded once and routed per client (recipients, team), the
 *      cosmetic ones into the next snapshot, the rest into this tick's
 *      reliable packet;
 *   5. every `snapshotInterval` ticks (2 → 33 Hz, TF2's cl_updaterate class
 *      of rate for a 66-tick server) one capture of the world is delta-encoded
 *      for each client against the snapshot it last acknowledged.
 *
 * A reliable packet that defines new strings is always queued before the
 * snapshot that uses them (the hub relays one socket's packets in order).
 *
 * Joining follows TF2: a player starts unassigned (roaming observer) until a
 * `team` command, then picks a class; `autoTeam`/`autoClass` skip the menus.
 * Bots fill the server to `botCount` (tf_bot_quota_mode fill): a human who
 * joins a full server replaces a bot; a bot comes back when they leave.
 *
 * Environment-agnostic: the hub's match worker builds it through
 * `createTf2Match` (./create-match.ts, object storage), the browser listen
 * server through `createTf2MatchHost` with an HTTP loader, tests with a local
 * BSP or a synthetic world.
 */

import {
  CLASS_NAMES,
  TEAM_SPECTATOR,
  TEAM_UNASSIGNED,
  TF_CLASS_COUNT,
  TF_TEAM_BLUE,
  TF_TEAM_RED,
  TICK_INTERVAL,
} from '../core/constants';
import { emptyUserCmd, type UserCmd } from '../core/types';
import { copy, type Vec3 } from '../core/vec';
import {
  mapIndexSchema,
  mapManifestSchema,
  parseHullsBin,
  type HullTable,
  type MapManifest,
} from '../assets/map-manifest';
import { findTf2Map, type Tf2Mode } from '../data/maps';
import { loadMap, type LoadedMap } from '../sim/map-loader';
import { OBS_MODE_ROAMING } from '../sim/movement-types';
import { calcPlayerScore, type Player } from '../sim/player';
import { GameWorld } from '../sim/world';
import { registerAllSimModules, gameModeForMap } from '../sim/register-all';
import type { SimEvent } from '../sim/events';
import type { PropCollisionModel } from '../world/prop-collision';
import { BitWriter } from '../net/bitbuf';
import type { BotDifficulty, ClassChoice, TeamChoice } from '../net/events';
import { eventIsCosmetic, eventVisibleTo, writeEvent, type StringRefs } from '../net/event-codec';
import { dispatchExtraCommand } from '../net/extra-commands';
import { Tf2ServerConsole, type ServerConsolePolicy, type ServerConsoleState } from '../console/tf2-server';
import type { GraphCatalog } from '../sim/checkpoint/catalog';
import { captureWorld, CheckpointError, restoreWorld, type WorldCheckpoint } from '../sim/checkpoint/world-state';
import { applyLoadoutCommand } from '../sim/items/command';
import { randomBotLoadouts } from '../sim/items/bots';
import { ReliableWriter, type ScoreRow } from '../net/protocol';
import { getBotManager, provideNavMesh } from '../bots/brain/manager';
import { TFBotBrain } from '../bots/brain/tf-bot-brain';
import { decodeNavMesh } from '../bots/nav/serialize';
import type { NavMesh } from '../bots/nav/nav-mesh';
import {
  ClientSnapshotState,
  SnapshotEncoder,
  WorldCapture,
  type CapturedFrame,
  type EncodedEvent,
} from '../net/snapshot';
import { ClientStringKnowledge, ServerStringTable } from '../net/string-table';
import { decodeInputPacket } from '../net/usercmd-codec';
import { isOtherGame, matchGameFactory } from './game-registry';
import type {
  MatchCommand,
  MatchHost,
  MatchOptions,
  OutgoingPacket,
  PlayerInfo,
  PlayerSummary,
  RoomSummary,
} from './match-host';

// ─── Tunables ───────────────────────────────────────────────────────────────

/** Ticks between snapshots: 2 → 33.3 Hz. */
export const SNAPSHOT_INTERVAL_TICKS = 2;
/** Commands a player may bank while idle or stalled (sv_maxusrcmdprocessticks-like). */
export const COMMAND_BUDGET_MAX = 8;
/** Queued commands beyond this are dropped oldest-first (a client running fast). */
export const COMMAND_QUEUE_MAX = 16;
/** Scoreboard rows go out this often (ticks). */
export const SCORES_INTERVAL_TICKS = 66;
/** tf_voice_command_suspension-like spam guard, seconds. */
export const VOICE_COOLDOWN = 1.0;

// ─── Bots ───────────────────────────────────────────────────────────────────

/** Drives a bot: one command per tick. The bots module supplies real ones. */
export interface BotBrain {
  think(world: GameWorld, player: Player): UserCmd;
}

/** Stands where it spawned, looking ahead. */
export class StandStillBrain implements BotBrain {
  think(_world: GameWorld, player: Player): UserCmd {
    const cmd = emptyUserCmd();
    copy(cmd.viewAngles, player.eyeAngles);
    return cmd;
  }
}

export type BotBrainFactory = (difficulty: BotDifficulty, player: Player) => BotBrain;

/** TFBots (lib/tf2-game/bots): the default for every host. */
const defaultBrain: BotBrainFactory = (difficulty, player) =>
  new TFBotBrain(player, { difficulty });

/** TF2's bot name list (tf_bot_names), a few of them. */
const BOT_NAMES = [
  'A Professional With Standards',
  'AimBot',
  'AmNot',
  'Archimedes!',
  'BeepBeepBoop',
  'Big Mean Muther Hubbard',
  'Black Market Business',
  'Botsy McBotsface',
  'Chucklenuts',
  'Crazed Gunman',
  'CreditToTeam',
  'Delicious Cake',
  'Divide by Zero',
  'Dog',
  'Force of Nature',
  'Freakin Unbelievable',
  'Gentlemanne of Leisure',
  'GENTLE MANNE of LEISURE',
  'Hat-Wearing MAN',
  'Herr Doktor',
  'H@XX0RZ',
  'Hostage',
  'Kill Me',
  'Mann Co. Supply Crate Key',
  'Me',
  'Mega Baboon',
  'Ninja',
  'Numnutz',
  'Pow!',
];

/** voicemenu <menu> <item> (scripts/voicecommands): the line each slot says. */
export const VOICE_MENU: readonly (readonly string[])[] = [
  ['Medic!', 'Thanks!', 'Go! Go! Go!', 'Move Up!', 'Go Left', 'Go Right', 'Yes', 'No'],
  [
    'Incoming',
    'Spy!',
    'Sentry Ahead!',
    'Teleporter Here',
    'Dispenser Here',
    'Sentry Here',
    'Activate Charge!',
    'MEDIC: ÜberCharge Ready',
  ],
  ['Help!', 'Battle Cry', 'Cheers', 'Jeers', 'Positive', 'Negative', 'Nice Shot', 'Good Job'],
];

// ─── Map packages ───────────────────────────────────────────────────────────

/**
 * Reads files of a game's asset tree (`tf2-game/…`): object storage in the
 * hub worker, HTTP in the browser, the local disk in tests. Paths are
 * relative to the game root (`maps/index.json`). Null = missing.
 */
export interface GameObjectLoader {
  get(path: string): Promise<Uint8Array | null>;
}

const textOf = (b: Uint8Array): string => new TextDecoder().decode(b);

/** Collision models for the manifest's props from the hulls.bin table (bounds = the hulls' box). */
export function hullResolver(
  manifest: MapManifest,
  table: HullTable | null,
): (model: string) => PropCollisionModel | null {
  const byModel = new Map<string, PropCollisionModel | null>();
  const props = new Map<string, MapManifest['props'][string]>();
  for (const [k, v] of Object.entries(manifest.props)) props.set(k.toLowerCase(), v);
  return (model: string) => {
    const key = model.toLowerCase();
    const hit = byModel.get(key);
    if (hit !== undefined) return hit;
    const p = props.get(key);
    let out: PropCollisionModel | null = null;
    if (p && p.hull !== undefined && table && table[p.hull] && table[p.hull].length > 0) {
      const hulls = table[p.hull];
      const mins = { x: Infinity, y: Infinity, z: Infinity };
      const maxs = { x: -Infinity, y: -Infinity, z: -Infinity };
      for (const c of hulls) {
        for (let i = 0; i + 2 < c.length; i += 3) {
          mins.x = Math.min(mins.x, c[i]);
          mins.y = Math.min(mins.y, c[i + 1]);
          mins.z = Math.min(mins.z, c[i + 2]);
          maxs.x = Math.max(maxs.x, c[i]);
          maxs.y = Math.max(maxs.y, c[i + 1]);
          maxs.z = Math.max(maxs.z, c[i + 2]);
        }
      }
      if (Number.isFinite(mins.x)) out = { hulls, mins, maxs, surfaceProp: '', contents: 0 };
    }
    byModel.set(key, out);
    return out;
  };
}

/**
 * Loads a map package (assets/map-manifest.ts, v1): the index, the map's
 * manifest, its stripped BSP and prop hulls, into a LoadedMap.
 */
export async function loadMapPackage(loader: GameObjectLoader, map: string): Promise<LoadedMap> {
  const indexBytes = await loader.get('maps/index.json');
  if (!indexBytes) throw new Error('map index missing (maps/index.json)');
  const index = mapIndexSchema.parse(JSON.parse(textOf(indexBytes)));
  const entry = index.maps[map];
  if (!entry) throw new Error(`map "${map}" is not published`);
  const manifestBytes = await loader.get(entry.manifest);
  if (!manifestBytes) throw new Error(`map manifest missing (${entry.manifest})`);
  const manifest = mapManifestSchema.parse(JSON.parse(textOf(manifestBytes)));
  const [bsp, hullBytes] = await Promise.all([
    loader.get(manifest.bsp),
    manifest.hulls ? loader.get(manifest.hulls) : Promise.resolve(null),
  ]);
  if (!bsp) throw new Error(`map BSP missing (${manifest.bsp})`);
  const table = hullBytes ? parseHullsBin(hullBytes) : null;
  const loaded: PackagedMap = loadMap(bsp, {
    name: map,
    propCollision: hullResolver(manifest, table),
  });
  // The bots' navigation mesh rides along (an unreadable one is generated in the background instead).
  if (manifest.nav) {
    const navBytes = await loader.get(manifest.nav).catch(() => null);
    if (navBytes) {
      try {
        loaded.navMesh = decodeNavMesh(navBytes);
      } catch {
        loaded.navMesh = null;
      }
    }
  }
  return loaded;
}

/** A LoadedMap from a package, with the package's nav mesh when it has one. */
export type PackagedMap = LoadedMap & { navMesh?: NavMesh | null };

/**
 * The map package's navigation mesh (`nav`, maps/<sha>.nav.bin), or null
 * when the package has none or it is unreadable — the bots then generate one
 * in the background (lib/tf2-game/bots/brain/manager.ts).
 */
export async function loadMapNav(loader: GameObjectLoader, map: string): Promise<NavMesh | null> {
  try {
    const indexBytes = await loader.get('maps/index.json');
    if (!indexBytes) return null;
    const entry = mapIndexSchema.parse(JSON.parse(textOf(indexBytes))).maps[map];
    if (!entry) return null;
    const manifestBytes = await loader.get(entry.manifest);
    if (!manifestBytes) return null;
    const manifest = mapManifestSchema.parse(JSON.parse(textOf(manifestBytes)));
    if (!manifest.nav) return null;
    const bytes = await loader.get(manifest.nav);
    return bytes ? decodeNavMesh(bytes) : null;
  } catch {
    return null;
  }
}

// ─── The host ───────────────────────────────────────────────────────────────

export interface Tf2MatchHostOptions {
  /** A loaded map. Ignored when `world` is given. */
  map?: LoadedMap | null;
  /** A prebuilt world (tests with synthetic collision). */
  world?: GameWorld;
  /** Bot brains (default: TFBotBrain at the match's botDifficulty). */
  botBrain?: BotBrainFactory;
  /** The navigation mesh for the map (else the bots generate one, a slice per tick). */
  nav?: NavMesh | null;
  /** Classes the bots of a team play, in order (an offline player's line-up); TF_CLASS_* ids. */
  botClasses?: Partial<Record<number, number[]>>;
  /** Put joining humans on the smaller team at once (skip the team menu). */
  autoTeam?: boolean;
  /** …and give them a random class (skip the class menu). */
  autoClass?: boolean;
  snapshotInterval?: number;
  /** Snapshot byte cap (default SNAPSHOT_MAX_BYTES). */
  snapshotMaxBytes?: number;
  /** Diagnostics. */
  log?: (message: string, data?: Record<string, unknown>) => void;
  /**
   * Who administers the developer console (console/tf2-server.ts). Default: a dedicated room —
   * nobody, `sv_cheats` locked to 0. The listen server passes `{ kind: 'listen', ownerId }`.
   */
  console?: ServerConsolePolicy;
  /**
   * Loads another map for a level change (`changelevel`): the map and its nav mesh (null: the bots
   * generate one). `createTf2MatchHost` fills it from its loaders; without it the map cannot change.
   */
  loadLevel?: (map: string) => Promise<{ map: LoadedMap; nav: NavMesh | null }>;
  /** host_timescale (a listen server's cheat): the runner paces its ticks this much faster. */
  setTimescale?: (scale: number) => void;
}

export interface Tf2MatchDeps extends Tf2MatchHostOptions {
  /** Loads the map when neither `world` nor `map` is given. */
  loadMap?: (map: string) => Promise<LoadedMap>;
  /** Loads the map package's nav mesh (null = none: the bots generate one). */
  loadNav?: (map: string) => Promise<NavMesh | null>;
}

/** Builds a host: loads the map (unless given one), registers the sim modules, adds the bots. */
export async function createTf2MatchHost(
  opts: MatchOptions,
  deps: Tf2MatchDeps = {},
): Promise<Tf2MatchHost> {
  // Another game on the engine (MatchOptions.game): its registered host (./game-registry.ts).
  if (isOtherGame(opts)) return matchGameFactory(opts.game!).create(opts, deps);
  registerAllSimModules();
  let map = deps.map ?? null;
  if (!deps.world && !map) {
    if (!deps.loadMap) throw new Error('no map loader');
    map = await deps.loadMap(opts.map);
  }
  let nav = deps.nav ?? (map as PackagedMap | null)?.navMesh ?? null;
  if (!nav && deps.loadNav) nav = await deps.loadNav(opts.map);
  return new Tf2MatchHost(opts, { ...deps, map, nav, loadLevel: deps.loadLevel ?? levelLoader(deps) });
}

/** A level loader from a host's map and nav loaders (undefined when it has no map loader). */
export function levelLoader(deps: Pick<Tf2MatchDeps, 'loadMap' | 'loadNav'>): Tf2MatchHostOptions['loadLevel'] {
  const { loadMap: load, loadNav } = deps;
  if (!load) return undefined;
  return async (name) => {
    const map = await load(name);
    let nav = (map as PackagedMap).navMesh ?? null;
    if (!nav && loadNav) nav = await loadNav(name);
    return { map, nav };
  };
}

/** What a host checkpoint carries beside the world (host migration): seats, bots, the console. */
interface HostCheckpointExtra {
  options: MatchOptions;
  humans: Array<{ hubId: number; player: Player; lastVoiceAt: number; rtt: number }>;
  bots: Array<{ player: Player; brain: BotBrain; commandNumber: number }>;
  nextBotName: number;
  console: ServerConsoleState;
}

/** A human's seat as a checkpoint knows it (the successor's host session restores seats from these). */
export interface CheckpointSeat {
  hubId: number;
  entity: number;
  name: string;
  userId?: string;
}

interface HumanClient {
  hubId: number;
  player: Player;
  snap: ClientSnapshotState;
  strings: ClientStringKnowledge;
  /** Decoded, not yet run. */
  queue: UserCmd[];
  /** Highest command number queued. */
  lastQueued: number;
  /** Highest command number given to the world (the snapshot's ackCmd). */
  lastRun: number;
  budget: number;
  reliable: EncodedEvent[];
  needsHello: boolean;
  needsRoster: boolean;
  lastVoiceAt: number;
  /** Smoothed round trip, seconds. */
  rtt: number;
  inputPackets: number;
  badPackets: number;
}

interface BotClient {
  player: Player;
  brain: BotBrain;
  commandNumber: number;
}

/** Per-client traffic counters (tests, diagnostics). */
export interface ClientNetStats {
  snapshotBytes: number;
  snapshots: number;
  fullSnapshots: number;
  reliableBytes: number;
  reliablePackets: number;
  maxSnapshotBytes: number;
}

const SKIP_COMMAND = (): void => {};

export class Tf2MatchHost implements MatchHost {
  /** The match's world (replaced by a level change). */
  world: GameWorld;
  map: LoadedMap | null;
  readonly options: MatchOptions;
  protected readonly opts: Tf2MatchHostOptions;
  private readonly humans = new Map<number, HumanClient>();
  private readonly byEntity = new Map<number, HumanClient>();
  private readonly bots = new Map<number, BotClient>();
  private readonly brainFactory: BotBrainFactory;
  private readonly strings = new ServerStringTable();
  private capture: WorldCapture;
  private readonly encoder: SnapshotEncoder;
  private readonly reliableWriter = new ReliableWriter();
  private readonly eventWriter = new BitWriter(256);
  private readonly refs: StringRefs;
  private readonly snapshotInterval: number;
  private outgoing: OutgoingPacket[] = [];
  /** Player info changes everyone must hear about (entity ids; negative = left). */
  private rosterChanges: Array<{ entity: number; present: boolean }> = [];
  private readonly frozen: Player[] = [];
  private nextBotName = 0;
  private disposed = false;
  readonly stats = new Map<number, ClientNetStats>();
  /** The developer console's server half (sv_cheats, tf_bot_add, noclip…). */
  readonly serverConsole: Tf2ServerConsole;
  /** A level change in progress (the map being loaded), or null. */
  private levelLoading: string | null = null;

  constructor(options: MatchOptions, opts: Tf2MatchHostOptions = {}) {
    registerAllSimModules();
    this.options = options;
    this.opts = opts;
    this.map = opts.world ? opts.world.map : (opts.map ?? null);
    this.world = opts.world ?? this.createWorld(this.map, 0, null);
    if (!opts.world) this.installMode(this.world, options.map);
    this.brainFactory = opts.botBrain ?? defaultBrain;
    if (opts.nav) provideNavMesh(this.world, opts.nav);
    if (opts.botClasses) {
      for (const [team, classes] of Object.entries(opts.botClasses)) {
        if (classes) this.setBotClassPreference(Number(team), classes);
      }
    }
    this.snapshotInterval = Math.max(
      1,
      Math.floor(opts.snapshotInterval ?? SNAPSHOT_INTERVAL_TICKS),
    );
    this.capture = new WorldCapture(this.map ? this.map.bsp : null);
    this.encoder = new SnapshotEncoder(this.strings);
    this.refs = { idFor: (s: string) => this.strings.idFor(s) };
    this.serverConsole = this.createConsole(this.consoleHost(), opts.console);
    this.rebalanceBots();
  }

  // ─── The game (hooks another game on the engine overrides: lib/csgo-game's CsMatchHost) ──────
  // Each is called from the constructor too, so an override must not read the subclass's fields.

  /** The world for a map (a level change passes the old world: its settings carry over). */
  protected createWorld(map: LoadedMap | null, startTick: number, prev: GameWorld | null): GameWorld {
    return new GameWorld({
      map,
      startTick,
      options: {
        seed: this.options.seed >>> 0 || 1,
        isServer: true,
        lagCompensation: true,
        ...(prev ? { friendlyFire: prev.options.friendlyFire, rules: { ...prev.rules.options } } : {}),
      },
    });
  }

  /** Installs the map's game mode (TF2: CTF, CP, KOTH, PL, Arena). */
  protected installMode(world: GameWorld, map: string): void {
    const mode = gameModeForMap(world, map, this.options.mode as Tf2Mode);
    if (mode) world.setMode(mode);
  }

  /** The developer console's server half. */
  protected createConsole(host: ReturnType<Tf2MatchHost['consoleHost']>, policy: ServerConsolePolicy | undefined): Tf2ServerConsole {
    return new Tf2ServerConsole(host, policy);
  }

  /** A published map for `changelevel` (name and mode), or null. */
  protected findLevel(map: string): { name: string; mode: string } | null {
    return findTf2Map(map);
  }

  /** What a new bot carries before it joins (TF2: hard and expert bots may hold unlocks). */
  protected decorateBot(player: Player, difficulty: BotDifficulty): void {
    if (difficulty === 'hard' || difficulty === 'expert') {
      const loadouts = randomBotLoadouts(this.world.random);
      loadouts?.forEach((slots, cls) => slots && player.setClassLoadout(cls, slots));
    }
  }

  /** A player's scoreboard points (TF2: CTFGameStats' formula). */
  protected playerScore(p: Player): number {
    return calcPlayerScore(p.stats);
  }

  /** The mode the `hello` names (TF2's map mode; another game's own). */
  protected helloMode(): string {
    return this.options.mode;
  }

  /** The match as the console sees it (console/tf2-server.ts ConsoleMatchHost). */
  protected consoleHost() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- the getter below must read the CURRENT world (a level change replaces it)
    const self = this;
    return {
      get world() {
        return self.world;
      },
      options: this.options,
      humans: () => [...this.humans.values()].map((c) => ({ hubId: c.hubId, player: c.player, rttMs: c.rtt * 1000 })),
      bots: () => [...this.bots.values()].map((b) => b.player).filter((p) => !p.removed),
      addBots: (count: number, difficulty: BotDifficulty, prefs?: { team?: TeamChoice; cls?: ClassChoice; name?: string }) =>
        this.addBots(count, difficulty, prefs),
      removeBot: (entity: number) => {
        if (!this.bots.delete(entity)) return false;
        this.rosterChanges.push({ entity, present: false });
        this.world.removePlayer(entity);
        return true;
      },
      rebalanceBots: () => this.rebalanceBots(),
      setTimescale: this.opts.setTimescale
        ? (scale: number) => {
            this.opts.setTimescale!(scale);
            return true;
          }
        : undefined,
    };
  }

  /** The match's tick (the runner reports frames with it; a restored or level-changed match keeps counting). */
  tickCount(): number {
    return this.world.tickCount;
  }

  /** A dedicated room's owner (hub player id) administers the match settings — never cheats. Null: nobody. */
  setOwner(hubId: number | null): void {
    this.serverConsole.setOwner(hubId);
  }

  // ─── Level change (changelevel / map) ─────────────────────────────────────

  /**
   * Moves the match to another published map: loads it (the match plays on meanwhile), then builds a
   * new world on it that keeps the tick count running and puts every human back in their seat —
   * same player id, team, class and loadouts (TF2 resets scores on a level change). Bots are dealt
   * again. Each client gets a new `hello` naming the map (it reloads the level) and a full snapshot.
   */
  async changeLevel(map: string): Promise<boolean> {
    const info = this.findLevel(map);
    if (this.disposed || !info || !this.opts.loadLevel || this.levelLoading) return false;
    this.levelLoading = info.name;
    this.serverConsole.broadcast(`Changing level to ${info.name}...`);
    try {
      const { map: loaded, nav } = await this.opts.loadLevel(info.name);
      if (this.disposed) return false;
      this.swapLevel(info.name, info.mode as Tf2Mode, loaded, nav);
      this.opts.log?.('tf2: level changed', { map: info.name });
      return true;
    } catch (error) {
      this.serverConsole.broadcast(`changelevel: ${info.name} failed to load (${error instanceof Error ? error.message : String(error)})`, 'error');
      return false;
    } finally {
      this.levelLoading = null;
    }
  }

  /** The new world, the humans moved over (between ticks). */
  private swapLevel(name: string, mode: Tf2Mode, loaded: LoadedMap, nav: NavMesh | null): void {
    const old = this.world;
    const seats = [...this.humans.values()].map((c) => ({
      client: c,
      name: c.player.name,
      userId: c.player.userId,
      team: c.player.team,
      cls: c.player.desiredClass || c.player.playerClass,
      loadouts: [...c.player.loadouts],
    }));
    this.bots.clear();
    this.byEntity.clear();
    this.map = loaded;
    this.options.map = name;
    this.options.mode = mode;
    this.world = this.createWorld(loaded, old.tickCount, old);
    this.installMode(this.world, name);
    if (nav) provideNavMesh(this.world, nav);
    this.capture = new WorldCapture(loaded.bsp);
    this.rosterChanges = [];
    this.outgoing = [];
    for (const s of seats) {
      const player = this.world.addPlayer(s.name, { userId: s.userId });
      s.loadouts.forEach((slots, cls) => slots && player.setClassLoadout(cls, slots));
      const c = s.client;
      c.player = player;
      this.resetClient(c);
      this.byEntity.set(player.id, c);
      if (s.team === TF_TEAM_RED || s.team === TF_TEAM_BLUE) {
        player.requestTeam(s.team);
        if (s.cls > 0) player.requestClass(s.cls);
      } else if (s.team === TEAM_SPECTATOR) {
        player.requestTeam(TEAM_SPECTATOR);
      } else {
        player.observerMode = OBS_MODE_ROAMING;
      }
      this.serverConsole.playerJoined(player);
    }
    this.rebalanceBots();
  }

  /** A client starts over (a level change, a resync, a restored seat): fresh baseline, strings, hello, roster. */
  private resetClient(c: HumanClient): void {
    c.strings = new ClientStringKnowledge();
    c.snap = new ClientSnapshotState(c.strings);
    c.queue = [];
    c.lastQueued = 0;
    c.lastRun = 0;
    c.budget = 1;
    c.reliable = [];
    c.needsHello = true;
    c.needsRoster = true;
  }

  // ─── Checkpoints (peer-to-peer host migration) ───────────────────────────

  /**
   * The whole match written down (sim/checkpoint): the world, every human's seat, the bots and
   * their brains, the console's cvars. A successor restores it with `Tf2MatchHost.restore`.
   */
  checkpoint(catalog: GraphCatalog & { fingerprint?: string }): WorldCheckpoint {
    const extra: HostCheckpointExtra = {
      options: { ...this.options },
      humans: [...this.humans.values()].map((c) => ({ hubId: c.hubId, player: c.player, lastVoiceAt: c.lastVoiceAt, rtt: c.rtt })),
      bots: [...this.bots.values()].map((b) => ({ player: b.player, brain: b.brain, commandNumber: b.commandNumber })),
      nextBotName: this.nextBotName,
      console: this.serverConsole.exportState(),
    };
    const cp = captureWorld(this.world, extra, catalog);
    cp.seats = [...this.humans.values()].map((c) => ({ hubId: c.hubId, entity: c.player.id, name: c.player.name, userId: c.player.userId }));
    return cp;
  }

  /** The seats a checkpoint holds (hub player id, entity, account), without restoring it. */
  static checkpointSeats(cp: WorldCheckpoint): CheckpointSeat[] {
    return cp.seats ?? [];
  }

  /**
   * A match from a checkpoint, on `opts.map` (the same map, loaded by the successor). Every human
   * keeps their seat (player entity, team, class, score) and their client starts over (full snapshot);
   * a seat nobody reclaims is removed by whoever runs the room (the host session's grace).
   */
  static restore(
    options: MatchOptions,
    opts: Tf2MatchHostOptions,
    cp: WorldCheckpoint,
    catalog: GraphCatalog & { fingerprint?: string; strict?: boolean },
  ): Tf2MatchHost {
    // Another game's checkpoint, restored through Tf2MatchHost (the listen worker's path): its own host.
    if (this === Tf2MatchHost && isOtherGame(options)) return matchGameFactory(options.game!).restore(options, opts, cp, catalog);
    // No bots of its own: the checkpoint's come back with their brains.
    // `this`: the class restore was called on (CsMatchHost.restore builds a CsMatchHost).
    const host = new this({ ...options, botCount: 0 }, opts);
    const template: HostCheckpointExtra = {
      options: host.options,
      humans: [],
      bots: [],
      nextBotName: 0,
      console: host.serverConsole.exportState(),
    };
    const { extra, report } = restoreWorld(host.world, cp, catalog, template);
    if (report.unresolvedClosures.length > 0) {
      throw new CheckpointError(`checkpoint closures without a home: ${report.unresolvedClosures.slice(0, 4).join(', ')}`);
    }
    host.nextBotName = extra.nextBotName;
    for (const b of extra.bots) host.bots.set(b.player.id, { player: b.player, brain: b.brain, commandNumber: b.commandNumber });
    for (const h of extra.humans) {
      const c = host.newClient(h.hubId, h.player);
      c.lastVoiceAt = h.lastVoiceAt;
      c.rtt = h.rtt;
    }
    host.serverConsole.importState(extra.console);
    for (const c of host.humans.values()) host.serverConsole.playerJoined(c.player);
    return host;
  }

  // ─── Players ──────────────────────────────────────────────────────────────

  addPlayer(id: number, info: PlayerInfo): void {
    if (this.disposed) return;
    if (this.humans.has(id)) this.removePlayer(id);
    // A human takes a bot's seat on a full server.
    if (this.playerCount() >= this.options.maxPlayers) this.removeOneBot();
    const name = sanitizeName(info.name) || `Player ${id}`;
    const player = this.world.addPlayer(name, { userId: info.userId });
    this.newClient(id, player);
    this.serverConsole.playerJoined(player);
    this.rosterChanges.push({ entity: player.id, present: true });
    if (info.spectate) {
      // Joined as a spectator: straight to the spectators (the join request said so; no team switch after).
      player.requestTeam(TEAM_SPECTATOR);
      player.observerMode = OBS_MODE_ROAMING;
    } else if (this.opts.autoTeam) {
      this.joinTeam(player, 'auto');
      if (this.opts.autoClass) this.joinClass(player, 'random');
    } else {
      player.observerMode = OBS_MODE_ROAMING;
    }
    this.rebalanceBots();
  }

  private newClient(id: number, player: Player): HumanClient {
    const strings = new ClientStringKnowledge();
    const client: HumanClient = {
      hubId: id,
      player,
      snap: new ClientSnapshotState(strings),
      strings,
      queue: [],
      lastQueued: 0,
      lastRun: 0,
      budget: 1,
      reliable: [],
      needsHello: true,
      needsRoster: true,
      lastVoiceAt: -1000,
      rtt: 0.1,
      inputPackets: 0,
      badPackets: 0,
    };
    this.humans.set(id, client);
    this.byEntity.set(player.id, client);
    this.stats.set(id, {
      snapshotBytes: 0,
      snapshots: 0,
      fullSnapshots: 0,
      reliableBytes: 0,
      reliablePackets: 0,
      maxSnapshotBytes: 0,
    });
    return client;
  }

  removePlayer(id: number): void {
    const client = this.humans.get(id);
    if (!client) return;
    this.humans.delete(id);
    this.byEntity.delete(client.player.id);
    this.rosterChanges.push({ entity: client.player.id, present: false });
    this.world.removePlayer(client.player.id);
    this.rebalanceBots();
  }

  /**
   * A human's client starts over on the same seat (a peer-to-peer member that
   * rejoined): its snapshot baseline, strings, server info and roster are sent
   * afresh and command numbers restart. The player entity, team, class and
   * score stay — that is the seat.
   */
  resyncPlayer(id: number): void {
    const client = this.humans.get(id);
    if (!client) return;
    this.resetClient(client);
    // A console starting over learns the replicated cvars again.
    this.serverConsole.playerJoined(client.player);
  }

  /** The player entity of a human (tests, the listen server). */
  playerOf(hubId: number): Player | null {
    return this.humans.get(hubId)?.player ?? null;
  }

  /** Last command number run for a human. */
  lastCommandRun(hubId: number): number {
    return this.humans.get(hubId)?.lastRun ?? 0;
  }

  private playerCount(): number {
    return this.humans.size + this.bots.size;
  }

  protected teamSizes(): [number, number] {
    let red = 0;
    let blue = 0;
    this.world.forEachPlayer((p) => {
      if (p.team === TF_TEAM_RED) red++;
      else if (p.team === TF_TEAM_BLUE) blue++;
    });
    return [red, blue];
  }

  /** The team an auto-assign picks: fewer players, then the losing team, then RED. */
  protected smallerTeam(exclude: Player | null = null): number {
    let [red, blue] = this.teamSizes();
    if (exclude?.team === TF_TEAM_RED) red--;
    if (exclude?.team === TF_TEAM_BLUE) blue--;
    if (red !== blue) return red < blue ? TF_TEAM_RED : TF_TEAM_BLUE;
    const scores = this.world.rules.teamScores;
    if (scores[TF_TEAM_RED] !== scores[TF_TEAM_BLUE])
      return scores[TF_TEAM_RED] < scores[TF_TEAM_BLUE] ? TF_TEAM_RED : TF_TEAM_BLUE;
    return TF_TEAM_RED;
  }

  protected joinTeam(p: Player, choice: TeamChoice): void {
    const team =
      choice === 'red'
        ? TF_TEAM_RED
        : choice === 'blue'
          ? TF_TEAM_BLUE
          : choice === 'spectator'
            ? TEAM_SPECTATOR
            : p.team === TF_TEAM_RED || p.team === TF_TEAM_BLUE
              ? p.team === this.smallerTeam(p)
                ? p.team
                : this.smallerTeam(p)
              : this.smallerTeam();
    if (team !== p.team) p.requestTeam(team);
  }

  protected joinClass(p: Player, choice: ClassChoice): void {
    if (p.team !== TF_TEAM_RED && p.team !== TF_TEAM_BLUE) return;
    let cls = (CLASS_NAMES as readonly string[]).indexOf(choice);
    if (cls <= 0 || cls >= TF_CLASS_COUNT) cls = this.world.random.randomInt(1, TF_CLASS_COUNT - 1);
    p.requestClass(cls);
  }

  // ─── Bots ─────────────────────────────────────────────────────────────────

  /**
   * Adds bots (they balance the teams and pick random classes, unless `prefs` names a team, class or
   * name — the console's `tf_bot_add`). Returns the players.
   */
  addBots(
    count: number,
    difficulty: BotDifficulty = this.options.botDifficulty,
    prefs: { team?: TeamChoice; cls?: ClassChoice; name?: string } = {},
  ): Player[] {
    const out: Player[] = [];
    for (let i = 0; i < count && this.playerCount() < this.options.maxPlayers; i++) {
      const name =
        (prefs.name && sanitizeName(prefs.name)) ||
        `${BOT_NAMES[this.nextBotName % BOT_NAMES.length]}${this.nextBotName >= BOT_NAMES.length ? ` (${1 + Math.floor(this.nextBotName / BOT_NAMES.length)})` : ''}`;
      if (!prefs.name) this.nextBotName++;
      const player = this.world.addPlayer(name, { bot: true });
      // Hard and expert bots may carry fully simulated unlocks (sim/items/bots.ts); others stay stock.
      this.decorateBot(player, difficulty);
      const brain = this.brainFactory(difficulty, player);
      this.bots.set(player.id, { player, brain, commandNumber: 0 });
      this.rosterChanges.push({ entity: player.id, present: true });
      this.joinTeam(player, prefs.team ?? 'auto');
      this.joinClass(player, prefs.cls ?? 'random');
      out.push(player);
    }
    return out;
  }

  /**
   * The classes a team's bots play, in order (an offline player's line-up;
   * empty = the TFBot roster). Applies as bots respawn.
   */
  setBotClassPreference(team: number, classes: readonly number[]): void {
    const valid = classes.filter((c) => Number.isInteger(c) && c > 0 && c < TF_CLASS_COUNT);
    const m = getBotManager(this.world).classPreference;
    if (valid.length > 0) m.set(team, valid);
    else m.delete(team);
  }

  /** Replaces every bot's brain (the bots module plugs in here). */
  setBotBrain(factory: BotBrainFactory): void {
    for (const b of this.bots.values()) b.brain = factory(this.options.botDifficulty, b.player);
  }

  private removeOneBot(): void {
    const [red, blue] = this.teamSizes();
    const fromTeam = red > blue ? TF_TEAM_RED : TF_TEAM_BLUE;
    let pick: BotClient | null = null;
    for (const b of this.bots.values()) {
      if (!pick || (b.player.team === fromTeam && pick.player.team !== fromTeam)) pick = b;
    }
    if (!pick) return;
    this.bots.delete(pick.player.id);
    this.rosterChanges.push({ entity: pick.player.id, present: false });
    this.world.removePlayer(pick.player.id);
  }

  /** tf_bot_quota_mode fill: bots = min(botCount, maxPlayers − humans). */
  private rebalanceBots(): void {
    const want = Math.max(
      0,
      Math.min(this.options.botCount, this.options.maxPlayers - this.humans.size),
    );
    while (this.bots.size > want) this.removeOneBot();
    if (this.bots.size < want) this.addBots(want - this.bots.size);
  }

  // ─── Input and commands ───────────────────────────────────────────────────

  onInput(id: number, packet: Uint8Array): void {
    const client = this.humans.get(id);
    if (!client) return;
    const decoded = decodeInputPacket(packet);
    if (!decoded) {
      client.badPackets++;
      return;
    }
    client.inputPackets++;
    const p = client.player;
    if (decoded.ackTick > 0 && decoded.ackTick <= this.world.tickCount) {
      const before = client.snap.ackTick;
      client.snap.acknowledge(decoded.ackTick);
      if (client.snap.ackTick !== before) {
        const sample = (this.world.tickCount - decoded.ackTick) * TICK_INTERVAL;
        client.rtt = client.rtt * 0.8 + sample * 0.2;
        p.latency = client.rtt / 2;
      }
    }
    p.lerpTicks = decoded.interpTicks;
    for (const cmd of decoded.cmds) {
      if (cmd.commandNumber <= client.lastQueued) continue;
      // Clamp what a client may claim (CBasePlayer::ProcessUsercmds sanity).
      if (cmd.viewAngles.x > 89) cmd.viewAngles.x = 89;
      else if (cmd.viewAngles.x < -89) cmd.viewAngles.x = -89;
      cmd.tickCount = Math.min(cmd.tickCount, this.world.tickCount + 1);
      client.queue.push(cmd);
      client.lastQueued = cmd.commandNumber;
    }
    while (client.queue.length > COMMAND_QUEUE_MAX) client.queue.shift();
  }

  onCommand(id: number, cmd: MatchCommand): void {
    const client = this.humans.get(id);
    if (!client) return;
    const p = client.player;
    switch (cmd.kind) {
      case 'team':
        this.joinTeam(p, cmd.team);
        if (
          this.opts.autoClass &&
          (p.team === TF_TEAM_RED || p.team === TF_TEAM_BLUE) &&
          p.playerClass === 0 &&
          p.desiredClass === 0
        ) {
          this.joinClass(p, 'random');
        }
        break;
      case 'class':
        this.joinClass(p, cmd.cls);
        break;
      case 'chat':
        // The hub delivers chat itself (tf2:chat); nothing to simulate.
        break;
      case 'voice': {
        const line = VOICE_MENU[cmd.menu]?.[cmd.item];
        if (!line || !p.alive) break;
        if (this.world.curtime - client.lastVoiceAt < VOICE_COOLDOWN) break;
        client.lastVoiceAt = this.world.curtime;
        this.world.events.push({ type: 'voice', player: p.id, line });
        break;
      }
      case 'extra':
        // The developer console's server commands and cvars first (validated and permission-checked there).
        if (this.serverConsole.handle(id, p, cmd.command, cmd.args)) break;
        if (!dispatchExtraCommand(cmd.command, { world: this.world, player: p }, cmd.args)) {
          this.opts.log?.('tf2: unhandled command', { command: cmd.command });
        }
        break;
      case 'loadout':
        applyLoadoutCommand(this.world, p, cmd.cls, cmd.slots);
        break;
    }
  }

  // ─── The tick ─────────────────────────────────────────────────────────────

  tick(): void {
    if (this.disposed) return;
    const world = this.world;
    const nextTick = world.tickCount + 1;

    for (const b of this.bots.values()) {
      if (b.player.removed) continue;
      const cmd = b.brain.think(world, b.player);
      b.commandNumber++;
      cmd.commandNumber = b.commandNumber;
      cmd.tickCount = nextTick;
      cmd.randomSeed = (b.commandNumber * 2654435761 + b.player.id) >>> 1;
      world.queueCommand(b.player.id, cmd);
    }

    for (const c of this.humans.values()) {
      c.budget = Math.min(COMMAND_BUDGET_MAX, c.budget + 1);
      let n = 0;
      while (c.queue.length > 0 && c.budget > 0) {
        const cmd = c.queue.shift()!;
        world.queueCommand(c.player.id, cmd);
        c.lastRun = cmd.commandNumber;
        c.budget--;
        n++;
      }
      if (n === 0) {
        // Not simulated this tick (see the header).
        (c.player as unknown as { runCommand: (cmd: UserCmd) => void }).runCommand = SKIP_COMMAND;
        this.frozen.push(c.player);
      }
    }

    this.serverConsole.tick();
    try {
      world.step();
    } finally {
      for (const p of this.frozen) delete (p as unknown as { runCommand?: unknown }).runCommand;
      this.frozen.length = 0;
    }

    this.routeEvents(world.drainEvents());

    const snapshotTick = world.tickCount % this.snapshotInterval === 0;
    const captured =
      snapshotTick && this.humans.size > 0 ? this.capture.capture(world, world.tickCount) : null;
    const sendScores = world.tickCount % SCORES_INTERVAL_TICKS === 0;
    const scoreRows = sendScores ? this.scoreRows() : null;
    const roster = this.rosterChanges;
    this.rosterChanges = [];

    for (const c of this.humans.values()) this.flushClient(c, captured, roster, scoreRows);
  }

  private routeEvents(events: SimEvent[]): void {
    if (events.length === 0 || this.humans.size === 0) return;
    const tick = this.world.tickCount;
    for (const ev of events) {
      const w = this.eventWriter.reset(0);
      const used: number[] = [];
      writeEvent(w, ev, this.refs, used);
      const encoded: EncodedEvent = {
        tick,
        bytes: w.toBytes(),
        bitLength: w.bitLength,
        strings: used,
        event: ev,
      };
      const cosmetic = eventIsCosmetic(ev);
      for (const c of this.humans.values()) {
        if (!eventVisibleTo(ev, c.player.id, c.player.team)) continue;
        if (cosmetic) c.snap.pendingEvents.push(encoded);
        else c.reliable.push(encoded);
      }
    }
  }

  private scoreRows(): ScoreRow[] {
    const rows: ScoreRow[] = [];
    this.world.forEachPlayer((p) => {
      const human = this.byEntity.get(p.id);
      rows.push({
        entity: p.id,
        score: this.playerScore(p),
        kills: p.stats.kills,
        deaths: p.stats.deaths,
        assists: p.stats.assists,
        pingMs: human ? human.rtt * 1000 : 0,
      });
    });
    return rows;
  }

  private viewEye(p: Player, out: Vec3): Vec3 {
    const target = p.alive ? null : this.world.entity(p.observerTarget);
    if (target && target !== p) return this.world.centerOf(target);
    return p.eyePosition(out);
  }

  private readonly eyeScratch = { x: 0, y: 0, z: 0 };

  private flushClient(
    c: HumanClient,
    captured: CapturedFrame | null,
    roster: Array<{ entity: number; present: boolean }>,
    scores: ScoreRow[] | null,
  ): void {
    const tick = this.world.tickCount;
    const stats = this.stats.get(c.hubId)!;
    let snapshot: Uint8Array | null = null;
    const defs: number[] = [];

    if (captured) {
      const eye = this.viewEye(c.player, this.eyeScratch);
      const enc = this.encoder.encode(c.snap, captured, this.capture.culler, {
        tick,
        ackCmd: c.lastRun,
        viewer: { entityId: c.player.id, eye: { x: eye.x, y: eye.y, z: eye.z } },
        maxBytes: this.opts.snapshotMaxBytes,
      });
      snapshot = enc.bytes;
      for (const id of enc.newStrings) defs.push(id);
      stats.snapshots++;
      stats.snapshotBytes += snapshot.byteLength;
      stats.maxSnapshotBytes = Math.max(stats.maxSnapshotBytes, snapshot.byteLength);
      if (enc.full) stats.fullSnapshots++;
    }

    for (const e of c.reliable) {
      for (const id of e.strings) {
        if (!c.strings.has(id)) {
          c.strings.add(id);
          defs.push(id);
        }
      }
    }

    const rw = this.reliableWriter.begin(tick);
    for (const id of defs) rw.string(id, this.strings.strings[id]);
    if (c.needsHello) {
      c.needsHello = false;
      rw.hello({
        localEntity: c.player.id,
        map: this.options.map,
        mode: this.helloMode() as Tf2Mode,
        maxPlayers: this.options.maxPlayers,
        seed: this.options.seed >>> 0,
        name: this.options.name,
        snapshotInterval: this.snapshotInterval,
      });
    }
    if (c.needsRoster) {
      c.needsRoster = false;
      this.world.forEachPlayer((p) =>
        rw.player({ entity: p.id, present: true, name: p.name, bot: p.isBot }),
      );
    } else {
      for (const r of roster) {
        const p = this.world.player(r.entity);
        if (r.present && p) rw.player({ entity: p.id, present: true, name: p.name, bot: p.isBot });
        else if (!r.present) rw.player({ entity: r.entity, present: false, name: '', bot: false });
      }
    }
    if (scores) rw.scores(scores);
    for (const e of c.reliable) rw.event(e.bytes, e.bitLength);
    c.reliable = [];
    const reliable = rw.finish();
    if (reliable) {
      this.outgoing.push({ to: c.hubId, reliable: true, data: reliable });
      stats.reliablePackets++;
      stats.reliableBytes += reliable.byteLength;
    }
    if (snapshot) this.outgoing.push({ to: c.hubId, reliable: false, data: snapshot });
  }

  drainOutgoing(): OutgoingPacket[] {
    const out = this.outgoing;
    this.outgoing = [];
    return out;
  }

  isEmpty(): boolean {
    return this.humans.size === 0;
  }

  summary(): RoomSummary {
    const players: PlayerSummary[] = [];
    this.world.forEachPlayer((p) => {
      const human = this.byEntity.get(p.id);
      players.push({
        id: human ? human.hubId : -p.id,
        entity: p.id,
        name: p.name,
        team: p.team,
        cls: p.playerClass,
        score: this.playerScore(p),
        bot: !human,
      });
    });
    const scores = this.world.rules.teamScores;
    return {
      map: this.options.map,
      mode: this.options.mode,
      tick: this.world.tickCount,
      players,
      teamScores: [scores[TF_TEAM_RED] ?? 0, scores[TF_TEAM_BLUE] ?? 0],
      round: { state: this.world.rules.stateName, timeLeft: this.roundTimeLeft() },
    };
  }

  /** Seconds on the round timer the HUD shows (team_round_timer, show_in_hud), or null. */
  protected roundTimeLeft(): number | null {
    let left: number | null = null;
    this.world.forEachEntity((e) => {
      const t = e as unknown as { showInHud?: unknown; disabled?: unknown; getTimeRemaining?: () => number };
      if (left !== null || t.showInHud !== true || t.disabled === true || typeof t.getTimeRemaining !== 'function') return;
      left = Math.max(0, Math.round(t.getTimeRemaining()));
    });
    return left;
  }

  dispose(): void {
    this.disposed = true;
    this.humans.clear();
    this.byEntity.clear();
    this.bots.clear();
    this.outgoing = [];
    this.rosterChanges = [];
  }

  /** Unassigned players (for tests and the HUD's team menu). */
  get unassignedCount(): number {
    let n = 0;
    this.world.forEachPlayer((p) => {
      if (p.team === TEAM_UNASSIGNED) n++;
    });
    return n;
  }
}

/** Drops control characters (the hub sanitises too) and caps the length (MAX_PLAYER_NAME_LENGTH 32). */
function sanitizeName(name: string): string {
  let out = '';
  for (const ch of name) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c !== 0x7f) out += ch;
  }
  return out.trim().slice(0, 32);
}
