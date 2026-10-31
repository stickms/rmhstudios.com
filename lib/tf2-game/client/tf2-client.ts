/**
 * The TF2 game client: one match, online through the games hub, offline
 * against bots on a listen-server worker, or peer-to-peer (hosting: the
 * listen worker opened to friends over WebRTC; joining: a friend's listen
 * server over DataChannels) — the same bytes every way.
 *
 *   connect (hub: connectTf2 → create/join a room; offline: the listen worker;
 *            P2P: client/net/p2p-host.ts, client/net/p2p-join.ts)
 *     → joined (map, player id) → load the map package (renderer + the
 *       predicting client world share one BSP parse)
 *     → every frame (GameLoop, the one rAF):
 *         input: gamepad poll, mouse/stick look applied to the view angles;
 *         ticks (66.67 Hz, FixedStep): build a UserCmd from the input state,
 *           predict it (Prediction: movement + the active weapon), send the
 *           packet (the newest commands, acking the newest snapshot);
 *         snapshots → SnapshotClient decode → the interpolation buffer (others
 *           are drawn `interp` behind the server) and reconciliation;
 *         view: ViewController (first person with stairs/roll/punch and the
 *           zoom FOV, death cam → freeze cam on the killer → chase, spectator
 *           modes);
 *         render: WorldRenderer (+ brush entities moved by snapshots), the
 *           entity renderer (players, projectiles, buildings, effects), the
 *           view model over the world;
 *         audio: sim sound events and predicted sounds, the listener;
 *         HUD: buildHudState → the store (throttled), impulses → the menus.
 *
 * Map changes (a new `hello` naming another map — `changelevel` on a listen
 * server, a peer-to-peer host or a hub room's owner all arrive that way),
 * reconnects (a new player id: prediction and interpolation restart), host
 * migration (a member becomes the host from its checkpoint, or resyncs with
 * the new host) and kicks are handled here; the play page shows the loading
 * screen and errors from the callbacks.
 *
 * Browser only.
 */

import { FL_ONGROUND, IN_ATTACK, IN_ATTACK2, IN_JUMP, MASK_OPAQUE, SURF_SKY, TEAM_SPECTATOR, TEAM_UNASSIGNED, TICK_INTERVAL, VEC_DUCK_VIEW_Z } from '../core/constants';
import { emptyTrace } from '../core/types';
import type { Vec3 } from '../core/vec';
import { gameAssetUrl } from '../assets/urls';
import { SOURCE_UNIT } from '../render/coords';
import { WorldRenderer } from '../render/world-renderer';
import { decodeItemsCached } from '../sim/items/loadout';
import { EntityRenderer, LoadoutModels, ModelLibrary, ParticleLibrary, type EntityState as RenderEntity } from '../render/entities';
import { CRIT_BOOST_CONDS, TF_COND } from '../sim/conditions';
import { LIFE_ALIVE, EF_NODRAW } from '../sim/entity';
import type { SimEvent } from '../sim/events';
import { isPlayerType, type NetRecord } from '../sim/net-schema';
import { registerAllSimModules } from '../sim/register-all';
import { GameWorld } from '../sim/world';
import type { Player } from '../sim/player';
import { keyKind, type EntityState as NetEntityState } from '../net/snapshot';
import { TF2_LIMITS, type BotDifficulty, type JoinedPayload, type RoomAdminPayload, type RoomGame, type RoomMode } from '../net/events';
import type { MatchCommand, MatchOptions } from '../server/match-host';
import type { AudioEngine } from '../audio/engine';
import { EntityLoopSounds, LateStartFilter } from '../audio/loops';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import { buildHudState, HudEventLog, hudSourceFromSnapshot, playerLookup, type HudSource } from './hud-adapter';
import type { HudCommand, HudStore } from './hud-store';
import type { GameSettings } from './settings';
import { buildUserCmd, drainImpulses, heldButtons, applyLook, type WeaponContext } from './input';
import { InputSender } from './net/input';
import { InterpolationBuffer, RenderClock } from './net/interpolation';
import { Prediction, type PredictedEffect, type PredictedSound } from './net/prediction';
import { SnapshotClient, type TimedEvent } from './net/snapshot-client';
import { connectListenServer, type ListenConnection } from './net/listen-server';
import type { P2pHostController } from './net/p2p-host';
import type { P2pJoinEnd, P2pJoinOptions } from './net/p2p-join';
import { P2P_SNAPSHOT_MAX_BYTES } from '../net/p2p/wire';
import type { PeerConnection, PeerRow } from '../net/p2p/control';
import type { P2pHostPayload, P2pHostedPayload } from '../net/p2p/signal';
import type { SeatInfo } from '../net/p2p/host-session';
import type { HudAdmin, HudGame, HudNotice } from './hud-state';
import { loadItemCatalog } from './item-catalog';
import { FixedStep, GameLoop, type FrameInfo } from './loop';
import {
  applyVolumes,
  ClientFailure,
  createAudio,
  FpsMeter,
  InputCore,
  loadMapPackageForClient,
  ProgressTracker,
  PropDistanceCuller,
  RenderCore,
  ragdollTrace,
  wallTrace,
  type ClientMount,
  type ClientStats,
  type GameClient,
  type LoadedPackage,
} from './game-client';
import { FovState, TF_WEAPON_ZOOM_FOV, TF_ZOOM_RATE, ViewController, type ViewTarget } from './view';
import { loadClientProfile, TF2_PROFILE, type ClientGameProfile, type ProfileMap, type ProfileViewModel } from './game-profile';
import { attachConsoleHost, type ConsoleLink } from '../console/runtime';
import type { ConsoleHost } from '../console/game-console';
import { indexFromLump, type EntityIndex } from '../console/entity-complete';

export type Tf2Session =
  | {
      kind: 'offline';
      map: string;
      botCount: number;
      difficulty: BotDifficulty;
      maxPlayers: number;
      playerName: string;
      /** Absent: TF2. CS:GO plays de_dust2 in `mode` 'de' (bomb defusal) or 'dm' (deathmatch). */
      game?: RoomGame;
      mode?: RoomMode;
    }
  /** Host a peer-to-peer match: a listen server in this page, opened to signed-in friends. */
  | { kind: 'p2p-host'; room: P2pHostPayload; playerName: string }
  /** Join a host by code; `spectate` is part of the join request (seated with the spectators). */
  | { kind: 'p2p-join'; code: string; spectate?: boolean; password?: string; game?: RoomGame };

/** What this client is in its match right now (it can change: a member promoted to host). */
type Role = 'offline' | 'p2p-host' | 'p2p-member';

/** Peer-to-peer and listen-server tuning for the worker: its clock for the room, and checkpoints. */
const P2P_WORKER_CLOCK = { upkeepMs: 100, checkpointMs: 2_000 } as const;
/** A network notice stays this long (s). */
const NOTICE_SECONDS = 8;

export interface Tf2ClientOptions extends ClientMount {
  session: Tf2Session;
}

/** HUD updates per second (the store throttles too; building the state is the cost saved). */
const HUD_HZ = 20;

/**
 * How the client reaches its match: the hub's sockets, the local listen
 * worker, or a peer-to-peer host's DataChannels — one shape for all three.
 */
interface Transport {
  input(packet: Uint8Array): void;
  command(cmd: MatchCommand): void;
  /** Offline only: hold the listen server's match still. */
  pause?(paused: boolean): void;
  chat(text: string, teamOnly: boolean): void;
  stop(): void;
  readonly online: boolean;
  pingMs(): number | null;
  /** Peer-to-peer: every human's connection type by entity (the scoreboard). */
  links?(): ReadonlyMap<number, PeerConnection>;
  /** Peer-to-peer diagnostics (the smoke test, the net graph). */
  p2p?(): Record<string, unknown>;
  /** Peer-to-peer host: the members' seats, and removing one. */
  seats?(): SeatInfo[];
  kick?(playerId: number): void;
  /** Peer-to-peer: each human's ping and input loss by entity (the scoreboard). */
  linkRows?(): ReadonlyMap<number, { pingMs?: number; loss?: number }>;
  /** A listen server (offline, a P2P host): move the match to another published map. */
  changeLevel?(map: string): void;
  /** Room administration; resolves to an error key for the player, or null when it was sent. */
  admin?(action: RoomAdminPayload): Promise<string | null> | string | null;
  /** The administration view, when this player runs the room. */
  adminView?(): HudAdmin | null;
  /** Peer-to-peer member: loss, choke and jitter of the host's snapshots as they arrive. */
  traffic?(): { loss: number; choke: number; jitterMs: number } | null;
}

