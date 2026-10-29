/**
 * The TF2 game client: one match, online through the games hub or offline
 * against bots on a listen-server worker — the same bytes either way.
 *
 *   connect (hub: connectTf2 → create/join a room; offline: the listen worker)
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
 * Map changes (a new `hello` naming another map), reconnects (a new player id:
 * prediction and interpolation restart) and kicks are handled here; the play
 * page shows the loading screen and errors from the callbacks.
 *
 * Browser only.
 */

import { FL_ONGROUND, IN_ATTACK, IN_ATTACK2, IN_JUMP, MASK_OPAQUE, SURF_SKY, TEAM_SPECTATOR, TEAM_UNASSIGNED, TICK_INTERVAL, VEC_DUCK_VIEW_Z } from '../core/constants';
import { emptyTrace } from '../core/types';
import type { Vec3 } from '../core/vec';
import { CLASS_DATA } from '../data/classes';
import { findTf2Map, type Tf2Mode } from '../data/maps';
import { gameAssetUrl } from '../assets/urls';
import { SOURCE_UNIT } from '../render/coords';
import { WorldRenderer } from '../render/world-renderer';
import { decodeItemsCached } from '../sim/items/loadout';
import { EntityRenderer, LoadoutModels, ModelLibrary, ParticleLibrary, type EntityState as RenderEntity } from '../render/entities';
import { classEyeHeight } from '../sim/class-speeds';
import { CRIT_BOOST_CONDS, TF_COND } from '../sim/conditions';
import { LIFE_ALIVE, EF_NODRAW } from '../sim/entity';
import type { SimEvent } from '../sim/events';
import type { NetRecord } from '../sim/net-schema';
import { registerAllSimModules } from '../sim/register-all';
import { GameWorld } from '../sim/world';
import type { Player } from '../sim/player';
import { keyKind, type EntityState as NetEntityState } from '../net/snapshot';
import type { BotDifficulty, ChatMessage, CreateRoomPayload, JoinedPayload } from '../net/events';
import type { MatchCommand, MatchOptions } from '../server/match-host';
import type { AudioEngine } from '../audio/engine';
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
  wallTrace,
  type ClientMount,
  type ClientStats,
  type GameClient,
  type LoadedPackage,
} from './game-client';
import { FovState, TF_WEAPON_ZOOM_FOV, TF_ZOOM_RATE, ViewController, type ViewTarget } from './view';

export type Tf2Session =
  | {
      kind: 'offline';
      map: string;
      botCount: number;
      difficulty: BotDifficulty;
      maxPlayers: number;
      playerName: string;
    }
  | { kind: 'online-create'; room: CreateRoomPayload }
  | { kind: 'online-join'; code: string; playerName?: string };

export interface Tf2ClientOptions extends ClientMount {
  session: Tf2Session;
}

/** HUD updates per second (the store throttles too; building the state is the cost saved). */
const HUD_HZ = 20;

interface Transport {
  input(packet: Uint8Array): void;
  command(cmd: MatchCommand): void;
  /** Offline only: hold the listen server's match still. */
  pause?(paused: boolean): void;
  chat(text: string, teamOnly: boolean): void;
  stop(): void;
  readonly online: boolean;
  pingMs(): number | null;
}

export class Tf2Client implements GameClient {
  readonly game = 'tf2' as const;
  readonly store: HudStore;
  private settings: GameSettings;
  private readonly progress: ProgressTracker;
  private core: RenderCore | null = null;
  private inputCore: InputCore | null = null;
  private loop: GameLoop | null = null;
  private transport: Transport | null = null;
  private audio: AudioEngine | null = null;
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
      this.core = new RenderCore(this.opts.canvas, this.settings.quality, () =>
        this.fail(new ClientFailure({ code: 'context-lost', detail: 'WebGL context lost', retryable: true })),
      );
      this.inputCore = new InputCore(this.opts.inputTarget, 'tf2', () => this.settings, (l) => cb.onLockChange?.(l), this.opts.input);
      this.audio = createAudio(
        'tf2',
        this.settings,
        (id) => this.entityPos.get(id) ?? null,
        this.occlusion,
      );
      this.unsubs.push(this.audio.attach());
      this.unsubs.push(this.store.onCommand((c) => this.onHudCommand(c)));
      const title = this.sessionMap();
      if (title) this.progress.title = findTf2Map(title)?.title ?? title;
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

