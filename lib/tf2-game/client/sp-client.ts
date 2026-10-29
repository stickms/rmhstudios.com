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

import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  type WebGLRenderer,
} from 'three';
import { IN_ATTACK, IN_ATTACK2, MASK_OPAQUE, SURF_SKY, TICK_INTERVAL } from '../core/constants';
import { emptyTrace } from '../core/types';
import type { Vec3 } from '../core/vec';
import type { GameId } from '../assets/versions';
import { gameAssetUrl } from '../assets/urls';
import { GAME_MAPS } from '../assets/game-maps';
import { sourceFovToVertical } from '../render/camera';
import { SOURCE_UNIT } from '../render/coords';
import { WorldRenderer } from '../render/world-renderer';
import { EntityRenderer, ModelLibrary, type EntityState as RenderEntity } from '../render/entities';
import type { AudioEngine } from '../audio/engine';
import { Tf2GLTFLoader } from '@/lib/tf2-loadout/gltf-loader';
import { SpWorld, type SpSnapshot } from '@/lib/sp-game/world/sp-world';
import type { SpEvent } from '@/lib/sp-game/world/events';
import type { SpUserCmd } from '@/lib/sp-game/player/sp-player';
import type { TransitionData } from '@/lib/sp-game/level/transition';
import { adaptHl2Suit, adaptPortalGun, captionStyle, HudEventLog } from './hud-adapter';
import { emptyHudState, type HudFade } from './hud-state';
import type { HudCommand, HudStore } from './hud-store';
import type { GameSettings } from './settings';
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
  RenderCore,
  type ClientMount,
  type ClientStats,
  type GameClient,
} from './game-client';
import { createHttpSpAssets } from './sp-assets';
import { makeSave, writeSave, type SpGameId } from './sp-save';
import { FovState, StairSmoother, calcFirstPerson } from './view';
import { PortalView, PORTAL_COLORS } from './portal-view';

export interface SpClientOptions extends ClientMount {
  game: SpGameId;
  map: string;
  /** Entering the map from a saved transition (Continue). */
  transition?: TransitionData | null;
}

const HUD_HZ = 20;
/** IMPULSE_FLASHLIGHT. */
const IMPULSE_FLASHLIGHT = 100;
/** viewmodel_fov for the portal gun. */
const VIEWMODEL_FOV = 54;

/** A stand-in portal gun drawn over the world (the model channel publishes no v_portalgun yet). */
class PortalGunViewModel {
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(sourceFovToVertical(VIEWMODEL_FOV), 16 / 9, 0.01, 10);
  private readonly gun = new Group();
  private readonly tipMat = new MeshBasicMaterial({ color: PORTAL_COLORS[0].clone() });
  private bob = 0;
  private kick = 0;

  constructor() {
    const body = new Mesh(new CylinderGeometry(0.045, 0.06, 0.42, 16), new MeshBasicMaterial({ color: 0xd8dadc }));
    body.rotation.x = Math.PI / 2;
    const band = new Mesh(new CylinderGeometry(0.063, 0.063, 0.05, 16), new MeshBasicMaterial({ color: 0x2b2d30 }));
    band.rotation.x = Math.PI / 2;
    band.position.z = -0.08;
    const tip = new Mesh(new CylinderGeometry(0.03, 0.03, 0.06, 12), this.tipMat);
    tip.rotation.x = Math.PI / 2;
    tip.position.z = -0.24;
    const claw = new Mesh(new BoxGeometry(0.012, 0.06, 0.08), new MeshBasicMaterial({ color: 0x3a3c40 }));
    claw.position.set(0.04, 0.04, -0.22);
    const claw2 = claw.clone();
    claw2.position.x = -0.04;
    this.gun.add(body, band, tip, claw, claw2);
    this.gun.position.set(0.16, -0.14, -0.38);
    this.gun.rotation.y = 0.08;
    this.scene.add(this.gun);
  }

  update(dt: number, speed: number, last: 'blue' | 'orange' | null, fired: boolean, visible: boolean): void {
    this.gun.visible = visible;
    if (fired) this.kick = 1;
    this.kick = Math.max(0, this.kick - dt * 6);
    this.bob += dt * Math.min(1, speed / 175) * 9;
    const b = Math.min(1, speed / 175);
    this.gun.position.x = 0.16 + Math.sin(this.bob) * 0.008 * b;
    this.gun.position.y = -0.14 + Math.abs(Math.cos(this.bob)) * 0.01 * b;
    this.gun.position.z = -0.38 + this.kick * 0.04;
    this.tipMat.color.copy(PORTAL_COLORS[last === 'orange' ? 1 : 0]);
  }