export class Tf2Client implements GameClient {
  readonly store: HudStore;
  /** The game this session plays (TF2's until a CS:GO session's profile has loaded). */
  private profile: ClientGameProfile = TF2_PROFILE;
  /** A game's own view model (CS:GO); TF2 uses the entity renderer's. */
  private gameViewModel: ProfileViewModel | null = null;
  get game(): HudGame {
    return this.profile.id === 'csgo' ? 'csgo' : 'tf2';
  }
  private settings: GameSettings;
  private readonly progress: ProgressTracker;
  private core: RenderCore | null = null;
  private inputCore: InputCore | null = null;
  private loop: GameLoop | null = null;
  private transport: Transport | null = null;
  private audio: AudioEngine | null = null;
  /** Every player's weapon loop from replicated state (audio/loops.ts). */
  private loops: EntityLoopSounds | null = null;
  private readonly loopWants: Array<[number, string]> = [];
  /** Drops loop starts that arrive after their (reliable) stop. */
  private readonly lateStarts = new LateStartFilter(TICK_INTERVAL);
  private world: WorldRenderer | null = null;
  private ents: EntityRenderer | null = null;
  private models: ModelLibrary | null = null;
  private pkg: LoadedPackage | null = null;
  private loadingMap: string | null = null;
  private clientWorld: GameWorld | null = null;
  private prediction: Prediction | null = null;
  private localPlayerSim: Player | null = null;
  private readonly snap = new SnapshotClient();
  private interp = new InterpolationBuffer();
  private readonly clock = new RenderClock();
  /** The listen server is held still (offline pause). */
  private offlinePaused = false;
  private sender = new InputSender();
  private readonly ticks = new FixedStep(TICK_INTERVAL, 5);
  private readonly log = new HudEventLog();
  private readonly view = new ViewController();
  private readonly fov: FovState;
  private readonly viewAngles = { x: 0, y: 0, z: 0 };
  private readonly fps = new FpsMeter();
  private readonly culler = new PropDistanceCuller();
  private joined: JoinedPayload | null = null;
  private disposed = false;
  private started = false;
  private running = false;
  private hudAcc = 0;
  private clientNow = 0;
  private serverTime = 0;
  private pendingEvents: SimEvent[] = [];
  private records = new Map<number, NetRecord>();
  private renderStates: RenderEntity[] = [];
  private readonly brushCache = new Map<number, { ox: number; oy: number; oz: number; p: number; y: number; r: number; nodraw: boolean | null }>();
  private lastButtons = 0;
  private trace: ReturnType<typeof wallTrace> | null = null;
  private readonly unsubs: Array<() => void> = [];
  private readonly entityPos = new Map<number, Vec3>();
  private connected = false;
  private lastSpawnedAlive = false;
  private worker: Worker | null = null;
  private abort = new AbortController();
  /** Peer-to-peer member: the host's connection rows (by entity). */
  private peerLinks: ReadonlyMap<number, PeerConnection> = new Map();
  private peerStats: ReadonlyMap<number, { pingMs?: number; loss?: number }> = new Map();
  private role: Role = 'offline';
  /** A hub room's administration (owner, lock, password), as the hub last said. */
  private notices: HudNotice[] = [];
  /** The newest network transitions (diagnostics: debug() and the smoke tests). */
  private readonly netLog: string[] = [];
  private netTrace(what: string): void {
    this.netLog.push(`${Math.round(performance.now())} ${what}`);
    if (this.netLog.length > 40) this.netLog.shift();
  }
  private nextNoticeId = 1;
  /** host_timescale as the server replicates it (the client's ticks and clock follow). */
  private timescale = 1;
  /** The developer console (lib/tf2-game/console): its replies, binds' waits, net_graph, cheats' views. */
  private console: ConsoleLink | null = null;
  private thirdPersonCheat = false;
  private fpsMax = 0;
  /** The server's replicated sv_gravity when not the default (prediction must fall the same). */
  private gravity: number | null = null;

  constructor(private readonly opts: Tf2ClientOptions) {
    this.store = opts.store;
    this.settings = opts.settings;
    this.fov = new FovState(opts.settings.fov);
    this.progress = new ProgressTracker((p) => opts.callbacks.onProgress?.(p));
  }

  get input() {
    return this.opts.input;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const cb = this.opts.callbacks;
    cb.onPhase?.('loading');
    try {
      registerAllSimModules();
      this.profile = await loadClientProfile(this.sessionGame());
      await this.profile.prepare();
      if (this.disposed) return;
      this.core = new RenderCore(this.opts.canvas, this.settings, () =>
        this.fail(new ClientFailure({ code: 'context-lost', detail: 'WebGL context lost', retryable: true })),
      );
      this.inputCore = new InputCore(this.opts.inputTarget, this.game, () => this.settings, (l) => cb.onLockChange?.(l), this.opts.input);
      this.audio = createAudio(
        this.profile.assets,
        this.settings,
        (id) => this.entityPos.get(id) ?? null,
        this.occlusion,
      );
      this.unsubs.push(this.audio.attach());
      const audio = this.audio;
      this.loops = new EntityLoopSounds({ emit: (ev) => audio.emit(ev) });
      this.unsubs.push(this.store.onCommand((c) => this.onHudCommand(c)));
      this.console = attachConsoleHost(this.store, this.game, this.consoleHost());
      this.unsubs.push(() => this.console?.detach());
      const title = this.sessionMap();
      if (title) this.progress.title = this.findMap(title)?.title ?? title;
      this.progress.begin('sounds');
      void this.audio
        .load()
        .catch(() => {})
        .finally(() => this.progress.finish('sounds'));
      this.progress.begin('connect');
      this.connect();
    } catch (e) {
      this.fail(e);
    }
  }

  /** The game the session names (absent: TF2). */
  private sessionGame(): RoomGame {
    const s = this.opts.session;
    return (s.kind === 'p2p-host' ? s.room.game : s.game) ?? 'tf2';
  }

  /** The session's mode for a map that can play more than one (CS:GO's de_dust2: 'de' or 'dm'). */
  private sessionMode(): RoomMode | undefined {
    const s = this.opts.session;
    return s.kind === 'offline' ? s.mode : s.kind === 'p2p-host' ? s.room.mode : undefined;
  }

  private findMap(name: string): ProfileMap | null {
    return this.profile.findMap(name, this.sessionMode() ?? this.roomMode);
  }

  /** The mode of the room the host admitted us to (a member's session does not name one). */
  private roomMode: RoomMode | undefined;

  /** The hub's `game` for a room of this session's game (absent for TF2). */
  private roomGame(): { game?: RoomGame } {
    return this.profile.id === 'tf2' ? {} : { game: this.profile.id };
  }

  private sessionMap(): string | null {
    const s = this.opts.session;
    return s.kind === 'offline' ? s.map : s.kind === 'p2p-host' ? s.room.map : null;
  }

  // ─── Transport ───────────────────────────────────────────────────────────

  /** `map` (offline only): restart the listen server on this map instead of the session's (`retry`). */
  private connect(map?: string): void {
    // Items beyond stock: prediction and rendering read the item schema (sim/items).
    if (this.profile.itemCatalog) void loadItemCatalog();
    const s = this.opts.session;
    if (s.kind === 'offline') {
      this.role = 'offline';
      const mapName = map ?? s.map;
      const info = this.findMap(mapName);
      if (!info) throw new ClientFailure({ code: 'map-missing', detail: `unknown map ${mapName}`, retryable: false });
      const worker = new Worker(new URL('./net/listen-worker.ts', import.meta.url), { type: 'module', name: 'tf2-listen-server' });
      this.worker = worker;
      worker.onerror = (e) => this.fail(new ClientFailure({ code: 'map-failed', detail: `listen server: ${e.message}`, retryable: true }));
      const opts: MatchOptions = {
        matchId: 'LOCAL',
        map: info.name,
        ...this.profile.matchOptions(info),
        // A listen server's full complement of slots: the bots fill `botCount`, the console's tf_bot_add the rest.
        maxPlayers: Math.max(s.maxPlayers, TF2_LIMITS.MAX_PLAYERS),
        botCount: s.botCount,
        botDifficulty: s.difficulty,
        name: 'Offline',
        seed: (Math.random() * 0x7fffffff) | 0,
      };
      const conn: ListenConnection = connectListenServer(
        worker,
        { opts, playerName: s.playerName },
        {
          onJoined: (j) => this.onJoined(j),
          onSnapshot: (d) => this.onSnapshot(d),
          onEvents: (d) => this.onReliable(d),
          onClosed: (reason, message) =>
            this.fail(new ClientFailure({ code: reason === 'map-failed' ? 'map-failed' : 'room', detail: `${reason}${message ? `: ${message}` : ''}`, retryable: true })),
        },
      );
      // The item schema: items beyond stock and the equip checks run in the listen server too.
      if (this.profile.itemCatalog)
        void loadItemCatalog().then((catalog) => {
          if (catalog && !this.disposed) conn.items(catalog);
        });
      this.transport = {
        online: false,
        input: (p) => conn.sendInput(p),
        command: (c) => conn.command(c),
        pause: (paused) => conn.pause(paused),
        chat: (text, teamOnly) => {
          conn.command({ kind: 'chat', text, teamOnly });
          // No hub to deliver it back offline: show it here.
          const me = this.snap.localPlayer();
          const name = this.snap.roster.get(this.snap.localEntity)?.name ?? s.playerName;
          this.log.pushChat({ name, team: num(me, 'team'), text, teamOnly, dead: num(me, 'lifeState') !== LIFE_ALIVE, system: false }, this.clientNow);
        },
        // The listen server moves the match; the new `hello` reloads the level here (the same path as online).
        changeLevel: (m) => conn.changeLevel(m),
        stop: () => {
          conn.stop();
          worker.terminate();
        },
        pingMs: () => 0,
      };
      this.connected = true;
      this.opts.callbacks.onConnection?.('connected');
      return;
    }
    const failNet = (e: unknown) =>
      this.fail(new ClientFailure({ code: 'network', detail: `games hub: ${e instanceof Error ? e.message : String(e)}`, retryable: true }));
    if (s.kind === 'p2p-host') {
      void this.connectP2pHost(s).catch(failNet);
      return;
    }
    void this.connectP2pJoin(s.code, { spectate: s.spectate, password: s.password }).catch(failNet);
  }

