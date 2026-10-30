/**
 * The entity renderer: everything in the world that is not the map — players, view model,
 * projectiles, buildings, pickups, flags, props and NPC stand-ins, effects. It consumes plain
 * per-entity state (`EntityState`: id, net schema type, the schema's fields, optionally an
 * interpolated origin/angles) so it works with the client's snapshot mirror and with a
 * single-player world alike, plus the simulation's events.
 *
 * Per frame, from the client loop (which owns the one requestAnimationFrame):
 *
 *   ents.beginFrame({ time, dt, localPlayer, localTeam, firstPerson, camera: cam.camera });
 *   ents.sync(mirror.entities());            // create / update / remove renderables
 *   for (const ev of events) ents.handleEvent(ev);   // effects, deaths
 *   ents.updateViewModel({ cls, team, defindex, vmActivity, vmActivitySeq, eyeOrigin, … });
 *   ents.endFrame();                          // effects, tracers, gibs (after sync)
 *   world.update(cam, t); world.render(renderer, cam);
 *   ents.renderViewModel(renderer, cam);      // view model over the world, own FOV
 *
 * The world scene must contain `ents.root` (the constructor adds it to `opts.scene`).
 */
import {
  type Camera,
  Frustum,
  Group,
  Matrix4,
  type Object3D,
  Sphere,
  Vector3,
  type WebGLRenderer,
} from 'three';
import type { DeathEvent, EffectEvent, SimEvent } from '../../sim/events';
import type { RagdollTrace } from './ragdoll';
import type { SourceCamera } from '../camera';
import { srcToThree } from '../coords';
import type { Vec3Like } from '../lighting';
import {
  num,
  stateOrigin,
  type EntityState,
  type LightingSource,
  type RenderContext,
} from './common';
import { EffectSystem, type FxTrace, ParticleLibrary } from './effects';
import { ITEM_DRAW_BUDGET, WEAPON_ATTACHMENT, type LoadoutModels } from './loadout-models';
import type { ModelLibrary } from './model-asset';
import {
  BuildingRenderable,
  FlagRenderable,
  FxEntityRenderable,
  ModelRenderable,
  PickupRenderable,
  ProjectileRenderable,
} from './objects';
import { PlayerRenderable } from './player-renderer';
import { VIEWMODEL_ENTITY, ViewModelRenderer, type ViewModelInput } from './viewmodel';

export type { EntityState, NetValue, LightingSource, RenderContext } from './common';
export { EffectSystem } from './effects';
export type { ViewModelInput } from './viewmodel';
export { SpViewModelRenderer, type SpViewModelInput } from './sp-viewmodel';
export { ModelLibrary } from './model-asset';
export { ParticleLibrary } from './effects';
export { LoadoutModels, LOADOUT_MODEL_API, type LoadoutModelSource } from './loadout-models';

export interface EntityRendererOptions {
  /** The map renderer (ambient cubes, sun, fog) — null renders with flat light. */
  lighting: LightingSource | null;
  /** The world scene entities are drawn in (WorldRenderer.scene). */
  scene: Object3D;
  models: ModelLibrary;
  /** Game particle bundles (null: no particles). */
  particles?: ParticleLibrary | null;
  game?: string;
  /** Sun visibility from a Source point (a collision trace toward the sun). */
  sunVisible?: (p: Vec3Like) => boolean;
  /** A collision trace for gibs. */
  trace?: FxTrace;
  /** Whether two Source points see each other (local lights on models). */
  lineOfSight?: (a: Vec3Like, b: Vec3Like) => boolean;
  /** The world ragdolls land on (a box trace) and the gravity they fall by. */
  ragdollTrace?: RagdollTrace | null;
  gravity?: number;
  /** The loadout model channel: unlock weapons and cosmetics (null: stock looks only). */
  loadout?: LoadoutModels | null;
  /**
   * Another game's renderables (CS:GO's players, weapons, bomb and grenades), asked first for every
   * entity type; null falls through to the shared ones.
   */
  factory?: (s: EntityState, fx: EffectSystem) => EntityRenderable | null;
  /**
   * Another game's first-person view model, for attachments (`muzzle` on the local player): the game
   * draws it itself and keeps the shared one hidden (`updateViewModel(null)`).
   */
  viewModelAttachment?: (name: string, out: Matrix4) => boolean;
}