  render(renderer: WebGLRenderer, aspect: number): void {
    if (!this.gun.visible) return;
    if (this.camera.aspect !== aspect) {
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }

  dispose(): void {
    this.scene.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as MeshBasicMaterial | undefined)?.dispose?.();
    });
  }
}

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
  private sim: SpWorld | null = null;
  private world: WorldRenderer | null = null;
  private ents: EntityRenderer | null = null;
  private portals: PortalView | null = null;
  private gun: PortalGunViewModel | null = null;
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

  constructor(private readonly opts: SpClientOptions) {
    this.game = opts.game;
    this.store = opts.store;
    this.settings = opts.settings;
    this.mapName = opts.map;
    this.transition = opts.transition ?? null;
    this.fov = new FovState(opts.settings.fov);
    this.progress = new ProgressTracker((p) => opts.callbacks.onProgress?.(p), ['connect']);
  }

  get input() {
    return this.opts.input;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      this.core = new RenderCore(this.opts.canvas, this.settings.quality, () =>
        this.fail(new ClientFailure({ code: 'context-lost', detail: 'WebGL context lost', retryable: true })),
      );
      this.inputCore = new InputCore(this.opts.inputTarget, this.game, () => this.settings, (l) => this.opts.callbacks.onLockChange?.(l), this.opts.input);
      this.audio = createAudio(this.game as GameId, this.settings, (id) => this.entityPos.get(id) ?? null, this.occlusion);
      this.unsubs.push(this.audio.attach());
      this.unsubs.push(
        this.audio.onCaption((c) => {
          if (!this.settings.captions) return;
          const st = captionStyle(c.text);
          this.log.pushCaption({ text: c.text.replace(/<[^>]+>/g, ''), color: c.color ?? st.color, sfx: c.sfx || st.sfx, duration: c.duration }, this.clientNow + c.delay);
        }),
      );
      this.unsubs.push(this.store.onCommand((c) => this.onHudCommand(c)));
      this.progress.begin('sounds');
      void this.audio
        .load()
        .catch(() => {})
        .finally(() => this.progress.finish('sounds'));
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
    const entry = GAME_MAPS[this.game].find((m) => m.name === map);
    this.progress.title = entry?.title ?? map;
    const pkg = await loadMapPackageForClient(this.game, map, this.progress, this.abort.signal, { collision: false });
    if (this.disposed) return;
    this.progress.begin('models');
    const assets = await createHttpSpAssets({
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
    this.mapName = map;
    this.transition = transition;
    this.progress.finish('world');
    const textures = core.textureCache(this.game);
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
    this.ents = new EntityRenderer({ lighting: world, scene: world.scene, models, particles: null, game: this.game });
    if (this.game === 'portal') {
      this.portals = new PortalView(world.scene, { recursion: core.plan.portalRecursion });
      this.gun = new PortalGunViewModel();
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
    writeSave(makeSave(this.game, map, transition, 0));
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
  }

  private startLoop(): void {
    if (this.disposed) return;
    this.running = true;
    this.ticks.reset();
    this.loop ??= new GameLoop(
      (f) => this.frame(f),
      undefined,
      (p) => this.audio?.onVisibility(p),
    );
    this.loop.start();
    this.opts.callbacks.onPhase?.('running');
  }

  private changeLevel(map: string, transition: TransitionData): void {
    if (this.changing) return;
    this.changing = true;
    const published = GAME_MAPS[this.game].some((m) => m.name === map);
    if (!published) {
      // The demo ends here (the rest of the game is not published).
      this.running = false;
      this.loop?.stop();
      this.opts.callbacks.onPhase?.('ended');
      return;
    }
    writeSave(makeSave(this.game, map, transition, 0));
    void this.loadLevel(map, transition).catch((e) => this.fail(e));
  }

  // ─── HUD commands ────────────────────────────────────────────────────────

  private onHudCommand(c: HudCommand): void {
    if (c.kind === 'pause') {
      this.paused = c.paused;
      if (c.paused) this.inputCore?.km.unlock();
    } else if (c.kind === 'disconnect') this.opts.callbacks.onExit?.();
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
    const n = this.paused ? 0 : this.ticks.advance(dt);
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
          ...(e.anim ? { animStart: e.anim.startTime, playbackRate: e.anim.rate } : {}),
        },
      });
    }
    const ents = this.ents;
    ents.beginFrame({ time: snap.curtime, dt, localPlayer: -1, localTeam: 0, firstPerson: true, camera: cam.camera });
    ents.sync(states);
    ents.endFrame();

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
    if (this.gun) {
      const speed = Math.hypot(p.velocity.x, p.velocity.y);
      this.gun.update(dt, speed, this.lastFired, this.firedThisFrame, !!p.portalgun && !p.dead && !snap.view);
      this.gun.render(core.renderer, core.aspect);
    }

    this.fps.phase('render', performance.now() - t2);
    // Audio.
    if (this.audio) {
      this.audio.setLocalEntity(1);
      this.audio.setListener(view.origin, view.angles);
      if (snap.soundscape && snap.soundscape !== this.audio.currentSoundscape) this.audio.setSoundscape(snap.soundscape);
      this.audio.update();
    }

    // HUD.
    this.hudAcc += dt;
    if (this.hudAcc >= 1 / HUD_HZ) {
      this.hudAcc = 0;
      this.publishHud(snap);
    }
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
        writeSave(makeSave(this.game, this.mapName, this.transition, this.checkpoints));
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