  // ─── Peer-to-peer ─────────────────────────────────────────────────────────

  /** Host: the listen worker (P2P options) plus the controller that opens it to members. */
  private async connectP2pHost(s: Extract<Tf2Session, { kind: 'p2p-host' }>): Promise<void> {
    const info = this.findMap(s.room.map);
    if (!info) throw new ClientFailure({ code: 'map-missing', detail: `unknown map ${s.room.map}`, retryable: false });
    const net = await import('../net/client');
    if (this.disposed) return;
    await net.connectTf2({
      onStatus: (status) => {
        // The match runs here; the hub only matters for new members joining.
        if (status === 'connected') this.opts.callbacks.onConnection?.('connected');
      },
      onError: (e) => {
        if (e.code === 'auth-required' && e.event === 'tf2:p2p:host') {
          this.fail(new ClientFailure({ code: 'auth-required', detail: e.event, retryable: false }));
        }
      },
    });
    const { P2pHostController } = await import('./net/p2p-host');
    if (this.disposed) return;
    const opts: MatchOptions = {
      matchId: 'LOCAL',
      map: info.name,
      ...this.profile.matchOptions(info),
      maxPlayers: s.room.maxPlayers,
      botCount: Math.min(s.room.botCount, s.room.maxPlayers - 1),
      botDifficulty: s.room.botDifficulty,
      instantRespawn: !!s.room.instantRespawn,
      name: s.room.name,
      seed: (Math.random() * 0x7fffffff) | 0,
    };
    this.startHosting(net, P2pHostController, { ...s.room, ...this.roomGame(), mode: info.mode }, opts, s.playerName, null);
  }

  /**
   * Runs the listen-server worker for a peer-to-peer room and opens it to members — a fresh match
   * (`promoted` null: announce the room), or, after a host migration, the match from the previous
   * host's checkpoint (`promoted`: the room is already ours on the hub).
   */
  private startHosting(
    net: typeof import('../net/client'),
    HostController: typeof P2pHostController,
    room: P2pHostPayload,
    opts: MatchOptions,
    playerName: string,
    promoted: { hosted: P2pHostedPayload; checkpoint: Uint8Array; localPlayerId: number } | null,
  ): void {
    this.role = 'p2p-host';
    const worker = new Worker(new URL('./net/listen-worker.ts', import.meta.url), { type: 'module', name: 'tf2-listen-server' });
    this.worker = worker;
    worker.onerror = (e) => this.fail(new ClientFailure({ code: 'map-failed', detail: `listen server: ${e.message}`, retryable: true }));
    let host: P2pHostController | null = null;
    const restore = promoted ? (promoted.checkpoint.slice().buffer as ArrayBuffer) : undefined;
    const conn: ListenConnection = connectListenServer(
      worker,
      {
        opts,
        playerName,
        // Every snapshot one DataChannel datagram, and the room's clock and migration checkpoints on
        // the worker's own (unthrottled) timers.
        // TF2 plays its join menus; CS:GO seats everyone on the smaller team (auto-select, as its own servers do).
        host: { autoTeam: this.profile.id !== 'tf2', snapshotMaxBytes: P2P_SNAPSHOT_MAX_BYTES, p2p: P2P_WORKER_CLOCK, ...(restore ? { restore } : {}) },
        ...(promoted ? { localPlayerId: promoted.localPlayerId } : {}),
      },
      {
        onJoined: (j) => {
          this.onJoined(j);
          if (!promoted) host?.start();
        },
        onSnapshot: (d) => this.onSnapshot(d),
        onEvents: (d) => this.onReliable(d),
        onSummary: (summary) => host?.onSummary(summary),
        onPeerFrame: (tick, packets) => host?.deliver(tick, packets),
        onUpkeep: () => host?.upkeep(),
        onCheckpoint: (data) => host?.onCheckpoint(data),
        onClosed: (reason, message) =>
          this.fail(new ClientFailure({ code: reason === 'map-failed' ? 'map-failed' : 'room', detail: `${reason}${message ? `: ${message}` : ''}`, retryable: true })),
      },
    );
    host = new HostController(
      net,
      room,
      conn,
      {
        onHosted: (h) => {
          this.opts.callbacks.onRoom?.(h.code);
          if (!promoted) this.notice('hosting');
        },
        onChat: (m) => this.log.onChat(m, this.clientNow),
        onError: (code) => {
          if (code === 'auth-required') this.fail(new ClientFailure({ code: 'auth-required', detail: 'tf2:p2p:host', retryable: false }));
          else console.warn('[tf2 client] the hub refused the room:', code);
        },
      },
      promoted ? { localPlayerId: promoted.localPlayerId } : {},
    );
    if (promoted) {
      host.startPromoted(promoted.hosted);
      // Every seat in the checkpoint but ours is held for its account (they are being asked back now).
      void import('../sim/checkpoint/pack')
        .then(({ unpackCheckpoint }) => unpackCheckpoint(promoted.checkpoint))
        .then((cp) => host?.seatsRestored((cp.seats ?? []).map((x) => ({ playerId: x.hubId, userId: x.userId, name: x.name }))))
        .catch(() => host?.seatsRestored([]));
    }
    if (this.profile.itemCatalog)
      void loadItemCatalog().then((catalog) => {
        if (catalog && !this.disposed) conn.items(catalog);
      });
    const h = host;
    this.transport = {
      online: true,
      input: (p) => conn.sendInput(p),
      command: (c) => {
        if (c.kind === 'chat') h.chat(c.text, c.teamOnly);
        else conn.command(c);
      },
      chat: (text, teamOnly) => h.chat(text, teamOnly),
      stop: () => {
        h.stop();
        // A moment for the goodbyes, then the match goes.
        setTimeout(() => {
          conn.stop();
          worker.terminate();
        }, 400);
      },
      // The host plays on its own listen server: no transport latency.
      pingMs: () => 0,
      links: () => h.links(),
      linkRows: () => h.linkRows(),
      seats: () => h.seats(),
      kick: (playerId) => h.kick(playerId),
      changeLevel: (map) => conn.changeLevel(map),
      admin: (action) => this.p2pHostAdmin(net, h, conn, action),
      adminView: () => ({
        role: 'host',
        online: true,
        map: this.pkg?.name ?? opts.map,
        locked: this.p2pDoor.locked,
        passworded: this.p2pDoor.passworded,
        players: [
          { id: this.joined?.playerId ?? 1, name: h.hostName ?? playerName, self: true },
          ...h.seats().map((seat) => ({
            id: seat.playerId,
            name: seat.name,
            self: false,
            connection: seat.droppedAt !== null ? null : seat.connection === 'host' ? null : seat.connection,
            pingMs: seat.pingMs,
            loss: seat.loss,
            canHost: seat.canHost && (seat.connection === 'direct' || seat.connection === 'turn') && seat.droppedAt === null,
            successor: h.successor === seat.playerId,
            held: seat.droppedAt !== null,
          })),
        ],
      }),
      p2p: () => ({
        role: 'host',
        code: h.code,
        seats: h.seats(),
        links: Object.fromEntries(h.links()),
        peers: h.linkStats(),
        successor: h.successor,
        checkpointsSent: h.checkpointsSent,
        checkpointBytes: h.lastCheckpointBytes,
      }),
    };
    this.connected = true;
    this.opts.callbacks.onConnection?.('connected');
  }

  /** The peer-to-peer host's door (lock, password) as last set here. */
  private p2pDoor = { locked: false, passworded: false };

  /** A peer-to-peer host's administration: the match is here, the door is the hub's. */
  private async p2pHostAdmin(
    net: typeof import('../net/client'),
    host: P2pHostController,
    conn: ListenConnection,
    action: RoomAdminPayload,
  ): Promise<string | null> {
    switch (action.action) {
      case 'kick':
        host.kick(action.playerId);
        return null;
      case 'transfer': {
        // Hand the match to that member and come back as one of its players.
        const ok = await host.transfer(action.playerId);
        if (!ok) {
          this.notice('transfer-failed');
          return 'transfer-failed';
        }
        const code = host.code;
        conn.stop();
        this.worker?.terminate();
        this.worker = null;
        if (code) {
          this.resetNetState();
          void this.connectP2pJoin(code, {}).catch((e) => this.fail(e));
        }
        return null;
      }
      case 'changelevel':
        conn.changeLevel(action.map);
        return null;
      case 'say':
        host.serverSay(action.text);
        return null;
      case 'lock':
        this.p2pDoor.locked = action.locked;
        net.tf2.roomAdmin(action);
        return null;
      case 'password':
        this.p2pDoor.passworded = action.password !== '';
        net.tf2.roomAdmin(action);
        return null;
    }
  }

