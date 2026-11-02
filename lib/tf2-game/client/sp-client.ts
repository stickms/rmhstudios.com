/**
 * The Half-Life 2 and Portal client: one `SpWorld` (lib/sp-game) on the main
 * thread, stepped at the engine's 66.67 Hz by a fixed-step accumulator inside
 * the one frame loop, drawn with the same renderer as TF2.
 *
 *   load: map package (BSP, manifest, prop hulls) → the browser SpAssets (model
 *         sequences and hulls from the asset channels) → Rapier → SpWorld
 *         (new game, a transition from the previous map, or a saved level start)
 *   frame: input → whole ticks (`SpUserCmd` from the input state; flashlight
 *          impulse) → `world.step` → the snapshot → camera (first person with
 *          stairs, roll, punch, suit zoom, screen shake; point_viewcontrol
 *          cameras), entities and brush movers, Portal's portal views
 *          (portal-view.ts), the portal gun, audio (sounds, soundscape), the HUD
 *          (suit / portal gun, captions, fades)
 *   events: changelevel → save, load the next package, carry the player;
 *           autosave → checkpoint count (death reloads the checkpoint inside the
 *           world); a level that is not published ends the demo.
 *
 * Why not a worker: the world's state is read every frame by the renderer and
 * the camera, and Rapier's step on these maps costs well under a millisecond;
 * a worker would add a frame of latency to every look and a message per entity.
 * The fixed step keeps the simulation identical whatever the frame rate.
 *
 * Browser only.
 */

import { indexFromEntities } from '../console/entity-complete';
import { IN_ATTACK, IN_ATTACK2, MASK_OPAQUE, SURF_SKY, TICK_INTERVAL } from '../core/constants';
import { emptyTrace } from '../core/types';
import type { Vec3 } from '../core/vec';
import type { GameId } from '../assets/versions';
import { gameAssetUrl } from '../assets/urls';
import { GAME_MAPS } from '../assets/game-maps';
import { SOURCE_UNIT } from '../render/coords';
import { WorldRenderer } from '../render/world-renderer';
import {
  EntityRenderer,
  ModelLibrary,
  SpViewModelRenderer,
  type EntityState as RenderEntity,
  type NetValue,
} from '../render/entities';
import type { AudioEngine } from '../audio/engine';
import { soundlevelForRadius } from '../audio/attenuation';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import { SpWorld, type SpSnapshot } from '@/lib/sp-game/world/sp-world';
import type { SpEvent } from '@/lib/sp-game/world/events';
import type { SpUserCmd } from '@/lib/sp-game/player/sp-player';
import type { TransitionData } from '@/lib/sp-game/level/transition';
import { adaptHl2Suit, adaptPortalGun, captionStyle, HudEventLog } from './hud-adapter';
import { emptyHudState, type HudFade } from './hud-state';
import type { HudCommand, HudStore } from './hud-store';
import { zoomSensitivityScale, type GameSettings } from './settings';
import { applyLook, buildUserCmd, drainImpulses, heldButtons } from './input';
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
  ragdollTrace,
  RenderCore,
  type ClientMount,
  type ClientStats,
  type GameClient,
} from './game-client';
import { createHttpSpAssets } from './sp-assets';
import type { TextureCache } from '../render/texture-cache';
import type { MapManifest, HullTable } from '../assets/map-manifest';
import type { BspFile } from '../formats/bsp';
import type { SpAssets } from '@/lib/sp-game/assets';
import { makeSave, writeSave, type SpGameId } from './sp-save';
import { FovState, StairSmoother, calcFirstPerson } from './view';
import { PortalView } from './portal-view';
import { attachConsoleHost, type ConsoleLink } from '../console/runtime';
import { SpServerConsole } from '../console/sp-server';

/** One level's data, however it was produced (a published package, or compiled in the browser). */
export interface SpLevelData {
  bsp: BspFile;
  manifest: MapManifest;
  hulls: HullTable | null;
  title?: string;
}

/**
 * Content that does not come from the HL2/Portal asset channels (an additive seam: omit it and the
 * client is the HL2/Portal client, unchanged). Harmonic injects its compiled levels, procedural
 * textures and `SpAssets` here and still runs the `game: 'hl2'` simulation.
 */