/** What a renderable is to the entity renderer: drawn from its state each frame, then disposed. */
export interface EntityRenderable {
  update(s: EntityState, ctx: RenderContext): void;
  attachment(name: string, out: Matrix4): boolean;
  dispose(): void;
  /** A player's death (the ragdoll or death pose). */
  onDeath?(ev: DeathEvent, ctx: RenderContext): void;
  /** The push a body's ragdoll takes (the sim's `ragdoll` effect: force, and where the blow landed). */
  onRagdoll?(ev: EffectEvent, ctx: RenderContext): void;
}

export interface FrameInfo {
  /** Render (server) time, seconds — the clock `animStart` and similar fields use. */
  time: number;
  /** Seconds since the last frame. */
  dt: number;
  /** Local player entity id (−1: none / spectator). */
  localPlayer?: number;
  localTeam?: number;
  /** The local player is seen from their eyes (body hidden, effects at the view model). */
  firstPerson?: boolean;
  /** The world camera (frustum culling, particle sorting, layers). */
  camera: Camera;
}

type Renderable = PlayerRenderable | ModelRenderable | FxEntityRenderable | EntityRenderable;

const BUILDING_TYPES = new Set(['sentrygun', 'dispenser', 'teleporter', 'sapper', 'object']);
const MODEL_TYPES = new Set(['prop', 'entity', 'control_point']);

/** Radius (Source units) of the culling sphere around an entity origin. */
const CULL_RADIUS = 96;

export class EntityRenderer {
  readonly root = new Group();
  readonly effects: EffectSystem;
  readonly viewModel: ViewModelRenderer;
  private readonly renderables = new Map<number, Renderable>();
  private readonly states = new Map<number, EntityState>();
  private readonly seen = new Set<number>();
  private readonly ctx: RenderContext & { isVisible(p: Vec3Like, r?: number): boolean };
  private readonly frustum = new Frustum();
  private readonly projView = new Matrix4();
  private readonly sphere = new Sphere();
  private camera: Camera | null = null;
  /** Kills since each player's last death (death events seen by this client). */
  private readonly streaks = new Map<number, number>();
  /** Sound hook for footsteps (player id, 'left'|'right'). */
  onFootstep: ((player: number, side: string) => void) | null = null;

  constructor(private readonly opts: EntityRendererOptions) {
    this.root.name = 'entities';
    opts.scene.add(this.root);
    this.effects = new EffectSystem(opts.particles ?? null);
    opts.particles?.preload();
    if (opts.trace) this.effects.trace = opts.trace;
    this.root.add(this.effects.group);
    this.viewModel = new ViewModelRenderer(this.effects);
    this.ctx = {
      models: opts.models,
      lighting: opts.lighting,
      sunVisible: opts.sunVisible,
      lineOfSight: opts.lineOfSight,
      ragdollTrace: opts.ragdollTrace ?? null,
      gravity: opts.gravity,
      scene: this.root,
      time: 0,
      dt: 0,
      localPlayer: -1,
      localTeam: 0,
      firstPerson: true,
      game: opts.game ?? 'tf2',
      loadout: opts.loadout ?? null,
      cameraPosition: new Vector3(),
      entity: (id) => this.states.get(id),
      attachment: (id, name, out) => this.attachment(id, name, out),
      killStreak: (id) => this.streaks.get(id) ?? 0,
      itemDrawBudget: { left: ITEM_DRAW_BUDGET },
      isVisible: (p, r = CULL_RADIUS) => this.isVisible(p, r),
    };
  }