  /** Member: the hub introduces us to the host; the game runs over the DataChannels. */
  private async connectP2pJoin(code: string, joinOpts: P2pJoinOptions): Promise<void> {
    const net = await import('../net/client');
    const { P2pJoinController } = await import('./net/p2p-join');
    if (this.disposed) return;
    this.role = 'p2p-member';
    await net.connectTf2({
      onStatus: (status) => {
        if (status !== 'connected' && !this.joined) this.opts.callbacks.onConnection?.(status === 'connecting' ? 'connecting' : 'reconnecting');
      },
    });
    if (this.disposed) return;
    const join = new P2pJoinController(
      net,
      code,
      {
        onAdmitted: (info) => {
          this.roomMode = info.mode;
          this.netTrace('admitted');
          this.opts.callbacks.onRoom?.(code);
        },
        onConnection: (type) => this.netTrace(`connection ${type}`),
        onJoined: (j) => {
          this.netTrace(`joined ${j.code} ${j.playerId}`);
          this.connected = true;
          this.opts.callbacks.onConnection?.('connected');
          this.onJoined(j);
        },
        onSnapshot: (d) => this.onSnapshot(d),
        onEvents: (d) => this.onReliable(d),
        onChat: (m) => this.log.onChat(m, this.clientNow),
        onPeers: (rows) => this.onPeerRows(rows),
        onReconnecting: () => {
          this.netTrace('reconnecting');
          this.connected = false;
          this.opts.callbacks.onConnection?.('reconnecting');
        },
        onMigrating: (hostName) => {
          this.netTrace(`migrating ${hostName}`);
          // The match moves to another member: whatever this client knew of the old host's stream goes.
          this.resetNetState();
          this.connected = false;
          this.opts.callbacks.onConnection?.('reconnecting');
          this.notice('migrating', hostName);
          this.pendingMigration = hostName;
        },
        onPromoted: (hosted, previousHost, checkpoint) => {
          this.netTrace(`promoted ${checkpoint ? checkpoint.byteLength : 'no checkpoint'}`);
          void this.becomeHost(net, code, hosted, previousHost, checkpoint);
        },
        onEnded: (reason) => {
          this.netTrace(`ended ${reason}`);
          this.onP2pEnded(reason);
        },
      },
      { canHost: true, ...joinOpts },
    );
    this.transport = {
      online: true,
      input: (p) => join.sendInput(p),
      command: (c) => join.command(c),
      chat: (text, teamOnly) => join.chat(text, teamOnly),
      stop: () => join.stop(),
      pingMs: () => join.pingMs(),
      links: () => this.peerLinks,
      linkRows: () => this.peerStats,
      traffic: () => {
        const st = join.stats;
        return st ? { loss: st.trafficLoss, choke: st.trafficChoke, jitterMs: st.trafficJitterMs } : null;
      },
      p2p: () => ({
        role: 'member',
        code,
        connection: join.connectionType,
        connectMs: join.connectTimeMs,
        stats: join.stats,
        checkpoint: join.checkpointInfo,
        migrations: join.migrations,
      }),
    };
    join.start();
  }

  /** The new host's name while a migration is in progress (the notice when we are back in). */
  private pendingMigration: string | null = null;

  private onPeerRows(rows: PeerRow[]): void {
    this.peerLinks = new Map(rows.map((r) => [r.entity, r.link]));
    this.peerStats = new Map(rows.map((r) => [r.entity, { pingMs: r.pingMs, loss: r.loss }]));
  }

  /**
   * Host migration — the hub made this member the host: start the match from the previous host's
   * checkpoint in a listen-server worker of our own, on our seat, and open it to the others (the hub
   * is asking for them already). Without a checkpoint the match cannot go on.
   */
  private async becomeHost(
    net: typeof import('../net/client'),
    code: string,
    hosted: P2pHostedPayload,
    previousHost: string,
    checkpoint: Uint8Array | null,
  ): Promise<void> {
    const joined = this.joined;
    if (!checkpoint || !joined || this.disposed) {
      net.tf2.p2p.close();
      this.fail(new ClientFailure({ code: 'host-left', detail: 'the host left (no checkpoint to continue from)', retryable: false }));
      return;
    }
    const info = this.findMap(joined.map);
    if (!info) return;
    this.resetNetState();
    const name = this.snap.roster.get(this.snap.localEntity)?.name ?? hosted.hostName;
    const opts: MatchOptions = {
      matchId: 'LOCAL',
      map: info.name,
      ...this.profile.matchOptions(info),
      maxPlayers: joined.maxPlayers,
      botCount: 0,
      botDifficulty: 'normal',
      name: joined.name,
      seed: 1,
    };
    const room: P2pHostPayload = {
      ...this.roomGame(),
      map: info.name,
      mode: info.mode,
      maxPlayers: Math.min(joined.maxPlayers, TF2_LIMITS.P2P_MAX_PLAYERS),
      botCount: 0,
      botDifficulty: 'normal',
      name: joined.name,
    };
    const { P2pHostController } = await import('./net/p2p-host');
    if (this.disposed) return;
    this.startHosting(net, P2pHostController, room, opts, name, { hosted, checkpoint, localPlayerId: joined.playerId });
    this.notice('host-migrated', hosted.hostName);
    void previousHost;
    void code;
  }

  private onP2pEnded(reason: P2pJoinEnd): void {
    switch (reason) {
      case 'host-left':
        this.fail(new ClientFailure({ code: 'host-left', detail: 'the host left', retryable: false }));
        return;
      case 'kicked':
        this.fail(new ClientFailure({ code: 'kicked', detail: 'kicked by the host', retryable: false }));
        return;
      case 'auth-required':
        this.fail(new ClientFailure({ code: 'auth-required', detail: 'tf2:p2p:join', retryable: false }));
        return;
      case 'connection-lost':
      case 'relay-full':
        this.fail(new ClientFailure({ code: 'p2p-connect', detail: reason, retryable: true }));
        return;
      default:
        this.fail(new ClientFailure({ code: 'room', detail: reason, retryable: reason !== 'refused' }));
    }
  }

  /**
   * The match's stream starts over (a host migration): the snapshot mirror, interpolation and
   * prediction restart from the next full snapshot; the level stays loaded (same map).
   */
  private resetNetState(): void {
    this.snap.reset();
    this.interp = new InterpolationBuffer();
    this.records.clear();
    this.prediction = null;
    this.clientWorld = null;
    this.localPlayerSim = null;
    this.sender = new InputSender(this.sender.lastCommandNumber);
    this.clock.resync();
    this.ticks.reset();
    this.joined = null;
  }

  private notice(kind: HudNotice['kind'], name?: string): void {
    this.notices.push({ id: this.nextNoticeId++, at: this.clientNow, kind, ...(name ? { name } : {}) });
    while (this.notices.length > 4) this.notices.shift();
  }

  private onJoined(j: JoinedPayload): void {
    const first = !this.joined;
    const sameMatch = this.joined && this.joined.code === j.code && this.joined.playerId === j.playerId;
    this.joined = j;
    if (first) this.progress.finish('connect');
    if (this.pendingMigration !== null) {
      // Back in after a host migration, on our seat with the new host.
      this.notice('host-migrated', this.pendingMigration);
      this.pendingMigration = null;
    }
    if (!sameMatch) {
      // A new player in the match (first join or a reconnect): prediction and interpolation restart.
      this.prediction = null;
      this.localPlayerSim = null;
      this.clientWorld = null;
      this.sender = new InputSender(this.sender.lastCommandNumber);
      this.interp = new InterpolationBuffer();
      this.records.clear();
      this.log.reset();
    }
    if (!this.pkg || this.pkg.name !== j.map) void this.loadMap(j.map);
  }

  // ─── Loading ─────────────────────────────────────────────────────────────

  private async loadMap(map: string): Promise<void> {
    if (this.loadingMap === map) return;
    this.loadingMap = map;
    const core = this.core!;
    const wasRunning = this.running;
    this.running = false;
    this.loop?.stop();
    this.opts.callbacks.onPhase?.('loading');
    this.progress.title = this.findMap(map)?.title ?? map;
    try {
      this.teardownWorld();
      const assets = this.profile.assets;
      const pkg = await loadMapPackageForClient(assets, map, this.progress, this.abort.signal);
      if (this.disposed || this.loadingMap !== map) return;
      this.pkg = pkg;
      const loaded = pkg.loaded!;
      this.trace = wallTrace(loaded.collision);
      const textures = core.textureCache(assets);
      const models = new ModelLibrary({ url: (p) => gameAssetUrl(p, assets), loader: new Tf2GLTFLoader() });
      this.models = models;
      this.progress.begin('textures');
      const world = new WorldRenderer({
        bsp: pkg.bsp,
        manifest: pkg.manifest,
        game: assets,
        textures,
        models,
        sunVisible: this.sunVisible,
      });
      this.world = world;
      const ents = new EntityRenderer({
        lighting: world,
        scene: world.scene,
        models,
        particles: new ParticleLibrary((p) => gameAssetUrl(p, assets)),
        // Unlock weapons and cosmetics from the loadout builder's model channel (TF2's items).
        loadout: this.profile.itemCatalog ? new LoadoutModels() : null,
        game: assets,
        factory: this.profile.entityFactory,
        viewModelAttachment: this.profile.createViewModel ? (name, out) => this.gameViewModel?.attachment(name, out) ?? false : undefined,
        sunVisible: this.sunVisible,
        ragdollTrace: ragdollTrace(loaded.collision),
        gravity: this.gravity ?? this.profile.moveParams.gravity,
        trace: (a, b) => {
          const tr = emptyTrace();
          loaded.collision.traceLine(a, b, MASK_OPAQUE, null, tr);
          return { fraction: tr.fraction, endPos: { ...tr.endPos }, normal: { ...tr.plane.normal } };
        },
      });
      // The quality plan's particle budget, where the effect system exposes one.
      const fx = ents.effects as unknown as { maxLiveSystems?: number };
      if ('maxLiveSystems' in fx) fx.maxLiveSystems = core.plan.particleBudget;
      ents.viewModel.fov = this.settings.viewmodelFov;
      this.gameViewModel?.dispose();
      this.gameViewModel = this.profile.createViewModel?.(ents.effects) ?? null;
      this.gameViewModel?.setFov(this.settings.viewmodelFov);
      if (this.gravity !== null) ents.effects.gravity = this.gravity;
      this.ents = ents;
      // Texture progress: the cache's pending count against the most seen.
      let peak = 1;
      const tick = setInterval(() => {
        peak = Math.max(peak, textures.pending);
        this.progress.step('textures', peak - textures.pending, peak);
      }, 200);
      // Models: every body and arms the game shows, so nobody pops in.
      const classModels = this.profile.preloadModels();
      this.progress.begin('models', classModels.length);
      let doneModels = 0;
      const modelLoads = classModels.map((m) =>
        models.asset(m).finally(() => this.progress.step('models', ++doneModels, classModels.length)),
      );
      await Promise.all([world.whenLoaded(), Promise.all(modelLoads)]);
      clearInterval(tick);
      this.progress.finish('textures');
      this.progress.finish('models');
      if (this.disposed || this.loadingMap !== map) return;
      this.progress.begin('world');
      this.prediction = null;
      this.clientWorld = null;
      this.progress.finish('world');
      this.loadingMap = null;
      this.startLoop();
      void wasRunning;
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      this.loadingMap = null;
      this.fail(e);
    }
  }