export interface SpContent {
  /** Maps this content offers (the console's changelevel and the "is the next map published" check). */
  maps: readonly { name: string; title: string }[];
  loadLevel(map: string, progress: ProgressTracker, signal: AbortSignal): Promise<SpLevelData>;
  createAssets(level: SpLevelData, signal: AbortSignal): Promise<SpAssets>;
  /** The world's texture cache (the default is the channels' HTTP cache). */
  createTextures(core: RenderCore): TextureCache;
  /**
   * What the HL2/Portal channels give that this content does not: all default to false for
   * injected content, so nothing is fetched or shown from a game install.
   * `audio`: the sound channel; `suitHud`: the HEV suit HUD state; `saves`: level-start saves in
   * the game's localStorage slot.
   */
  features?: { audio?: boolean; suitHud?: boolean; saves?: boolean };
  /**
   * An injected audio backend in place of the HL2/Portal sound channel (`features.audio` stays
   * false for such content). Optional and additive: absent, nothing changes. Harmonic's synthesised
   * sound bank plugs in here (`lib/harmonic-game/audio/`).
   */
  createAudio?(ctx: SpAudioContext): SpAudioBackend | null;
}

/** What the client hands an injected audio backend when it is created. */
export interface SpAudioContext {
  /** The level being loaded (`changelevel` makes a new backend). */
  map: string;
  settings: GameSettings;
  /** An entity's current (interpolated) position, or null when unknown. */
  entityPosition(entity: number): Vec3 | null;
}

/** An injected audio backend. The client forwards every simulation event and the listener each frame. */
export interface SpAudioBackend {
  /** Unlock on the first gesture / suspend while hidden; returns the detach function. */
  attach(): () => void;
  /** Every `SpEvent` the simulation emits (sounds, pickups, death, effects…). */
  onEvent(ev: SpEvent): void;
  setListener(origin: Vec3, angles: Vec3): void;
  /** Once per frame, after `setListener`. */
  update(): void;
  setVolumes(volume: GameSettings['volume']): void;
  stopAll(): void;
  onVisibility?(visible: boolean): void;
  /** A level (re)loaded: `changelevel`, `retry`. The first level is `SpAudioContext.map`. */
  onLevel?(map: string): void;
  dispose(): void;
}

export interface SpClientOptions extends ClientMount {
  game: SpGameId;
  map: string;
  /** Entering the map from a saved transition (Continue). */
  transition?: TransitionData | null;
  /** Injected content (see `SpContent`); absent = the published HL2/Portal packages. */
  content?: SpContent;
}

const HUD_HZ = 20;
/** IMPULSE_FLASHLIGHT. */
const IMPULSE_FLASHLIGHT = 100;
/** The portal gun's view model (models.py converts it from the game; build-maps always lists it). */
const PORTALGUN_VIEWMODEL = 'models/weapons/v_portalgun.mdl';

interface Shake {
  amplitude: number;
  frequency: number;
  duration: number;
  at: number;
}

export class SpClient implements GameClient {
  readonly game: SpGameId;
  readonly store: HudStore;
  private settings: GameSettings;
  private readonly progress: ProgressTracker;
  private core: RenderCore | null = null;
  private inputCore: InputCore | null = null;
  private loop: GameLoop | null = null;
  private audio: AudioEngine | null = null;
  /** The content's own audio backend (`SpContent.createAudio`), when it injects one. */
  private backend: SpAudioBackend | null = null;
  private sim: SpWorld | null = null;
  private world: WorldRenderer | null = null;
  private ents: EntityRenderer | null = null;
  private portals: PortalView | null = null;
  private gun: SpViewModelRenderer | null = null;
  private snap: SpSnapshot | null = null;
  private readonly prevOrigin = { x: 0, y: 0, z: 0 };
  private readonly curOrigin = { x: 0, y: 0, z: 0 };
  private readonly ticks = new FixedStep(TICK_INTERVAL, 5);
  private readonly log = new HudEventLog();
  private readonly fov: FovState;
  private readonly stairs = new StairSmoother();
  private readonly viewAngles = { x: 0, y: 0, z: 0 };
  private readonly fps = new FpsMeter();
  private readonly culler = new PropDistanceCuller();
  private readonly brushCache = new Map<number, { k: string; visible: boolean | null }>();
  private mapName: string;
  private transition: TransitionData | null;
  private clientNow = 0;
  private hudAcc = 0;
  private running = false;
  private paused = false;
  private disposed = false;
  private started = false;
  private impulse = 0;
  private lastButtons = 0;
  private lastFired: 'blue' | 'orange' | null = null;
  private firedThisFrame = false;
  private fade: { color: [number, number, number, number]; start: number; duration: number; hold: number; fadeIn: boolean; stayOut: boolean } | null = null;
  private shakes: Shake[] = [];
  private checkpoints = 0;
  private hint = '';
  private readonly unsubs: Array<() => void> = [];
  private readonly entityPos = new Map<number, Vec3>();
  private abort = new AbortController();
  private changing = false;
  /** The developer console: the panel's link, and its server half on this world (sv_cheats, noclip…). */
  private console: ConsoleLink | null = null;
  private readonly spConsole: SpServerConsole;
  private fpsMax = 0;