  private sessionMap(): string | null {
    const s = this.opts.session;
    return s.kind === 'offline' ? s.map : s.kind === 'online-create' ? s.room.map : null;
  }

  // ─── Transport ───────────────────────────────────────────────────────────

  private connect(): void {
    // Items beyond stock: prediction and rendering read the item schema (sim/items).
    void loadItemCatalog();
    const s = this.opts.session;
    if (s.kind === 'offline') {
      const info = findTf2Map(s.map);
      if (!info) throw new ClientFailure({ code: 'map-missing', detail: `unknown map ${s.map}`, retryable: false });
      const worker = new Worker(new URL('./net/listen-worker.ts', import.meta.url), { type: 'module', name: 'tf2-listen-server' });
      this.worker = worker;
      worker.onerror = (e) => this.fail(new ClientFailure({ code: 'map-failed', detail: `listen server: ${e.message}`, retryable: true }));
      const opts: MatchOptions = {
        matchId: 'LOCAL',
        map: s.map,
        mode: info.mode as Tf2Mode,
        maxPlayers: s.maxPlayers,
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
    void this.connectOnline(s).catch((e) =>
      this.fail(new ClientFailure({ code: 'network', detail: `games hub: ${e instanceof Error ? e.message : String(e)}`, retryable: true })),
    );
  }

  private async connectOnline(s: Extract<Tf2Session, { kind: 'online-create' | 'online-join' }>): Promise<void> {
    const net = await import('../net/client');
    if (this.disposed) return;
    await net.connectTf2({
      onStatus: (status) => {
        this.connected = status === 'connected';
        this.opts.callbacks.onConnection?.(status === 'connected' ? 'connected' : status === 'connecting' ? 'connecting' : status === 'reconnecting' ? 'reconnecting' : 'disconnected');
      },
      onJoined: (j) => this.onJoined(j),
      onSnapshot: (d) => this.onSnapshot(d),
      onEvents: (d) => this.onReliable(d),
      onChat: (m: ChatMessage) => this.log.onChat(m, this.clientNow),
      onKicked: (k) => this.fail(new ClientFailure({ code: 'kicked', detail: k.reason, retryable: k.reason !== 'room-closed' })),
      onError: (e) => {
        if (e.code === 'rate-limited' || e.code === 'not-in-room') return;
        if (this.joined && e.event !== 'tf2:room:create' && e.event !== 'tf2:room:join') return;
        this.fail(new ClientFailure({ code: 'room', detail: e.code, retryable: e.code === 'capacity' || e.code === 'unavailable' }));
      },
    });
    if (this.disposed) return;
    if (s.kind === 'online-create') net.tf2.createRoom(s.room);
    else net.tf2.joinRoom(s.code, s.playerName);
    this.transport = {
      online: true,
      input: (p) => void net.tf2.sendInput(p),
      command: (c) => {
        if (c.kind === 'team') net.tf2.team(c.team);
        else if (c.kind === 'class') net.tf2.playerClass(c.cls);
        else if (c.kind === 'voice') net.tf2.voice(c.menu, c.item);
        else if (c.kind === 'chat') net.tf2.chat(c.text, c.teamOnly);
        else if (c.kind === 'extra') net.tf2.extra(c.command, c.args);
        else if (c.kind === 'loadout') net.tf2.loadout(c.cls, c.slots);
      },
      chat: (text, teamOnly) => net.tf2.chat(text, teamOnly),
      stop: () => {
        net.tf2.leave();
        net.disconnectTf2();
      },
      pingMs: () => net.tf2.clock()?.rttMs ?? null,
    };
  }

  private onJoined(j: JoinedPayload): void {
    const first = !this.joined;
    const sameMatch = this.joined && this.joined.code === j.code && this.joined.playerId === j.playerId;
    this.joined = j;
    if (first) this.progress.finish('connect');
    if (this.transport?.online !== false && this.opts.session.kind !== 'offline') this.opts.callbacks.onRoom?.(j.code);
    if (!sameMatch) {
      // A new player in the match (first join or a reconnect): prediction and interpolation restart.
      this.prediction = null;
      this.localPlayerSim = null;
      this.clientWorld = null;
      this.sender = new InputSender();
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
    this.progress.title = findTf2Map(map)?.title ?? map;
    try {
      this.teardownWorld();
      const pkg = await loadMapPackageForClient('tf2', map, this.progress, this.abort.signal);
      if (this.disposed || this.loadingMap !== map) return;
      this.pkg = pkg;
      const loaded = pkg.loaded!;
      this.trace = wallTrace(loaded.collision);
      const textures = core.textureCache('tf2');
      const models = new ModelLibrary({ url: (p) => gameAssetUrl(p, 'tf2'), loader: new Tf2GLTFLoader() });
      this.models = models;
      this.progress.begin('textures');
      const world = new WorldRenderer({
        bsp: pkg.bsp,
        manifest: pkg.manifest,
        game: 'tf2',
        textures,
        models,
        sunVisible: this.sunVisible,
      });
      this.world = world;
      const ents = new EntityRenderer({
        lighting: world,
        scene: world.scene,
        models,
        particles: new ParticleLibrary((p) => gameAssetUrl(p, 'tf2')),
        // Unlock weapons and cosmetics from the loadout builder's model channel.
        loadout: new LoadoutModels(),
        game: 'tf2',
        sunVisible: this.sunVisible,
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
      this.ents = ents;
      // Texture progress: the cache's pending count against the most seen.
      let peak = 1;
      const tick = setInterval(() => {
        peak = Math.max(peak, textures.pending);
        this.progress.step('textures', peak - textures.pending, peak);
      }, 200);
      // Models: every class body and arms, so nobody pops in.
      const classModels = Object.values(CLASS_DATA).flatMap((c) => [c.model, c.handsModel]).filter(Boolean);
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
    this.ents?.dispose();
    this.ents = null;
    this.world?.dispose();
    this.world = null;
    this.models = null;
    this.pkg = null;
    this.brushCache.clear();
    this.records.clear();
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
    const world = new GameWorld({
      map: this.pkg.loaded,
      options: { isServer: false, lagCompensation: false, seed: this.snap.hello.seed },
    });
    const player = world.addPlayer(this.snap.roster.get(this.snap.localEntity)?.name ?? 'me');
    this.clientWorld = world;
    this.localPlayerSim = player;
    this.prediction = new Prediction(world, player, { onEvent: (e) => this.onPredicted(e) });
  }

  private onPredicted(e: PredictedSound | PredictedEffect): void {
    const local = this.snap.localEntity;
    const simId = this.localPlayerSim?.id;
    if (e.type === 'sound') {
      const ent = e.opts.entity === undefined || e.opts.entity === simId ? local : e.opts.entity;
      this.audio?.emit({ name: e.name, entity: ent, pos: e.opts.pos, volume: e.opts.volume, pitch: e.opts.pitch, channel: e.opts.channel });
    } else {
      const fx = { ...e.effect, type: 'effect' as const };
      if (fx.entity === simId) fx.entity = local;
      this.pendingEvents.push(fx);
    }
  }

  private queueEvent(e: TimedEvent): void {
    const ev = e.event;
    const local = this.snap.localEntity;
    const me = this.snap.localPlayer();
    const r = ev as { to?: number; notTo?: number; team?: number };
    if (r.to !== undefined && r.to !== local) return;
    if (r.notTo !== undefined && r.notTo === local) return;
    if (ev.type === 'sound') {
      if (r.team !== undefined && r.team !== num(me, 'team')) return;
      this.audio?.emit({ name: ev.name, entity: ev.entity, pos: ev.pos, volume: ev.volume, pitch: ev.pitch, channel: ev.channel, stop: ev.stop });
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
          if (!c.paused) {
            // The match resumes from the tick it stopped on: take the clock and prediction from there.
            this.clock.resync();
            this.ticks.reset();
            this.prediction = null;
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
      default:
        break;
    }
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

    // The join menus take the mouse: give the pointer back while one is up.
    if (me && (team === TEAM_UNASSIGNED || (team >= 2 && num(me, 'cls') === 0)) && this.inputCore.km.locked) this.inputCore.km.unlock();

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
    const n = this.offlinePaused ? 0 : this.ticks.advance(dt);
    for (let i = 0; i < n; i++) this.tick(Math.floor(this.serverTime / TICK_INTERVAL) + i);

    const t1 = performance.now();
    this.fps.phase('sim', t1 - t0);
    // Other entities at render time; the local player from prediction.
    this.buildRenderStates(renderTime, f.now);

    // View.
    const pred = this.prediction;
    const pp = pred?.player;
    const zoomed = !!pp && alive && pp.cond.has(TF_COND.ZOOMED);
    this.fov.set(zoomed ? TF_WEAPON_ZOOM_FOV : 0, TF_ZOOM_RATE, this.clientNow);
    const origin = pred ? pred.renderOrigin(f.now, tmpOrigin) : { x: num(me, 'ox'), y: num(me, 'oy'), z: num(me, 'oz') };
    const taunting = !!pp && pp.cond.has(TF_COND.TAUNTING);
    const view = this.view.update({
      now: this.clientNow,
      frametime: dt,
      alive,
      spectator,
      first: {
        origin,
        viewOffsetZ: pp ? pp.move.viewOffsetZ : classEyeHeight(num(me, 'cls')),
        angles: this.viewAngles,
        velocity: pp ? pp.move.velocity : ZERO,
        punch: pp ? pp.move.punchAngle : ZERO,
        onStaticGround: !!pp && (pp.move.flags & FL_ONGROUND) !== 0,
        frametime: dt,
      },
      viewAngles: this.viewAngles,
      roamOrigin: origin,
      player: (id) => this.viewTarget(id),
      pickTarget: (after) => this.pickTarget(after, team),
      fov: this.fov.current(this.clientNow),
      thirdPerson: taunting,
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
    ents.updateViewModel(
      alive && pp && view.drawViewModel
        ? {
            cls: num(me, 'cls'),
            team,
            defindex: weapon?.defindex ?? -1,
            vmActivity: weapon?.vmActivity ?? 0,
            vmActivitySeq: weapon?.vmActivitySeq ?? 0,
            eyeOrigin: view.origin,
            eyeAngles: view.angles,
            velocity: pp.move.velocity,
            visible: !zoomed,
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
    ents.renderViewModel(core.renderer, cam);

    this.fps.phase('render', performance.now() - t2);
    // Audio.
    if (this.audio) {
      this.audio.setLocalEntity(local >= 0 ? local : null);
      this.audio.setListener(view.origin, view.angles);
      this.audio.update();
    }

    // HUD.
    this.hudAcc += dt;
    if (this.hudAcc >= 1 / HUD_HZ) {
      this.hudAcc = 0;
      const state = buildHudState(this.hudSource(), this.log, { game: 'tf2', now: this.clientNow, connected: this.connected, fps: this.fps.fps });
      this.store.publish(state);
    }
    if (alive !== this.lastSpawnedAlive) this.lastSpawnedAlive = alive;
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
    if (packet) t.input(packet);
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
        return;
      }
      if (st.key === local && type === 'player') {
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
    const eyeZ = ducked ? VEC_DUCK_VIEW_Z : classEyeHeight(num(rec, 'cls'));
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
      if (s.type !== 'player' || s.id === this.snap.localEntity) continue;
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
    };
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
    this.worker?.terminate();
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
const tmpLocal = { x: 0, y: 0, z: 0 };
const sunTrace = emptyTrace();
const occTrace = emptyTrace();
const noTrace = (_s: Vec3, e: Vec3, out: Vec3) => {
  out.x = e.x;
  out.y = e.y;
  out.z = e.z;
  return { fraction: 1 };
};