  private sunVisible = (p: Vec3): boolean => {
    const s = this.world?.sun;
    const col = this.pkg?.loaded?.collision;
    if (!s || !col) return false;
    const tr = sunTrace;
    col.traceLine(p, { x: p.x + s.dir[0] * 16384, y: p.y + s.dir[1] * 16384, z: p.z + s.dir[2] * 16384 }, MASK_OPAQUE, null, tr);
    return tr.fraction >= 1 || (tr.surfaceFlags & SURF_SKY) !== 0;
  };

  private occlusion = (from: Vec3, to: Vec3): boolean => {
    const col = this.pkg?.loaded?.collision;
    if (!col) return false;
    col.traceLine(from, to, MASK_OPAQUE, null, occTrace);
    return occTrace.fraction < 0.99;
  };

  private teardownWorld(): void {
    this.gameViewModel?.dispose();
    this.gameViewModel = null;
    this.ents?.dispose();
    this.ents = null;
    this.world?.dispose();
    this.world = null;
    this.models = null;
    this.pkg = null;
    this.brushCache.clear();
    this.records.clear();
    this.loops?.stopAll();
    this.lateStarts.clear();
  }

  private startLoop(): void {
    if (this.disposed) return;
    this.running = true;
    this.ticks.reset();
    if (!this.loop) {
      this.loop = new GameLoop(
        (f) => this.frame(f),
        undefined,
        (paused) => {
          if (paused) this.audio?.onVisibility(true);
          else this.audio?.onVisibility(false);
        },
      );
    }
    this.loop.start();
    this.opts.callbacks.onPhase?.('running');
  }

  // ─── Network input ───────────────────────────────────────────────────────

  private onReliable(bytes: Uint8Array): void {
    const r = this.snap.onReliable(bytes);
    if (!r) return;
    for (const m of r.messages) {
      if (m.kind === 'hello' && this.pkg && m.map !== this.pkg.name && this.loadingMap !== m.map) {
        // The server changed level.
        void this.loadMap(m.map);
      }
    }
    for (const e of r.events) this.queueEvent(e);
    // Snapshots that arrived ahead of their string definitions (peer-to-peer: two channels).
    for (const held of this.snap.takeDeferred()) this.onSnapshot(held);
  }

  private onSnapshot(bytes: Uint8Array): void {
    const now = performance.now();
    const s = this.snap.onSnapshot(bytes);
    if (!s) return;
    this.clock.onSnapshot(s.tick, now);
    const t = s.tick * TICK_INTERVAL;
    const present = new Set<number>();
    for (const st of s.frame.states) {
      if (keyKind(st.key) !== 'entity') continue;
      present.add(st.key);
      this.interp.push(t, st);
    }
    for (const key of this.records.keys()) {
      if (!present.has(key)) {
        this.records.delete(key);
        this.interp.remove(key);
      }
    }
    for (const e of s.cosmetic) this.queueEvent(e);
    this.ensurePrediction();
    const me = this.snap.localPlayer();
    if (this.prediction && me) {
      this.prediction.reconcile(
        { tick: s.tick, ackCmd: s.ackCmd, player: me, weapons: this.snap.localWeapons(), rules: this.snap.rules() },
        now,
      );
    }
  }

  private ensurePrediction(): void {
    if (this.prediction || !this.pkg || !this.snap.hello || this.snap.localEntity < 0) return;
    const info = this.findMap(this.pkg.name) ?? { name: this.pkg.name, title: this.pkg.name, mode: 'ctf' as RoomMode };
    const world = this.profile.createWorld(
      { map: this.pkg.loaded, options: { isServer: false, lagCompensation: false, seed: this.snap.hello.seed } },
      info,
    );
    const player = world.addPlayer(this.snap.roster.get(this.snap.localEntity)?.name ?? 'me');
    this.clientWorld = world;
    this.localPlayerSim = player;
    if (this.gravity !== null) {
      player.moveCtx.params = { ...this.profile.moveParams, gravity: this.gravity };
      world.gravity = this.gravity;
    }
    this.prediction = new Prediction(world, player, { onEvent: (e) => this.onPredicted(e), restore: this.profile.restorePlayer });
  }

  private onPredicted(e: PredictedSound | PredictedEffect): void {
    const local = this.snap.localEntity;
    const simId = this.localPlayerSim?.id;
    if (e.type === 'sound') {
      // Our own sounds are ours; a sound at a bare position stays positional (not "local").
      const ent = e.opts.entity === simId ? local : e.opts.entity;
      this.audio?.emit({ name: e.name, entity: ent, pos: e.opts.pos, volume: e.opts.volume, pitch: e.opts.pitch, channel: e.opts.channel });
    } else {
      const fx = { ...e.effect, type: 'effect' as const };
      if (fx.entity === simId) fx.entity = local;
      this.pendingEvents.push(fx);
    }
  }

  private queueEvent(e: TimedEvent): void {
    // Console replies and replicated cvars are the console's.
    if (this.console?.serverEvent(e.event)) return;
    const ev = e.event;
    const local = this.snap.localEntity;
    const me = this.snap.localPlayer();
    const r = ev as { to?: number; notTo?: number; team?: number };
    if (r.to !== undefined && r.to !== local) return;
    if (r.notTo !== undefined && r.notTo === local) return;
    if (ev.type === 'sound') {
      if (r.team !== undefined && r.team !== num(me, 'team')) return;
      // Stops are reliable and go out ahead of the snapshot a start rides in: a start older than
      // the stop that ended it would otherwise loop forever.
      if (ev.stop) this.lateStarts.stopped(ev.entity, ev.name, e.tick);
      if (ev.stop || this.lateStarts.admits(ev.entity, ev.name, e.tick))
        this.audio?.emit({ name: ev.name, entity: ev.entity, pos: ev.pos, volume: ev.volume, pitch: ev.pitch, channel: ev.channel, stop: ev.stop, soundlevel: ev.soundlevel });
    } else if (ev.type === 'teleport') {
      this.interp.teleported(ev.player);
    }
    if (ev.type === 'death' && ev.victim === local) {
      const rec = this.records.get(local) ?? me;
      const corpse = this.prediction ? { ...this.prediction.player.origin } : { x: num(rec, 'ox'), y: num(rec, 'oy'), z: num(rec, 'oz') };
      this.view.onLocalDeath(this.clientNow, ev.attacker > 0 && ev.attacker !== local ? ev.attacker : -1, corpse, this.viewAngles);
    }
    this.pendingEvents.push(ev);
    const src = this.hudSource();
    this.log.onEvent(ev, { now: this.clientNow, localEntity: local, lookup: playerLookup(src) });
  }

  private hudSource(): HudSource {
    return hudSourceFromSnapshot(this.snap, this.serverTime);
  }

  // ─── HUD commands ────────────────────────────────────────────────────────

  private onHudCommand(c: HudCommand): void {
    const t = this.transport;
    if (c.kind === 'disconnect') {
      this.opts.callbacks.onExit?.();
      return;
    }
    if (!t) return;
    switch (c.kind) {
      case 'pause':
        // Offline play pauses (the pause menu, the in-game HUD editor); online play goes on.
        if (t.pause && c.paused !== this.offlinePaused) {
          this.offlinePaused = c.paused;
          t.pause(c.paused);
          // The match holds on the tick it stopped on and resumes from it: hold the render clock with it and
          // rebase it on resume, keeping the prediction (its pending commands are still the server's next
          // ones) — restarting either would snap the view on resume.
          if (c.paused) this.clock.hold(performance.now());
          else {
            this.clock.release(performance.now());
            this.ticks.reset();
          }
        }
        break;
      case 'team':
        t.command({ kind: 'team', team: c.team });
        break;
      case 'class':
        t.command({ kind: 'class', cls: c.cls });
        break;
      case 'chat':
        t.chat(c.text, c.teamOnly);
        break;
      case 'voice':
        t.command({ kind: 'voice', menu: c.menu, item: c.item });
        break;
      case 'build':
        t.command({ kind: 'extra', command: c.action, args: [c.objectType, c.objectMode] });
        break;
      case 'disguise':
        t.command({ kind: 'extra', command: 'disguise', args: [c.cls, c.team] });
        break;
      case 'lastdisguise':
        t.command({ kind: 'extra', command: 'lastdisguise', args: [] });
        break;
      case 'extra':
        t.command({ kind: 'extra', command: c.command, args: c.args });
        break;
      case 'loadout':
        t.command({ kind: 'loadout', cls: c.cls, slots: c.slots });
        break;
      case 'admin':
        void this.admin(c.action);
        break;
      default:
        break;
    }
  }