  constructor(private readonly opts: SpClientOptions) {
    this.game = opts.game;
    this.store = opts.store;
    this.settings = opts.settings;
    this.mapName = opts.map;
    this.transition = opts.transition ?? null;
    this.fov = new FovState(opts.settings.fov);
    this.progress = new ProgressTracker((p) => opts.callbacks.onProgress?.(p), opts.content && !opts.content.features?.audio ? ['connect', 'sounds'] : ['connect']);
    this.spConsole = new SpServerConsole(opts.game, {
      print: (text, level) => this.console?.console.print(text, level),
      cvar: (name, value) => this.console?.serverEvent({ type: 'cvar', name, value } as { type: string }),
      maps: () => this.mapList().map((m) => m.name),
      changeLevel: (map) => this.consoleChangeLevel(map),
      setViewAngles: (a) => {
        this.viewAngles.x = a.x;
        this.viewAngles.y = a.y;
      },
    });
  }

  get input() {
    return this.opts.input;
  }

  private feature(name: 'audio' | 'suitHud' | 'saves'): boolean {
    const c = this.opts.content;
    return c ? !!c.features?.[name] : true;
  }

  private mapList(): readonly { name: string; title: string }[] {
    return this.opts.content?.maps ?? GAME_MAPS[this.game];
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      this.core = new RenderCore(this.opts.canvas, this.settings, () =>
        this.fail(new ClientFailure({ code: 'context-lost', detail: 'WebGL context lost', retryable: true })),
      );
      this.inputCore = new InputCore(this.opts.inputTarget, this.game, () => this.settings, (l) => this.opts.callbacks.onLockChange?.(l), this.opts.input);
      const audio = this.feature('audio')
        ? createAudio(this.game as GameId, this.settings, (id) => this.entityPos.get(id) ?? null, this.occlusion)
        : null;
      this.audio = audio;
      this.backend = this.opts.content?.createAudio?.({ map: this.mapName, settings: this.settings, entityPosition: (id) => this.entityPos.get(id) ?? null }) ?? null;
      if (this.backend) this.unsubs.push(this.backend.attach());
      if (audio) {
        this.unsubs.push(audio.attach());
        this.unsubs.push(
          audio.onCaption((c) => {
            if (!this.settings.captions) return;
            const st = captionStyle(c.text);
            this.log.pushCaption({ text: c.text.replace(/<[^>]+>/g, ''), color: c.color ?? st.color, sfx: c.sfx || st.sfx, duration: c.duration }, this.clientNow + c.delay);
          }),
        );
      }
      this.unsubs.push(this.store.onCommand((c) => this.onHudCommand(c)));
      this.console = attachConsoleHost(this.store, this.game, {
        authority: () => 'sp',
        stats: () => this.stats(),
        canvas: () => this.opts.canvas,
        hudRoot: () => this.opts.canvas.parentElement?.querySelector<HTMLElement>('.tf2g-hud') ?? null,
        // ent_fire completes from the world itself (the single-player client runs it).
        entityIndex: () => (this.sim ? indexFromEntities(this.sim.entities) : null),
        mapName: () => this.mapName,
        setFpsMax: (fps) => (this.fpsMax = fps),
        setViewAngles: (a) => {
          this.viewAngles.x = a.x;
          this.viewAngles.y = a.y;
        },
        position: () => {
          const p = this.sim?.player;
          return p ? { origin: { ...p.origin }, angles: { ...this.viewAngles }, velocity: { ...p.velocity } } : null;
        },
        retry: () => void this.consoleChangeLevel(this.mapName),
      });
      this.unsubs.push(() => this.console?.detach());
      this.spConsole.replicateAll();
      if (audio) {
        this.progress.begin('sounds');
        void audio
          .load()
          .catch(() => {})
          .finally(() => this.progress.finish('sounds'));
      }
      await this.loadLevel(this.mapName, this.transition);
    } catch (e) {
      this.fail(e);
    }
  }

  private occlusion = (from: Vec3, to: Vec3): boolean => {
    const s = this.sim;
    if (!s) return false;
    s.mapCollision.traceLine(from, to, MASK_OPAQUE, null, occTrace);
    return occTrace.fraction < 0.99;
  };

  // ─── Levels ──────────────────────────────────────────────────────────────

  private async loadLevel(map: string, transition: TransitionData | null): Promise<void> {
    const core = this.core!;
    this.running = false;
    this.loop?.stop();
    this.opts.callbacks.onPhase?.('loading');
    this.teardownLevel();
    const entry = this.mapList().find((m) => m.name === map);
    this.progress.title = entry?.title ?? map;
    const content = this.opts.content;
    const pkg: SpLevelData = content
      ? await content.loadLevel(map, this.progress, this.abort.signal)
      : await loadMapPackageForClient(this.game, map, this.progress, this.abort.signal, { collision: false });
    if (this.disposed) return;
    this.progress.begin('models');
    const assets = content
      ? await content.createAssets(pkg, this.abort.signal)
      : await createHttpSpAssets({
          game: this.game,
          manifest: pkg.manifest,
          bsp: pkg.bsp,
          hulls: pkg.hulls,
          signal: this.abort.signal,
          onModel: (d, t) => this.progress.step('models', d, t),
        });
    if (this.disposed) return;
    this.progress.begin('world');
    const sim = await SpWorld.create({
      game: this.game,
      mapName: map,
      bsp: pkg.bsp,
      assets,
      loadType: transition ? 'transition' : 'new',
      transition,
    });
    if (this.disposed) {
      sim.dispose();
      return;
    }
    this.sim = sim;
    this.spConsole.bind(sim);
    this.mapName = map;
    this.backend?.onLevel?.(map);
    this.transition = transition;
    this.progress.finish('world');
    const textures = content ? content.createTextures(core) : core.textureCache(this.game);
    const models = new ModelLibrary({ url: (p) => gameAssetUrl(p, this.game), loader: new Tf2GLTFLoader() });
    this.progress.begin('textures');
    const world = new WorldRenderer({
      bsp: pkg.bsp,
      manifest: pkg.manifest,
      game: this.game,
      textures,
      models,
      sunVisible: (p) => {
        const s = this.world?.sun;
        if (!s || !this.sim) return false;
        this.sim.mapCollision.traceLine(p, { x: p.x + s.dir[0] * 16384, y: p.y + s.dir[1] * 16384, z: p.z + s.dir[2] * 16384 }, MASK_OPAQUE, null, sunTrace);
        return sunTrace.fraction >= 1 || (sunTrace.surfaceFlags & SURF_SKY) !== 0;
      },
    });
    this.world = world;
    this.ents = new EntityRenderer({
      lighting: world,
      scene: world.scene,
      models,
      particles: null,
      game: this.game,
      // NPC ragdolls land on the level (HL2's sv_gravity 600).
      ragdollTrace: ragdollTrace(sim.mapCollision),
      gravity: 600,
    });
    if (this.game === 'portal') {
      this.portals = new PortalView(world.scene, { recursion: core.plan.portalRecursion });
      this.gun = new SpViewModelRenderer(PORTALGUN_VIEWMODEL);
      void models.asset(PORTALGUN_VIEWMODEL);
    }
    let peak = 1;
    const tick = setInterval(() => {
      peak = Math.max(peak, textures.pending);
      this.progress.step('textures', peak - textures.pending, peak);
    }, 200);
    // Start drawing the entities so their models load with the map.
    const snap = sim.snapshot();
    for (const e of snap.entities) if (e.model) void models.asset(e.model);
    await Promise.all([world.whenLoaded(), models.whenIdle()]);
    clearInterval(tick);
    this.progress.finish('textures');
    this.progress.finish('models');
    if (this.disposed) return;
    // Face the way the level starts.
    this.viewAngles.x = sim.player.eyeAngles.x;
    this.viewAngles.y = sim.player.eyeAngles.y;
    this.snap = snap;
    this.curOrigin.x = this.prevOrigin.x = snap.player.origin.x;
    this.curOrigin.y = this.prevOrigin.y = snap.player.origin.y;
    this.curOrigin.z = this.prevOrigin.z = snap.player.origin.z;
    this.stairs.reset();
    this.checkpoints = 0;
    if (this.feature('saves')) writeSave(makeSave(this.game, map, transition, 0));
    this.changing = false;
    this.startLoop();
  }

  private teardownLevel(): void {
    this.portals?.dispose();
    this.portals = null;
    this.gun?.dispose();
    this.gun = null;
    this.ents?.dispose();
    this.ents = null;
    this.world?.dispose();
    this.world = null;
    this.sim?.dispose();
    this.sim = null;
    this.brushCache.clear();
    this.audio?.stopAll();
    this.backend?.stopAll();
  }

  private startLoop(): void {
    if (this.disposed) return;
    this.running = true;
    this.ticks.reset();
    this.loop ??= new GameLoop(
      (f) => this.frame(f),
      undefined,
      (p) => {
        this.audio?.onVisibility(p);
        this.backend?.onVisibility?.(p);
      },
    );
    this.loop.start();
    this.opts.callbacks.onPhase?.('running');
  }

  private changeLevel(map: string, transition: TransitionData): void {
    if (this.changing) return;
    this.changing = true;
    const published = this.mapList().some((m) => m.name === map);
    if (!published) {
      // The demo ends here (the rest of the game is not published).
      this.running = false;
      this.loop?.stop();
      this.opts.callbacks.onPhase?.('ended');
      return;
    }
    if (this.feature('saves')) writeSave(makeSave(this.game, map, transition, 0));
    void this.loadLevel(map, transition).catch((e) => this.fail(e));
  }

  // ─── HUD commands ────────────────────────────────────────────────────────

  private onHudCommand(c: HudCommand): void {
    if (c.kind === 'pause') {
      this.paused = c.paused;
      if (c.paused) this.inputCore?.km.unlock();
    } else if (c.kind === 'disconnect') this.opts.callbacks.onExit?.();
    else if (c.kind === 'extra' && !this.spConsole.execute(c.command, c.args)) {
      this.console?.console.print(`Unknown command "${c.command}"`, 'warn');
    }
  }

  // ─── The frame ───────────────────────────────────────────────────────────

  private frame(f: FrameInfo): void {
    const sim = this.sim;
    const core = this.core;
    if (!this.running || !sim || !core || !this.world || !this.ents || !this.inputCore) return;
    const input = this.inputCore.input;
    const dt = f.dt;
    this.clientNow += dt;
    core.sample(f.rawMs);
    this.fps.sample(f.rawMs);
    this.inputCore.poll(dt);
    for (const a of drainImpulses(input)) {
      if (a === 'flashlight') this.impulse = IMPULSE_FLASHLIGHT;
      this.store.dispatchImpulse(a);
    }
    if (!this.paused) {
      // Any zoom that narrows the view FOV (env_zoom) slows the look with the FOV in use (CHud::Think).
      input.lookScale = zoomSensitivityScale(this.fov.current(this.clientNow), this.settings.fov, this.settings.zoomSensitivityRatio);
      applyLook(input, this.viewAngles, this.settings);
    }
    input.mouseDx = input.mouseDy = input.lookYaw = input.lookPitch = 0;

    // Simulation.
    const buttons = heldButtons(input);
    const pressed = buttons & ~this.lastButtons;
    this.lastButtons = buttons;
    this.firedThisFrame = false;
    if (this.snap?.player.portalgun && !this.paused) {
      if (pressed & IN_ATTACK && this.snap.player.portalgun.canFire1) {
        this.lastFired = 'blue';
        this.firedThisFrame = true;
      } else if (pressed & IN_ATTACK2 && this.snap.player.portalgun.canFire2) {
        this.lastFired = 'orange';
        this.firedThisFrame = true;
      }
    }
    const n = this.paused ? 0 : this.ticks.advance(dt * this.spConsole.timescale);
    const t0 = performance.now();
    for (let i = 0; i < n && this.sim === sim; i++) {
      const cmd: SpUserCmd = buildUserCmd(input, this.viewAngles, this.settings, undefined, { tickCount: sim.tickCount + 1 });
      cmd.impulse = this.impulse;
      this.impulse = 0;
      this.prevOrigin.x = this.curOrigin.x;
      this.prevOrigin.y = this.curOrigin.y;
      this.prevOrigin.z = this.curOrigin.z;
      sim.step(cmd);
      this.curOrigin.x = sim.player.origin.x;
      this.curOrigin.y = sim.player.origin.y;
      this.curOrigin.z = sim.player.origin.z;
      for (const ev of sim.drainEvents()) this.onEvent(ev);
      if (this.sim !== sim || this.changing) return;
    }
    if (n > 0) this.snap = sim.snapshot();
    const t1 = performance.now();
    this.fps.phase('sim', t1 - t0);
    const snap = this.snap;
    if (!snap) return;
    // A teleport (portal, landmark) must not be interpolated across.
    if (Math.hypot(this.curOrigin.x - this.prevOrigin.x, this.curOrigin.y - this.prevOrigin.y, this.curOrigin.z - this.prevOrigin.z) > 64) {
      this.prevOrigin.x = this.curOrigin.x;
      this.prevOrigin.y = this.curOrigin.y;
      this.prevOrigin.z = this.curOrigin.z;
    }
    // Angles changed by the world (a portal turns you; a level start): follow them.
    if (n > 0 && (Math.abs(angleDelta(sim.player.eyeAngles.y, this.viewAngles.y)) > 0.5 || Math.abs(sim.player.eyeAngles.x - this.viewAngles.x) > 0.5)) {
      this.viewAngles.x = sim.player.eyeAngles.x;
      this.viewAngles.y = sim.player.eyeAngles.y;
    }

    // Camera.
    const a = this.ticks.alpha;
    const origin = {
      x: this.prevOrigin.x + (this.curOrigin.x - this.prevOrigin.x) * a,
      y: this.prevOrigin.y + (this.curOrigin.y - this.prevOrigin.y) * a,
      z: this.prevOrigin.z + (this.curOrigin.z - this.prevOrigin.z) * a,
    };
    const p = snap.player;
    const view = { origin: { x: 0, y: 0, z: 0 }, angles: { x: 0, y: 0, z: 0 } };
    if (snap.view) {
      view.origin = { ...snap.view.origin };
      view.angles = { ...snap.view.angles };
    } else {
      calcFirstPerson(
        {
          origin,
          viewOffsetZ: p.viewOffsetZ,
          angles: this.viewAngles,
          velocity: p.velocity,
          punch: p.punchAngle,
          onStaticGround: p.onGround,
          frametime: dt,
        },
        this.stairs,
        view,
      );
    }
    this.applyShake(view);
    const cam = core.cam;
    cam.set({ origin: view.origin, angles: view.angles, fov: this.fov.current(this.clientNow) });
    if (Math.abs(core.aspect - cam.camera.aspect) > 1e-6) cam.setAspect(core.aspect);

    // Entities and brush movers.
    const states: RenderEntity[] = [];
    this.entityPos.clear();
    this.entityPos.set(1, { x: origin.x, y: origin.y, z: origin.z + p.viewOffsetZ });
    for (const e of snap.entities) {
      this.entityPos.set(e.id, e.origin);
      if (e.bspModel > 0) {
        this.applyBrush(e.bspModel, e.origin, e.angles, e.visible);
        continue;
      }
      if (!e.model) continue;
      states.push({
        id: e.id,
        type: 'prop',
        origin: e.origin,
        angles: e.angles,
        fields: {
          model: e.model,
          skin: e.skin,
          body: e.body,
          effects: e.effects,
          renderMode: e.renderMode,
          renderAlpha: e.renderAlpha,
          visible: e.visible,
          sequence: e.anim?.sequence ?? '',
          // An NPC that died: its ragdoll's push and where the blow landed (lib/sp-game/ai/actor.ts).
          ...ragdollFields(e.extra?.ragdoll),
          ...(e.anim ? { animStart: e.anim.startTime, playbackRate: e.anim.rate } : {}),
        },
      });
    }
    const ents = this.ents;
    ents.beginFrame({ time: snap.curtime, dt, localPlayer: -1, localTeam: 0, firstPerson: true, camera: cam.camera });
    ents.sync(states);
    ents.endFrame();
    if (this.gun) {
      // weapon_portalgun sends ACT_VM_PRIMARYATTACK for either portal; prefer a secondary one if the model has it.
      if (this.firedThisFrame) this.gun.play(...(this.lastFired === 'orange' ? ['ACT_VM_SECONDARYATTACK'] : []), 'ACT_VM_PRIMARYATTACK');
      this.gun.update(
        { eyeOrigin: view.origin, eyeAngles: view.angles, velocity: p.velocity, visible: !!p.portalgun && !p.dead && !snap.view && (this.console?.console.drawViewModel.bool ?? true) },
        ents.context,
      );
    }

    // Draw.
    const t2 = performance.now();
    this.fps.phase('entities', t2 - t1);
    const world = this.world;
    this.portals?.sync(snap.portals, this.clientNow);
    this.culler.restore();
    if (this.portals) this.portals.renderViews(core.renderer, world, cam, this.clientNow);
    else world.update(cam, this.clientNow);
    this.culler.cull(world.props?.group, cam.camera, core.plan.propDrawDistance, SOURCE_UNIT);
    world.render(core.renderer, cam);
    this.gun?.render(core.renderer, cam);

    this.fps.phase('render', performance.now() - t2);
    // Audio.
    if (this.audio) {
      this.audio.setLocalEntity(1);
      this.audio.setListener(view.origin, view.angles);
      if (snap.soundscape && snap.soundscape !== this.audio.currentSoundscape) this.audio.setSoundscape(snap.soundscape);
      this.audio.update();
    }
    if (this.backend) {
      this.backend.setListener(view.origin, view.angles);
      this.backend.update();
    }

    // HUD.
    this.hudAcc += dt;
    if (this.hudAcc >= 1 / HUD_HZ) {
      this.hudAcc = 0;
      this.publishHud(snap);
    }
    // The console after the frame is drawn (its screenshot reads this frame), fps_max for the next.
    if (this.loop) this.loop.maxFps = this.fpsMax;
    this.console?.frame();
  }

  /** The console's changelevel / map / retry: a published map from its start (the demo's rule). */
  private consoleChangeLevel(map: string): boolean {
    if (this.disposed || !this.mapList().some((m) => m.name === map)) return false;
    this.changing = true;
    void this.loadLevel(map, null).catch((e) => this.fail(e));
    return true;
  }

  private applyBrush(model: number, o: Vec3, an: Vec3, visible: boolean): void {
    const world = this.world;
    if (!world) return;
    const k = `${o.x},${o.y},${o.z},${an.x},${an.y},${an.z}`;
    const c = this.brushCache.get(model);
    if (!c || c.k !== k) world.setEntityTransform(model, o, an);
    if (c && c.visible !== null && c.visible !== visible) world.setVisible(model, visible);
    this.brushCache.set(model, { k, visible });
  }

  private applyShake(view: { origin: Vec3; angles: Vec3 }): void {
    if (!this.shakes.length) return;
    const now = this.clientNow;
    this.shakes = this.shakes.filter((s) => now - s.at < s.duration);
    const calm = this.settings.reducedFlashing ? 0.35 : 1;
    for (const s of this.shakes) {
      // CViewEffects::CalcShake: random offsets scaled by the time left.
      const frac = 1 - (now - s.at) / s.duration;
      const amp = s.amplitude * frac * frac * calm;
      const ph = Math.sin((now - s.at) * s.frequency);
      view.origin.x += (Math.random() * 2 - 1) * amp * 0.5;
      view.origin.y += (Math.random() * 2 - 1) * amp * 0.5;
      view.origin.z += (Math.random() * 2 - 1) * amp * 0.5;
      view.angles.z += ph * amp * 0.25;
    }
  }

  private onEvent(ev: SpEvent): void {
    this.backend?.onEvent(ev);
    switch (ev.type) {
      case 'sound':
        if (ev.setVolume !== undefined) break;
        this.audio?.emit({
          name: ev.name,
          entity: ev.entity,
          pos: ev.pos,
          volume: ev.volume,
          pitch: ev.pitch,
          stop: ev.stop,
          loop: ev.loop,
          // ambient_generic's radius is a raw wave's level (a script entry keeps its own).
          soundlevel:
            ev.radius !== undefined && /\.(wav|mp3|ogg)$/i.test(ev.name) ? soundlevelForRadius(ev.radius) : undefined,
        });
        break;
      case 'caption':
        if (this.settings.captions) {
          const st = captionStyle(ev.text);
          this.log.pushCaption({ text: ev.text.replace(/<[^>]+>/g, ''), color: st.color, sfx: st.sfx, duration: ev.duration }, this.clientNow);
        }
        break;
      case 'fade':
        this.fade = { color: ev.color, start: this.clientNow, duration: ev.duration, hold: ev.hold, fadeIn: ev.fadeIn, stayOut: ev.stayOut };
        break;
      case 'shake':
        if (ev.stop) this.shakes = [];
        else this.shakes.push({ amplitude: ev.amplitude, frequency: ev.frequency, duration: Math.max(0.05, ev.duration), at: this.clientNow });
        break;
      case 'message':
      case 'gametext':
        this.log.pushCenter(ev.type === 'message' ? ev.message : ev.text, 'text', 4, this.clientNow);
        break;
      case 'hudhint':
        this.hint = ev.show ? ev.message : '';
        break;
      case 'zoom':
        this.fov.set(ev.fov, ev.rate, this.clientNow);
        break;
      case 'autosave':
        this.checkpoints++;
        if (this.feature('saves')) writeSave(makeSave(this.game, this.mapName, this.transition, this.checkpoints));
        break;
      case 'changelevel':
        this.changeLevel(ev.map, ev.transition);
        break;
      case 'credits':
        if (ev.mode === 'outro') this.opts.callbacks.onPhase?.('ended');
        break;
      default:
        break;
    }
  }

  private fadeState(): HudFade | null {
    const f = this.fade;
    if (!f) return null;
    const t = this.clientNow - f.start;
    const [r, g, b, a] = f.color;
    const max = a / 255;
    let alpha: number;
    if (f.fadeIn) {
      // From the colour to clear.
      alpha = t < f.hold ? max : max * Math.max(0, 1 - (t - f.hold) / Math.max(0.01, f.duration));
    } else {
      alpha = t < f.duration ? (max * t) / Math.max(0.01, f.duration) : f.stayOut || t < f.duration + f.hold ? max : 0;
    }
    if (alpha <= 0.001 && t > f.duration + f.hold) {
      this.fade = null;
      return null;
    }
    const calm = this.settings.reducedFlashing ? 0.6 : 1;
    return { color: `rgb(${r} ${g} ${b})`, alpha: alpha * calm };
  }

  private publishHud(snap: SpSnapshot): void {
    const state = emptyHudState(this.game);
    state.now = this.clientNow;
    state.connected = true;
    state.fps = this.fps.fps;
    const p = snap.player;
    if (this.game === 'hl2') {
      if (this.feature('suitHud')) {
        state.hl2 = adaptHl2Suit({
          hasSuit: p.hasSuit,
          health: p.health,
          armor: p.armor,
          suitPower: p.suitPower,
          sprinting: p.sprinting,
          flashlightOn: p.flashlight,
          underwater: false,
          weaponName: '',
          clip: -1,
          reserve: 0,
          altAmmo: -1,
        });
      }
    } else {
      const g = p.portalgun;
      state.portal = adaptPortalGun({
        gunLevel: !g ? 0 : g.canFire2 ? 2 : g.canFire1 ? 1 : 0,
        bluePlaced: snap.portals.some((x) => x.which === 0 && x.open && x.fromGun),
        orangePlaced: snap.portals.some((x) => x.which === 1 && x.open && x.fromGun),
        lastFired: this.lastFired,
        health: p.health,
      });
    }
    state.fade = this.fadeState();
    this.log.apply(state, this.clientNow);
    if (this.hint) state.center.unshift({ id: -1, at: this.clientNow, duration: 1, text: this.hint, kind: 'training' });
    this.store.publish(state);
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
    if (this.audio) applyVolumes(this.audio, s);
    this.backend?.setVolumes(s.volume);
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
      pingMs: null,
      phases: { ...this.fps.phases },
    };
  }

  debug() {
    const p = this.snap?.player;
    return {
      map: this.mapName,
      tick: this.snap?.tick ?? 0,
      origin: p ? { ...p.origin } : null,
      health: p?.health ?? 0,
      portals: this.snap?.portals.map((x) => ({ which: x.which, open: x.open, linked: x.linked })) ?? [],
      portalViews: this.portals?.views ?? 0,
      viewControl: this.snap?.view?.entity ?? null,
      fade: this.fade ? { color: this.fade.color, fadeIn: this.fade.fadeIn, stayOut: this.fade.stayOut, at: this.fade.start, now: this.clientNow } : null,
      paused: this.paused,
      stats: this.stats(),
    };
  }

  private fail(e: unknown): void {
    if (this.disposed) return;
    if ((e as { name?: string })?.name === 'AbortError') return;
    const info =
      e instanceof ClientFailure ? e.info : { code: 'unknown' as const, detail: e instanceof Error ? e.message : String(e), retryable: true };
    console.error('[sp client]', info.code, info.detail, e);
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
    this.audio?.dispose();
    this.audio = null;
    this.backend?.dispose();
    this.backend = null;
    this.teardownLevel();
    this.inputCore?.dispose();
    this.inputCore = null;
    this.core?.dispose();
    this.core = null;
  }
}

export function createSpClient(opts: SpClientOptions): SpClient {
  return new SpClient(opts);
}

function angleDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d > 180) d -= 360;
  else if (d < -180) d += 360;
  return d;
}

const sunTrace = emptyTrace();
const occTrace = emptyTrace();

/** An SP actor's `extra.ragdoll` ({ force, at }) as the flat fields the entity renderer reads. */
function ragdollFields(r: unknown): Record<string, NetValue> {
  const v = r as { force?: Vec3; at?: Vec3 } | null | undefined;
  if (!v?.force) return {};
  const at = v.at ?? { x: 0, y: 0, z: 0 };
  return {
    ragdoll: true,
    ragdollFx: v.force.x,
    ragdollFy: v.force.y,
    ragdollFz: v.force.z,
    ragdollAx: at.x,
    ragdollAy: at.y,
    ragdollAz: at.z,
  };
}