  /** Starts a frame: clocks, the viewer, the camera frustum. */
  beginFrame(f: FrameInfo): void {
    const c = this.ctx;
    c.time = f.time;
    c.dt = Math.max(0, Math.min(0.1, f.dt));
    c.localPlayer = f.localPlayer ?? -1;
    c.localTeam = f.localTeam ?? 0;
    c.firstPerson = f.firstPerson ?? true;
    this.camera = f.camera;
    f.camera.updateMatrixWorld();
    c.cameraPosition?.setFromMatrixPosition(f.camera.matrixWorld);
    if (c.itemDrawBudget) c.itemDrawBudget.left = ITEM_DRAW_BUDGET;
    this.projView.multiplyMatrices(f.camera.projectionMatrix, f.camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projView);
  }

  private isVisible(p: Vec3Like, r: number): boolean {
    srcToThree(p.x, p.y, p.z, this.sphere.center);
    this.sphere.radius = r * 0.01905;
    return this.frustum.intersectsSphere(this.sphere);
  }

  /**
   * The entities to draw this frame. Renderables are created on first sight and removed when
   * an id is absent (or its type changed). Players first, so attachments (flags, beams) see
   * this frame's poses.
   */
  sync(states: Iterable<EntityState>): void {
    this.seen.clear();
    this.states.clear();
    const list: EntityState[] = [];
    for (const s of states) {
      this.states.set(s.id, s);
      list.push(s);
    }
    // Players nearest the camera first: they get the item draw budget before distant ones.
    const cam = this.ctx.cameraPosition;
    const dist = new Map<number, number>();
    if (cam)
      for (const s of list)
        if (s.type === 'player') {
          const o = stateOrigin(s, tmpO);
          srcToThree(o.x, o.y, o.z, tmpV);
          dist.set(s.id, tmpV.distanceToSquared(cam));
        }
    list.sort(
      (a, b) => order(a.type) - order(b.type) || (dist.get(a.id) ?? 0) - (dist.get(b.id) ?? 0),
    );
    for (const s of list) {
      this.seen.add(s.id);
      let r = this.renderables.get(s.id);
      if (r && (r as { kind?: string }).kind !== s.type) {
        r.dispose();
        r = undefined;
      }
      if (!r) {
        const made = this.create(s);
        if (!made) continue;
        (made as { kind?: string }).kind = s.type;
        r = made;
        this.renderables.set(s.id, r);
      }
      r.update(s, this.ctx);
    }
    for (const [id, r] of this.renderables) {
      if (this.seen.has(id)) continue;
      this.streaks.delete(id);
      r.dispose();
      this.renderables.delete(id);
      this.effects.stopEntity(id);
    }
  }

  private create(s: EntityState): Renderable | null {
    const fx = this.effects;
    const custom = this.opts.factory?.(s, fx);
    if (custom) return custom;
    if (s.type === 'player') {
      const p = new PlayerRenderable(s.id, fx);
      p.onFootstep = (id, side) => this.onFootstep?.(id, side);
      return p;
    }
    if (s.type === 'projectile') return new ProjectileRenderable(s.id, fx);
    if (s.type === 'pickup') return new PickupRenderable(s.id, fx);
    if (s.type === 'flag') return new FlagRenderable(s.id, fx);
    if (BUILDING_TYPES.has(s.type)) return new BuildingRenderable(s.id, fx, s.type);
    if (s.type === 'fx') return new FxEntityRenderable(s.id, fx);
    if (MODEL_TYPES.has(s.type)) return new ModelRenderable(s.id, fx);
    return null;
  }