  /** Room administration (the pause menu's Server view, the console). Prints why when it cannot. */
  private async admin(action: RoomAdminPayload): Promise<boolean> {
    const t = this.transport;
    if (action.action === 'changelevel' && t?.changeLevel && !t.admin) {
      // Offline: the listen server is ours.
      t.changeLevel(action.map);
      return true;
    }
    const err = t?.admin ? await t.admin(action) : 'not-owner';
    if (err) {
      this.console?.console.print(
        err === 'not-owner'
          ? `${action.action}: only the room's owner (or the peer-to-peer host) can do that`
          : err === 'transfer-failed'
            ? 'That player cannot host (they need a direct or TURN connection, and to allow it).'
            : `${action.action}: ${err}`,
        'error',
      );
      return false;
    }
    return true;
  }

  // ─── The frame ───────────────────────────────────────────────────────────

  private frame(f: FrameInfo): void {
    if (!this.running || !this.core || !this.world || !this.ents || !this.inputCore) return;
    const core = this.core;
    const input = this.inputCore.input;
    const dt = f.dt;
    this.clientNow += dt;
    core.sample(f.rawMs);
    this.fps.sample(f.rawMs);
    this.inputCore.poll(dt);
    for (const a of drainImpulses(input)) this.store.dispatchImpulse(a);

    // Look every frame (smooth at any refresh rate); the commands carry the angles.
    applyLook(input, this.viewAngles, this.settings);
    input.mouseDx = input.mouseDy = input.lookYaw = input.lookPitch = 0;

    this.serverTime = this.clock.isSynced ? this.clock.serverTime(f.now) : 0;
    const renderTime = this.serverTime - this.clock.interp;
    const me = this.snap.localPlayer();
    const local = this.snap.localEntity;
    const alive = !!me && num(me, 'lifeState') === LIFE_ALIVE;
    const team = num(me, 'team');
    const spectator = !me || team === TEAM_SPECTATOR || team === TEAM_UNASSIGNED;

    // The join menus and cursor panels (the buy menu) take the mouse: give the pointer back while one is up.
    const joining = !!me && (team === TEAM_UNASSIGNED || (team >= 2 && num(me, 'cls') === 0));
    if ((joining || input.cursor) && this.inputCore.km.locked) this.inputCore.km.unlock();

    // Spectator / death buttons (spec_next, spec_mode).
    const buttons = heldButtons(input);
    const pressed = buttons & ~this.lastButtons;
    this.lastButtons = buttons;
    if (!alive && !input.menuOpen && !input.suspended) {
      if (pressed & (IN_ATTACK | IN_ATTACK2)) this.view.nextTarget(this.viewFrameTargets());
      if (spectator && pressed & IN_JUMP) this.view.cycleMode();
    }

    // Ticks: build, predict, send.
    const t0 = performance.now();
    // host_timescale (a listen server's cheat, replicated): the client's ticks run at the server's pace.
    const n = this.offlinePaused ? 0 : this.ticks.advance(dt * this.timescale);
    for (let i = 0; i < n; i++) this.tick(Math.floor(this.serverTime / TICK_INTERVAL) + i);

    const t1 = performance.now();
    this.fps.phase('sim', t1 - t0);
    // Other entities at render time; the local player from prediction.
    this.buildRenderStates(renderTime, f.now);

    // View.
    const pred = this.prediction;
    const pp = pred?.player;
    // The game's zoom and punch (CS:GO's scopes and aim punch); TF2's sniper zoom otherwise.
    const gv = alive ? this.profile.view?.(pp ?? null, me ?? null) : undefined;
    const zoomed = gv ? gv.zoomFov > 0 || !!gv.hideViewModel : !!pp && alive && pp.cond.has(TF_COND.ZOOMED);
    this.fov.set(gv ? gv.zoomFov : zoomed ? TF_WEAPON_ZOOM_FOV : 0, gv ? gv.zoomRate : TF_ZOOM_RATE, this.clientNow);
    const origin = pred ? pred.renderOrigin(f.now, tmpOrigin) : { x: num(me, 'ox'), y: num(me, 'oy'), z: num(me, 'oz') };
    const taunting = !!pp && pp.cond.has(TF_COND.TAUNTING);
    const view = this.view.update({
      now: this.clientNow,
      frametime: dt,
      alive,
      spectator,
      first: {
        origin,
        viewOffsetZ: pp ? pp.move.viewOffsetZ : this.profile.eyeHeight(me ?? null),
        angles: this.viewAngles,
        velocity: pp ? pp.move.velocity : ZERO,
        punch: pp ? (gv?.punch ? addPunch(pp.move.punchAngle, gv.punch) : pp.move.punchAngle) : ZERO,
        onStaticGround: !!pp && (pp.move.flags & FL_ONGROUND) !== 0,
        frametime: dt,
      },
      viewAngles: this.viewAngles,
      roamOrigin: origin,
      player: (id) => this.viewTarget(id),
      pickTarget: (after) => this.pickTarget(after, team),
      fov: this.fov.current(this.clientNow),
      thirdPerson: taunting || this.thirdPersonCheat,
      trace: this.trace ?? noTrace,
    });
    const cam = core.cam;
    cam.set({ origin: view.origin, angles: view.angles, fov: view.fov });
    if (core.aspect !== cam.camera.aspect) cam.setAspect(core.aspect);

    // Entities.
    const ents = this.ents;
    ents.beginFrame({ time: renderTime, dt, localPlayer: local, localTeam: team, firstPerson: !view.drawLocalBody, camera: cam.camera });
    ents.sync(this.renderStates);
    for (const ev of this.pendingEvents) ents.handleEvent(ev);
    this.pendingEvents.length = 0;
    const weapon = pp?.activeWeapon() as (ReturnType<Player['activeWeapon']> & { vmActivity?: number; vmActivitySeq?: number }) | null;
    // A game's own view model (CS:GO) draws instead of TF2's.
    this.gameViewModel?.update(
      alive && pp && view.drawViewModel ? pp : null,
      me ?? null,
      {
        eyeOrigin: view.origin,
        eyeAngles: view.angles,
        velocity: pp ? pp.move.velocity : ZERO,
        dt,
        visible: !zoomed && (this.console?.console.drawViewModel.bool ?? true),
      },
      ents.context,
    );
    ents.updateViewModel(
      !this.gameViewModel && alive && pp && view.drawViewModel
        ? {
            cls: num(me, 'cls'),
            team,
            defindex: weapon?.defindex ?? -1,
            vmActivity: weapon?.vmActivity ?? 0,
            vmActivitySeq: weapon?.vmActivitySeq ?? 0,
            eyeOrigin: view.origin,
            eyeAngles: view.angles,
            velocity: pp.move.velocity,
            visible: !zoomed && (this.console?.console.drawViewModel.bool ?? true),
            invis: this.vmInvis(pp, dt),
            uber: pp.cond.has(TF_COND.INVULNERABLE),
            crit: CRIT_BOOST_CONDS.some((c) => pp.cond.has(c)),
            item: decodeItemsCached(pp.items).weapons.find((w) => w.item === weapon?.defindex && !w.worn),
          }
        : null,
    );
    ents.endFrame();

    const t2 = performance.now();
    this.fps.phase('entities', t2 - t1);
    // World.
    const world = this.world;
    this.culler.restore();
    world.update(cam, this.clientNow);
    this.culler.cull(world.props?.group, cam.camera, core.plan.propDrawDistance, SOURCE_UNIT);
    world.render(core.renderer, cam);
    if (this.gameViewModel) this.gameViewModel.render(core.renderer, cam);
    else ents.renderViewModel(core.renderer, cam);

    this.fps.phase('render', performance.now() - t2);
    // Audio.
    if (this.audio) {
      this.audio.setLocalEntity(local >= 0 ? local : null);
      this.audio.setListener(view.origin, view.angles);
      this.updateLoops(local, pp ?? null);
      this.audio.update();
    }

    // HUD.
    this.hudAcc += dt;
    if (this.hudAcc >= 1 / HUD_HZ) {
      this.hudAcc = 0;
      const state = buildHudState(this.hudSource(), this.log, { game: this.game, now: this.clientNow, connected: this.connected, fps: this.fps.fps });
      if (this.profile.decorateHud) {
        const snap = this.snap;
        this.profile.decorateHud(state, this.prediction?.player ?? null, {
          serverTime: this.serverTime,
          entities: (type) => {
            const out: NetRecord[] = [];
            snap.forEachEntity((st, rec) => {
              if (st.schema.type === type) out.push(rec);
            });
            return out;
          },
          me: snap.localPlayer(),
          weapons: snap.localWeapons(),
        });
      }
      const links = this.transport?.links?.();
      if (links && links.size > 0) {
        // Peer-to-peer: how each human reaches the host, their round trip to it and their loss (the ping column).
        const rows = this.transport?.linkRows?.();
        for (const row of state.scoreboard) {
          if (row.bot) continue;
          row.link = links.get(row.id);
          const st = rows?.get(row.id);
          if (st?.pingMs !== undefined && row.link !== 'host') row.ping = st.pingMs;
          if (st?.loss !== undefined) row.loss = st.loss;
        }
      }
      // Network notices (host migration, hosting), each for a few seconds.
      this.notices = this.notices.filter((n) => this.clientNow - n.at < NOTICE_SECONDS);
      if (this.notices.length) state.notices = [...this.notices];
      state.admin = this.transport?.adminView?.() ?? (this.role === 'offline' && this.transport ? this.offlineAdminView() : null);
      this.store.publish(state);
    }
    if (alive !== this.lastSpawnedAlive) this.lastSpawnedAlive = alive;
    // The console after the frame is drawn (its screenshot reads this frame), fps_max for the next.
    if (this.loop) this.loop.maxFps = this.fpsMax;
    this.console?.frame();
  }

  /** The view model's cloak, faded like the body's (tf_spy_invis_time 1 s in, 2 s out). */
  private invis = 0;
  private vmInvis(p: Player, dt: number): number {
    const blink = p.cond.has(TF_COND.STEALTHED_BLINK);
    const target = blink ? 0.4 : p.cond.has(TF_COND.STEALTHED) ? 1 : 0;
    this.invis = this.invis < target ? Math.min(target, this.invis + dt / 1) : Math.max(target, this.invis - dt / 2);
    return this.invis;
  }

  private tick(tickCount: number): void {
    const t = this.transport;
    const input = this.inputCore?.input;
    if (!t || !input) return;
    const ctx = this.weaponContext();
    const cmd = this.sender.createCommand(tickCount, (c) => Object.assign(c, buildUserCmd(input, this.viewAngles, this.settings, ctx)));
    this.prediction?.addCommand(cmd);
    const packet = this.sender.packet(this.snap.ackTick, Math.round(this.clock.interp / TICK_INTERVAL));
    if (packet) {
      t.input(packet);
      this.console?.netOut(packet.byteLength);
    }
  }

  private weaponContext(): WeaponContext | undefined {
    const ws = this.snap.localWeapons();
    if (!ws.length) return undefined;
    const me = this.snap.localPlayer();
    return {
      slots: ws.map((w) => w.slot + 1).sort((a, b) => a - b),
      active: num(me, 'activeSlot') + 1,
      last: num(me, 'lastSlot') + 1,
    };
  }

  /**
   * Every player's weapon loop from replicated state (C_TFMinigun::WeaponSoundUpdate's way): ours
   * from the predicted weapon, everyone else's from their record's `weaponLoop`. A player who is
   * gone, dead or switched weapon is silenced on this frame whatever packets were lost. Remote
   * state is the newest snapshot's (OnDataChanged's, like the sound events), not the interpolated
   * one, so the loop keeps time with the shots it belongs to.
   */
  private updateLoops(local: number, predicted: Player | null): void {
    const loops = this.loops;
    if (!loops) return;
    const wants = this.loopWants;
    wants.length = 0;
    this.snap.forEachEntity((st: NetEntityState, rec: NetRecord) => {
      if (!isPlayerType(st.schema.type)) return;
      if (st.key === local && predicted) {
        wants.push([st.key, predicted.weaponLoopSound()]);
        return;
      }
      const name = rec.weaponLoop;
      wants.push([st.key, typeof name === 'string' && num(rec, 'lifeState') === LIFE_ALIVE ? name : '']);
    });
    loops.update(wants, this.clientNow);
  }

  private buildRenderStates(renderTime: number, nowMs: number): void {
    const out: RenderEntity[] = [];
    const local = this.snap.localEntity;
    this.entityPos.clear();
    this.snap.forEachEntity((st: NetEntityState) => {
      let rec = this.records.get(st.key);
      if (!rec) {
        rec = {};
        this.records.set(st.key, rec);
      }
      if (this.interp.sample(st.key, renderTime, rec) === 'none') Object.assign(rec, this.snap.record(st));
      const type = st.schema.type;
      if (type === 'brush') {
        this.applyBrush(rec);
        // Doors, trains and lifts sound from their middle, and follow it while they move.
        const m = this.pkg?.bsp.models[num(rec, 'bspModel')];
        this.entityPos.set(st.key, {
          x: num(rec, 'ox') + (m ? (m.mins.x + m.maxs.x) * 0.5 : 0),
          y: num(rec, 'oy') + (m ? (m.mins.y + m.maxs.y) * 0.5 : 0),
          z: num(rec, 'oz') + (m ? (m.mins.z + m.maxs.z) * 0.5 : 0),
        });
        return;
      }
      if (st.key === local && isPlayerType(type)) {
        // The local player: predicted position, our own view angles.
        const own = { ...this.snap.record(st) };
        const pred = this.prediction;
        if (pred) {
          const o = pred.renderOrigin(nowMs, tmpLocal);
          own.ox = o.x;
          own.oy = o.y;
          own.oz = o.z;
          own.ducked = pred.player.move.ducked;
          own.vx = pred.player.move.velocity.x;
          own.vy = pred.player.move.velocity.y;
          own.vz = pred.player.move.velocity.z;
        }
        own.eyePitch = this.viewAngles.x;
        own.eyeYaw = this.viewAngles.y;
        own.yaw = this.viewAngles.y;
        out.push({ id: st.key, type, fields: own });
        this.entityPos.set(st.key, { x: num(own, 'ox'), y: num(own, 'oy'), z: num(own, 'oz') + 48 });
        return;
      }
      out.push({ id: st.key, type, fields: rec });
      this.entityPos.set(st.key, { x: num(rec, 'ox'), y: num(rec, 'oy'), z: num(rec, 'oz') });
    });
    this.interp.prune(renderTime);
    this.renderStates = out;
  }

  /** Moves a networked brush entity (doors, trains) — only when it moved; visibility only when EF_NODRAW flips. */
  private applyBrush(rec: NetRecord): void {
    const world = this.world;
    const model = num(rec, 'bspModel');
    if (!world || model <= 0) return;
    const ox = num(rec, 'ox');
    const oy = num(rec, 'oy');
    const oz = num(rec, 'oz');
    const p = num(rec, 'pitch');
    const y = num(rec, 'yaw');
    const r = num(rec, 'roll');
    const nodraw = (num(rec, 'effects') & EF_NODRAW) !== 0;
    const c = this.brushCache.get(model);
    if (!c || c.ox !== ox || c.oy !== oy || c.oz !== oz || c.p !== p || c.y !== y || c.r !== r) {
      world.setEntityTransform(model, { x: ox, y: oy, z: oz }, { x: p, y, z: r });
    }
    if (c && c.nodraw !== null && c.nodraw !== nodraw) world.setVisible(model, !nodraw);
    this.brushCache.set(model, { ox, oy, oz, p, y, r, nodraw: c ? nodraw : nodraw });
  }

  private viewTarget(id: number): ViewTarget | null {
    if (id < 0) return null;
    const rec = this.records.get(id);
    if (!rec) return null;
    const ducked = !!rec.ducked;
    const eyeZ = ducked ? VEC_DUCK_VIEW_Z : this.profile.eyeHeight(rec);
    return {
      id,
      eye: { x: num(rec, 'ox'), y: num(rec, 'oy'), z: num(rec, 'oz') + eyeZ },
      angles: { x: num(rec, 'eyePitch'), y: num(rec, 'eyeYaw'), z: 0 },
      alive: num(rec, 'lifeState') === LIFE_ALIVE,
    };
  }

  /** The next living player after `after`: teammates first (mp_forcecamera), anyone when spectating. */
  private pickTarget(after: number, team: number): number {
    const ids: number[] = [];
    for (const s of this.renderStates) {
      if (!isPlayerType(s.type) || s.id === this.snap.localEntity) continue;
      if (num(s.fields, 'lifeState') !== LIFE_ALIVE) continue;
      if (team >= 2 && num(s.fields, 'team') !== team) continue;
      ids.push(s.id);
    }
    if (!ids.length) return -1;
    ids.sort((a, b) => a - b);
    return ids.find((id) => id > after) ?? ids[0];
  }

  private viewFrameTargets() {
    const me = this.snap.localPlayer();
    return { pickTarget: (after: number) => this.pickTarget(after, num(me, 'team')) } as Parameters<ViewController['nextTarget']>[0];
  }

  // ─── Control ─────────────────────────────────────────────────────────────

  async lockPointer(): Promise<boolean> {
    return (await this.inputCore?.km.lock()) ?? false;
  }

  unlockPointer(): void {
    this.inputCore?.km.unlock();
  }

  setSettings(s: GameSettings): void {
    this.settings = s;
    this.fov.setDefault(s.fov);
    if (this.ents) this.ents.viewModel.fov = s.viewmodelFov;
    this.gameViewModel?.setFov(s.viewmodelFov);
    if (this.audio) applyVolumes(this.audio, s);
  }

  stats(): ClientStats {
    const w = this.world?.stats;
    return {
      fps: this.fps.fps,
      frameMs: this.core?.frameMs ?? 0,
      resolutionScale: this.core?.governor.scale ?? 1,
      tier: this.core?.plan.tier ?? 'desktop',
      drawCalls: w?.drawCalls ?? 0,
      triangles: w?.triangles ?? 0,
      entities: this.ents?.count ?? 0,
      pingMs: this.transport?.pingMs() ?? null,
      phases: { ...this.fps.phases },
    };
  }