  /** One simulation event (effects, deaths; the rest is HUD and sound). */
  handleEvent(ev: SimEvent): void {
    if (ev.type === 'effect') {
      if (ev.to !== undefined && ev.to !== this.ctx.localPlayer) return;
      if (ev.notTo !== undefined && ev.notTo === this.ctx.localPlayer) return;
      // A body's ragdoll push goes to its renderable (the effect system draws nothing for it).
      if (ev.kind === 'ragdoll' && ev.entity !== undefined) {
        const r = this.renderables.get(ev.entity);
        if (r && 'onRagdoll' in r) r.onRagdoll?.(ev, this.ctx);
      }
      this.effects.handle(ev, this.ctx);
    } else if (ev.type === 'death') {
      const d = ev as DeathEvent;
      // A kill streak counts a player's kills since they last died (CTFPlayer::m_Shared streaks).
      this.streaks.delete(d.victim);
      if (d.attacker > 0 && d.attacker !== d.victim)
        this.streaks.set(d.attacker, (this.streaks.get(d.attacker) ?? 0) + 1);
      const r = this.renderables.get((ev as DeathEvent).victim);
      if (r instanceof PlayerRenderable) r.onDeath(ev as DeathEvent, this.ctx);
      else if (r && 'onDeath' in r) r.onDeath?.(ev as DeathEvent, this.ctx);
    }
  }

  /** This frame's render context (after beginFrame), for renderables drawn outside sync. */
  get context(): RenderContext {
    return this.ctx;
  }

  /** The first-person view model (null hides it). */
  updateViewModel(inp: ViewModelInput | null): void {
    if (!inp) {
      this.viewModel.update(
        {
          cls: 0,
          team: 0,
          defindex: -1,
          vmActivity: 0,
          vmActivitySeq: 0,
          eyeOrigin: ZERO,
          eyeAngles: ZERO,
          velocity: ZERO,
          visible: false,
        },
        this.ctx,
      );
      return;
    }
    this.viewModel.update(inp, this.ctx);
  }

  /** Effects after the entities moved (call once per frame, after sync and events). */
  endFrame(): void {
    if (this.camera) this.effects.update(this.ctx, this.camera);
  }

  /** Draws the view model over the world. */
  renderViewModel(renderer: WebGLRenderer, cam: SourceCamera): void {
    this.viewModel.render(renderer, cam);
  }

  /**
   * An entity's attachment in three world space ('' or an unknown name: its origin, raised to
   * the chest for players). The local first-person player resolves to the view model.
   */
  attachment(id: number, name: string, out: Matrix4): boolean {
    const c = this.ctx;
    if (id === VIEWMODEL_ENTITY || (id === c.localPlayer && c.firstPerson && name === 'muzzle')) {
      if (this.opts.viewModelAttachment ? this.opts.viewModelAttachment(name, out) : this.viewModel.attachment(name, out)) return true;
    }
    const r = this.renderables.get(id);
    if (r && name && r.attachment(name, out)) return true;
    // A held weapon's own attachment (`weapon:<name>`, weapon unusual effects) has no stand-in.
    if (name.startsWith(WEAPON_ATTACHMENT)) return false;
    const s = this.states.get(id);
    if (!s) return false;
    const o = stateOrigin(s, { x: 0, y: 0, z: 0 });
    const lift = s.type === 'player' ? (num(s.fields, 'ducked') ? 30 : 48) : 0;
    out.makeTranslation(srcToThree(o.x, o.y, o.z + lift, tmpV));
    return true;
  }

  /** The renderable of an entity (tests, debugging, the HUD's nameplates). */
  renderable(id: number): Renderable | undefined {
    return this.renderables.get(id);
  }

  get count(): number {
    return this.renderables.size;
  }

  /** Resolves when every model and particle bundle requested so far has loaded. */
  async whenLoaded(): Promise<void> {
    await this.opts.models.whenIdle();
    await this.opts.loadout?.whenIdle();
    await this.effects.particles?.whenIdle();
  }

  dispose(): void {
    for (const r of this.renderables.values()) r.dispose();
    this.renderables.clear();
    this.effects.dispose();
    this.viewModel.dispose();
    this.root.removeFromParent();
  }
}

const ZERO = { x: 0, y: 0, z: 0 };
const tmpV = new Vector3();
const tmpO = { x: 0, y: 0, z: 0 };
const order = (t: string) =>
  t === 'player' ? 0 : BUILDING_TYPES.has(t) ? 1 : t === 'flag' ? 3 : 2;