  /** Hosting peer-to-peer: the members' seats (null when this client is not a P2P host). */
  p2pSeats(): SeatInfo[] | null {
    return this.transport?.seats ? this.transport.seats() : null;
  }

  /** Hosting peer-to-peer: remove a member (refused for the rest of the room's life). */
  kickPlayer(playerId: number): void {
    this.transport?.kick?.(playerId);
  }

  /** Diagnostics for the smoke script (window.__tf2 in dev). */
  debug() {
    const me = this.snap.localPlayer();
    return {
      localEntity: this.snap.localEntity,
      team: num(me, 'team'),
      cls: num(me, 'cls'),
      alive: !!me && num(me, 'lifeState') === LIFE_ALIVE,
      origin: this.prediction ? { ...this.prediction.player.origin } : null,
      viewMode: this.view.mode,
      entities: this.renderStates.length,
      snapshots: this.snap.stats.snapshots,
      misprediction: this.prediction?.maxMisprediction ?? 0,
      stats: this.stats(),
      p2p: this.transport?.p2p?.() ?? null,
      role: this.role,
      joined: this.joined ? { code: this.joined.code, playerId: this.joined.playerId } : null,
      netLog: [...this.netLog],
      connected: this.connected,
      commands: this.sender.lastCommandNumber,
      notices: this.notices.map((n) => ({ kind: n.kind, name: n.name ?? null })),
      timescale: this.timescale,
      /** Every player this client draws, where it draws them (the smoke tests watch others move). */
      players: this.renderStates
        .filter((r) => isPlayerType(r.type))
        .map((r) => ({ id: r.id, x: num(r.fields, 'ox'), y: num(r.fields, 'oy'), z: num(r.fields, 'oz'), alive: num(r.fields, 'lifeState') === LIFE_ALIVE })),
    };
  }

  // ─── Developer console ───────────────────────────────────────────────────

  /** What the console reads and drives here (lib/tf2-game/console/game-console.ts ConsoleHost). */
  private consoleHost(): ConsoleHost {
    const kind = this.opts.session.kind;
    return {
      // The role can change mid-match (a member promoted to host by a migration).
      authority: () => (this.role === 'p2p-member' ? 'remote' : 'listen'),
      stats: () => this.stats(),
      netCounters: () => {
        const st = this.snap.stats;
        if (!this.snap.hello) return null;
        // Peer-to-peer: loss, choke and jitter from the host's snapshots' own sequence numbers.
        const traffic = this.transport?.traffic?.() ?? null;
        return {
          inBytes: st.snapshotBytes + st.reliableBytes,
          inPackets: st.snapshots + st.reliablePackets,
          snapshots: st.snapshots,
          newestTick: this.snap.ackTick,
          snapshotInterval: this.snap.hello.snapshotInterval,
          ...(traffic ? { lossPct: traffic.loss * 100, chokePct: traffic.choke * 100, jitterMs: traffic.jitterMs } : {}),
        };
      },
      admin: (action) => this.admin(action),
      isAdmin: () => !!this.transport?.adminView?.() || this.role === 'offline',
      players: () => this.adminPlayers(),
      entityIndex: () => this.entityIndex(),
      canvas: () => this.opts.canvas,
      hudRoot: () => this.opts.canvas.parentElement?.querySelector<HTMLElement>('.tf2g-hud') ?? null,
      mapName: () => this.pkg?.name ?? this.profile.id,
      setFpsMax: (fps) => (this.fpsMax = fps),
      setThirdPerson: (on) => (this.thirdPersonCheat = on),
      setViewAngles: (a) => {
        this.viewAngles.x = Math.max(-89, Math.min(89, a.x));
        this.viewAngles.y = a.y;
        this.viewAngles.z = 0;
      },
      position: () => {
        const p = this.prediction?.player;
        return p ? { origin: { ...p.origin }, angles: { ...this.viewAngles }, velocity: { ...p.move.velocity } } : null;
      },
      applyReplicated: (name, value) => {
        if (name === 'host_timescale') {
          const v = Number(value);
          this.timescale = Number.isFinite(v) ? Math.min(10, Math.max(0.1, v)) : 1;
          this.clock.setRate(this.timescale);
          return;
        }
        if (name !== 'sv_gravity') return;
        const g = Number(value);
        const base = this.profile.moveParams;
        this.gravity = Number.isFinite(g) && g !== base.gravity ? g : null;
        if (this.localPlayerSim)
          this.localPlayerSim.moveCtx.params =
            this.gravity === null ? undefined : { ...base, gravity: this.gravity };
        // What falls on this side too: the predicting world's projectiles and the renderer's gibs and ragdolls.
        const grav = this.gravity ?? this.profile.moveParams.gravity;
        if (this.clientWorld) this.clientWorld.gravity = grav;
        if (this.ents) {
          this.ents.effects.gravity = grav;
          this.ents.context.gravity = grav;
        }
      },
      // changelevel: the listen server (offline, a P2P host) or the hub room's owner moves the match;
      // every client then reloads the level from the new `hello` — one path for all three.
      changeLevel: (map) => {
        const t = this.transport;
        if (!t?.changeLevel) return false;
        if (t.admin) void this.admin({ action: 'changelevel', map });
        else t.changeLevel(map);
        return true;
      },
      retry: () => {
        if (kind === 'offline') this.restartOffline();
      },
    };
  }

  /** Offline: the administration view (the map; nobody to kick). */
  private offlineAdminView(): HudAdmin {
    return { role: 'host', online: false, map: this.pkg?.name ?? this.sessionMap() ?? '', locked: false, passworded: false, players: [] };
  }

  /** The room's players by name and id, for the console's `kick` (the admin view's list). */
  private adminPlayers(): Array<{ id: number; name: string }> {
    return (this.transport?.adminView?.()?.players ?? []).filter((p) => !p.self).map((p) => ({ id: p.id, name: p.name }));
  }

  /**
   * Entity names, classnames and inputs for `ent_fire`'s completion: the map's own entity lump (the
   * level this client loaded — snapshots carry no names) and the classes the simulation registers
   * (console/entity-complete.ts). Built once per level.
   */
  private entityIndex(): EntityIndex | null {
    const pkg = this.pkg;
    if (!pkg?.loaded) return null;
    if (this.entityIndexFor !== pkg) {
      this.entityIndexFor = pkg;
      this.entityIndexCache = indexFromLump(pkg.loaded.entities);
    }
    return this.entityIndexCache;
  }

  private entityIndexFor: LoadedPackage | null = null;
  private entityIndexCache: EntityIndex | null = null;

  /** Offline `retry`: a new listen server on the map being played (the client reloads the level from its hello). */
  private restartOffline(): boolean {
    const s = this.opts.session;
    const map = this.pkg?.name ?? this.sessionMap();
    if (s.kind !== 'offline' || this.disposed || !map || !this.findMap(map)) return false;
    try {
      this.transport?.stop();
    } catch {
      /* already closed */
    }
    this.transport = null;
    this.worker = null;
    this.joined = null;
    this.offlinePaused = false;
    this.snap.reset();
    this.clock.resync();
    this.connect(map);
    return true;
  }

  private fail(e: unknown): void {
    if (this.disposed) return;
    const info =
      e instanceof ClientFailure
        ? e.info
        : { code: 'unknown' as const, detail: e instanceof Error ? e.message : String(e), retryable: true };
    console.error('[tf2 client]', info.code, info.detail);
    this.running = false;
    this.loop?.stop();
    this.opts.callbacks.onError?.(info);
    this.opts.callbacks.onPhase?.('error');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.abort.abort();
    this.loop?.stop();
    this.loop = null;
    for (const u of this.unsubs) u();
    this.unsubs.length = 0;
    try {
      this.transport?.stop();
    } catch {
      /* already closed */
    }
    this.transport = null;
    // A P2P host's transport ends its worker itself, after the goodbyes.
    if (this.opts.session.kind !== 'p2p-host') this.worker?.terminate();
    this.worker = null;
    this.audio?.dispose();
    this.audio = null;
    this.teardownWorld();
    this.inputCore?.dispose();
    this.inputCore = null;
    this.core?.dispose();
    this.core = null;
    void this.clientWorld;
  }
}

export function createTf2Client(opts: Tf2ClientOptions): Tf2Client {
  return new Tf2Client(opts);
}

function num(r: NetRecord | null | undefined, k: string): number {
  const v = r?.[k];
  return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0;
}

const ZERO: Vec3 = Object.freeze({ x: 0, y: 0, z: 0 }) as Vec3;
const tmpOrigin = { x: 0, y: 0, z: 0 };
const tmpPunch = { x: 0, y: 0, z: 0 };
/** The movement's punch plus a game's (CS:GO's aim punch), in a scratch vector. */
function addPunch(a: Vec3, b: Vec3): Vec3 {
  tmpPunch.x = a.x + b.x;
  tmpPunch.y = a.y + b.y;
  tmpPunch.z = a.z + b.z;
  return tmpPunch;
}
const tmpLocal = { x: 0, y: 0, z: 0 };
const sunTrace = emptyTrace();
const occTrace = emptyTrace();
const noTrace = (_s: Vec3, e: Vec3, out: Vec3) => {
  out.x = e.x;
  out.y = e.y;
  out.z = e.z;
  return { fraction: 1 };
};
