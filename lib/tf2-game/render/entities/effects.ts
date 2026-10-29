/**
 * Effects driven by the simulation's effect events (sim/events.ts EffectEvent): particle
 * systems by name from the game particle channel (lib/tf2-loadout/particles over the game's
 * bundles), bullet tracers, impacts by surface, explosions with scorch decals, heal beams,
 * flames, muzzle flashes, gibs.
 *
 *   - Particle systems are pooled per name and capped (MAX_LIVE_SYSTEMS); one-shots beyond
 *     LOD_DISTANCE from the camera are not spawned, looping ones there stop simulating.
 *     Soft-particle depth fades and refraction (which need a copy of the scene each frame) are
 *     switched off: one world pass, no capture.
 *   - Tracers are one instanced draw of camera-facing streaks; decals are one instanced draw
 *     of quads laid on the hit plane, a ring buffer (MAX_DECALS) multiplied into the world.
 *   - Gibs are model instances on a ballistic path that bounce on the floor (or on `trace`).
 *
 * Particles live in Source space; the loadout's renderer converts to three space and puts its
 * meshes on layer 1, so the camera must see layer 1 (`update()` enables it).
 */
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  type Camera,
  CanvasTexture,
  Color,
  CustomBlending,
  DstColorFactor,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  type Texture,
  Vector3,
  ZeroFactor,
} from 'three';
import type { GameParticleIndex } from '@/lib/tf2-game/assets/urls';
import { acquireTextures, type LoadedTextures } from '@/lib/tf2-loadout/particles/client';
import { ParticleRenderer } from '@/lib/tf2-loadout/particles/renderer';
import {
  controlPoint,
  ParticleSimulation,
  type ParticleEnvironment,
} from '@/lib/tf2-loadout/particles/simulation';
import {
  PARTICLE_API,
  type ParticleBundle,
  type ParticleManifest,
} from '@/lib/tf2-loadout/particles/types';
import { TF_TEAM_BLUE } from '../../core/constants';
import type { DeathEvent, EffectEvent } from '../../sim/events';
import { SOURCE_UNIT, srcToThree } from '../coords';
import type { Vec3Like } from '../lighting';
import { LightProbe, num, type RenderContext } from './common';
import type { ModelAsset } from './model-asset';
import { ModelInstance } from './model-instance';

export const MAX_LIVE_SYSTEMS = 64;
/** System names `unusual:<effect id>[:<suffix>]` load an unusual effect from the loadout channel. */
export const UNUSUAL_PREFIX = 'unusual:';
/** Source units: one-shots farther than this are skipped, loops stop simulating. */
export const LOD_DISTANCE = 3000;
export const MAX_DECALS = 128;
export const MAX_TRACERS = 64;
/** Tracer streak (TF2 tracers: ~6000 u/s particles; a streak reads at this length). */
export const TRACER_SPEED = 7000;
export const TRACER_LENGTH = 220;
export const TRACER_WIDTH = 1.4;
/** Longest a one-shot may emit before it is stopped, and live after that. */
const ONE_SHOT_EMIT_MAX = 3;
const DRAIN_MAX = 5;
/** Seconds a one-shot may wait for its bundle to load. */
const ONE_SHOT_WAIT = 0.5;

/** Systems worth loading before they are first needed (explosions, muzzle flashes, trails, tracers). */
export const PRELOAD_SYSTEMS = [
  'ExplosionCore_Wall',
  'ExplosionCore_MidAir',
  'ExplosionCore_buildings',
  'rockettrail',
  'critical_rocket_red',
  'critical_rocket_blue',
  'pipebombtrail_red',
  'pipebombtrail_blue',
  'stickybombtrail_red',
  'stickybombtrail_blue',
  'muzzle_scattergun',
  'muzzle_shotgun',
  'muzzle_minigun',
  'muzzle_pistol',
  'muzzle_smg',
  'muzzle_sniperrifle',
  'muzzle_revolver',
  'muzzle_sentry',
  'muzzle_sentry2',
  'impact_concrete',
  'impact_metal',
  'impact_wood',
  'impact_dirt',
  'blood_impact_red_01',
  'flamethrower',
  'flamethrower_blue',
  'medicgun_beam_red',
  'medicgun_beam_blue',
  'burningplayer_red',
  'burningplayer_blue',
];
const GIB_LIFETIME = 10;
const GRAVITY = 800;

/** Bullet impact system by surface name (tf_fx_shared / FX_ImpactEffect, TF's impact_* set). */
export function impactSystemFor(surface: string | undefined): string {
  const s = (surface ?? '').toLowerCase();
  if (/metal|grate|vent|chain|pipe|canister|computer|combine|solidmetal/.test(s))
    return 'impact_metal';
  if (/wood|crate|plank|ladder/.test(s)) return 'impact_wood';
  if (/dirt|grass|sand|gravel|mud|snow|foliage|antlion/.test(s)) return 'impact_dirt';
  if (/concrete|brick|rock|stone|tile|plaster|default/.test(s) || !s) return 'impact_concrete';
  return 'impact_generic_burst';
}

/** Decal kinds (procedural in the decal shader). */
export const DECAL_SCORCH = 0;
export const DECAL_BULLET = 1;
export const DECAL_BLOOD = 2;

export interface FxPlacement {
  /** Source position. */
  pos?: Vec3Like;
  /** Surface normal (orients CP0 like DispatchParticleEffect with an angle). */
  normal?: Vec3Like;
  /** Follow an entity (PATTACH_*_FOLLOW), at an attachment when given. */
  entity?: number;
  attachment?: string;
  /** Second control point (beams): a position, or an entity's centre. */
  cp1?: Vec3Like;
  cp1Entity?: number;
  cp1Attachment?: string;
  /**
   * Control points 0–7 at the attachments the bundle's schema names (`attachment`,
   * `control_point_<n>` — a weapon unusual's `unusual_0…5` on the weapon), looked up on `entity`
   * as `<schemaPrefix><name>`. A point whose attachment is missing stays unset (it reads CP 0);
   * CP 0 falls back to `attachment`.
   */
  schemaPrefix?: string;
  /** Constant control points (a value, not a place: the killstreak colour on CP 9, 0–1). */
  cps?: Record<number, Vec3Like>;
}

interface Fx {
  system: string;
  /** The bundle's schema (attachment names of its control points). */
  schema: Record<string, string>;
  sim: ParticleSimulation;
  renderer: ParticleRenderer;
  env: ParticleEnvironment;
  place: FxPlacement;
  key: string | null;
  age: number;
  stopped: boolean;
  /** Source position of CP0 (for LOD). */
  at: Vector3;
}

interface Tracer {
  start: Vector3;
  dir: Vector3;
  length: number;
  t: number;
  color: Color;
}

interface Gib {
  inst: ModelInstance;
  pos: Vector3;
  vel: Vector3;
  rot: Quaternion;
  spin: Vector3;
  age: number;
  floor: number;
  probe: LightProbe;
}

/** A sim trace for gibs (MapCollision.traceLine in the client). */
export type FxTrace = (
  from: Vec3Like,
  to: Vec3Like,
) => { fraction: number; endPos: Vec3Like; normal: Vec3Like } | null;

const noop = (): void => {};
const tmpM = new Matrix4();
const tmpV = new Vector3();
const tmpV2 = new Vector3();
const tmpQ = new Quaternion();
const GL_TO_SOURCE = new Quaternion().setFromRotationMatrix(
  new Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1),
);

/** Loads game particle bundles by system name (`particles/index.json`) and their textures. */
export class ParticleLibrary {
  private index: Promise<GameParticleIndex | null> | null = null;
  private readonly bundles = new Map<
    string,
    Promise<{ bundle: ParticleBundle; textures: LoadedTextures } | null>
  >();
  private readonly ready = new Map<
    string,
    { bundle: ParticleBundle; textures: LoadedTextures } | null
  >();
  private readonly fallback: Texture | undefined;

  private unusualManifest: Promise<ParticleManifest | null> | null = null;
  private readonly unusualUrl: (path: string) => string;

  /**
   * `url` resolves a game particle channel path; `opts.unusualUrl` the loadout particle
   * channel's (unusual effects by effect id, PARTICLE_API by default).
   */
  constructor(
    private readonly url: (path: string) => string,
    opts: { unusualUrl?: (path: string) => string } = {},
  ) {
    this.fallback = typeof document !== 'undefined' ? softDiscTexture() : undefined;
    this.unusualUrl = opts.unusualUrl ?? ((p) => PARTICLE_API + p);
  }

  /** The loadout channel's bundle for `unusual:<effect id>[:<item particle suffix>]`. */
  private async loadUnusual(
    system: string,
  ): Promise<{ bundle: ParticleBundle; textures: LoadedTextures } | null> {
    this.unusualManifest ??= fetch(this.unusualUrl('manifest.json'))
      .then((r) => (r.ok ? (r.json() as Promise<ParticleManifest>) : null))
      .catch(() => null);
    const manifest = await this.unusualManifest;
    const path = manifest?.effects[system.slice(UNUSUAL_PREFIX.length)];
    if (!path || !/^effects\/[a-f0-9]{40,64}\.json$/.test(path)) return null;
    const r = await fetch(this.unusualUrl(path));
    if (!r.ok) return null;
    const bundle = (await r.json()) as ParticleBundle;
    if (bundle.v !== 1) return null;
    const textures = await acquireTextures(bundle, {
      url: (p2) => this.unusualUrl(p2),
      fallback: this.fallback,
    });
    return { bundle, textures };
  }

  loadIndex(): Promise<GameParticleIndex | null> {
    this.index ??= fetch(this.url('particles/index.json'))
      .then((r) => (r.ok ? (r.json() as Promise<GameParticleIndex>) : null))
      .catch(() => null);
    return this.index;
  }

  load(system: string): Promise<{ bundle: ParticleBundle; textures: LoadedTextures } | null> {
    let p = this.bundles.get(system);
    if (!p) {
      p = (async () => {
        if (system.startsWith(UNUSUAL_PREFIX)) return this.loadUnusual(system);
        const idx = await this.loadIndex();
        const path = idx?.systems[system];
        if (!path) return null;
        const r = await fetch(this.url(`particles/${path}`));
        if (!r.ok) return null;
        const bundle = (await r.json()) as ParticleBundle;
        const textures = await acquireTextures(bundle, {
          url: (p2) => this.url(`particles/${p2}`),
          fallback: this.fallback,
        });
        return { bundle, textures };
      })().catch(() => null);
      void p.then((v) => this.ready.set(system, v));
      this.bundles.set(system, p);
    }
    return p;
  }

  /** Loaded bundle, null when missing, undefined while loading (starts the load). */
  peek(system: string): { bundle: ParticleBundle; textures: LoadedTextures } | null | undefined {
    if (this.ready.has(system)) return this.ready.get(system);
    void this.load(system);
    return undefined;
  }

  async whenIdle(): Promise<void> {
    await Promise.all(this.bundles.values());
  }

  /** Starts loading systems ahead of their first use. */
  preload(systems: readonly string[] = PRELOAD_SYSTEMS): void {
    for (const s of systems) void this.load(s);
  }

  dispose(): void {
    for (const v of this.ready.values()) v?.textures.dispose();
    this.ready.clear();
    this.bundles.clear();
    this.fallback?.dispose();
  }
}

/** A soft white disc for particle materials whose texture the install lacked. */
function softDiscTexture(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new CanvasTexture(c);
  t.flipY = false;
  return t;
}

/** Puts a simulation back to its start for reuse (pooling). */
function resetSimulation(sim: ParticleSimulation): void {
  for (const sys of sim.systems) {
    for (const p of sys.particles) sys.pool.push(p);
    sys.particles.length = 0;
    sys.time = -sys.delay;
    sys.started = false;
    sys.emitterState.fill(0);
    delete (sys as { emit?: unknown }).emit;
  }
  sim.time = 0;
  sim.accumulator = 0;
  sim.remaining = 16000;
}

function liveParticles(sim: ParticleSimulation): number {
  let n = 0;
  for (const s of sim.systems) n += s.particles.length;
  return n;
}

const DECAL_VERT = /* glsl */ `
attribute float aKind;
attribute float aFade;
attribute float aSeed;
varying vec2 vUv;
varying float vKind;
varying float vFade;
varying float vSeed;
void main() {
  vUv = uv;
  vKind = aKind;
  vFade = aFade;
  vSeed = aSeed;
  gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const DECAL_FRAG = /* glsl */ `
varying vec2 vUv;
varying float vKind;
varying float vFade;
varying float vSeed;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + vSeed) * 43758.5453); }
float n2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y);
}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float rough = n2(vec2(a * 3.0, vSeed)) * 0.35 + n2(p * 6.0) * 0.25;
  float shape = 1.0 - smoothstep(0.45 + rough * 0.5, 0.95, r);
  vec3 col;
  if (vKind < 0.5) {         // scorch
    col = mix(vec3(0.06, 0.05, 0.045), vec3(0.35, 0.3, 0.27), smoothstep(0.0, 0.9, r + n2(p * 9.0) * 0.3));
  } else if (vKind < 1.5) {  // bullet hole
    shape = 1.0 - smoothstep(0.3, 0.7, r + n2(p * 5.0) * 0.2);
    col = mix(vec3(0.05), vec3(0.45), smoothstep(0.1, 0.6, r));
  } else {                   // blood
    shape *= smoothstep(0.2, 0.8, n2(p * 4.0 + vSeed));
    col = vec3(0.35, 0.03, 0.02);
  }
  float k = shape * vFade;
  gl_FragColor = vec4(mix(vec3(1.0), col, k), 1.0);
}
`;

export class EffectSystem {
  /** World-space effects (add to the world scene). */
  readonly group = new Group();
  /** Effects drawn with the view model (its own scene/projection). */
  readonly vmGroup = new Group();
  private readonly live: Fx[] = [];
  private readonly pool = new Map<string, Fx[]>();
  private readonly loops = new Map<string, Fx>();
  private readonly pending = new Map<
    string,
    FxPlacement & { system: string; parent: 'world' | 'vm' }
  >();
  /** One-shots waiting for their bundle (played if it arrives within ONE_SHOT_WAIT). */
  private readonly waiting: Array<{
    system: string;
    place: FxPlacement;
    parent: 'world' | 'vm';
    age: number;
  }> = [];
  private readonly tracers: Tracer[] = [];
  private readonly tracerMesh: InstancedMesh;
  private readonly decalMesh: InstancedMesh;
  private readonly decalKind: InstancedBufferAttribute;
  private readonly decalFade: InstancedBufferAttribute;
  private readonly decalSeed: InstancedBufferAttribute;
  private decalNext = 0;
  private decalCount = 0;
  private readonly debris: Gib[] = [];
  private readonly cam = new Vector3();
  private readonly camSrc = { x: 0, y: 0, z: 0 };
  trace: FxTrace | null = null;
  /** Live particle systems (stats). */
  get liveSystems(): number {
    return this.live.length;
  }

  /** sv_gravity as the server replicates it: gibs fall by it (C_Gib's gravity × sv_gravity). */
  gravity = GRAVITY;

  constructor(readonly particles: ParticleLibrary | null) {
    this.group.name = 'fx';
    this.vmGroup.name = 'fx-viewmodel';
    // Tracers: a unit quad along +X (0…1), ±0.5 across Y.
    const tq = new BufferGeometry();
    tq.setAttribute(
      'position',
      new BufferAttribute(new Float32Array([0, -0.5, 0, 1, -0.5, 0, 1, 0.5, 0, 0, 0.5, 0]), 3),
    );
    tq.setAttribute('uv', new BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]), 2));
    tq.setIndex([0, 1, 2, 0, 2, 3]);
    this.tracerMesh = new InstancedMesh(
      tq,
      new MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
      MAX_TRACERS,
    );
    this.tracerMesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.tracerMesh.count = 0;
    this.tracerMesh.frustumCulled = false;
    this.tracerMesh.name = 'tracers';
    this.group.add(this.tracerMesh);
    // Decals.
    const dq = new PlaneGeometry(1, 1);
    this.decalKind = new InstancedBufferAttribute(new Float32Array(MAX_DECALS), 1);
    this.decalFade = new InstancedBufferAttribute(new Float32Array(MAX_DECALS), 1);
    this.decalSeed = new InstancedBufferAttribute(new Float32Array(MAX_DECALS), 1);
    dq.setAttribute('aKind', this.decalKind);
    dq.setAttribute('aFade', this.decalFade);
    dq.setAttribute('aSeed', this.decalSeed);
    this.decalMesh = new InstancedMesh(
      dq,
      new ShaderMaterial({
        vertexShader: DECAL_VERT,
        fragmentShader: DECAL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: CustomBlending,
        blendSrc: DstColorFactor,
        blendDst: ZeroFactor,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
      MAX_DECALS,
    );
    this.decalMesh.count = 0;
    this.decalMesh.frustumCulled = false;
    this.decalMesh.renderOrder = -1;
    this.decalMesh.name = 'decals';
    this.group.add(this.decalMesh);
  }

  // ─── particles ────────────────────────────────────────────────────────────

  /** A particle system that plays once (then drains and returns to the pool). */
  oneShot(system: string, place: FxPlacement, parent: 'world' | 'vm' = 'world'): void {
    if (place.pos && this.distance(place.pos) > LOD_DISTANCE && parent === 'world') return;
    this.spawn(system, place, null, parent);
  }

  /** A looping system under `key` until `stop(key)` (flames, burning, beams, trails). */
  loop(key: string, system: string, place: FxPlacement, parent: 'world' | 'vm' = 'world'): void {
    const cur = this.loops.get(key);
    if (cur && cur.system === system && !cur.stopped) {
      cur.place = place;
      return;
    }
    if (cur) this.stop(key);
    this.spawn(system, place, key, parent);
  }

  stop(key: string): void {
    this.pending.delete(key);
    const fx = this.loops.get(key);
    if (!fx) return;
    this.loops.delete(key);
    this.stopEmission(fx);
  }

  isLooping(key: string): boolean {
    return this.loops.has(key) || this.pending.has(key);
  }

  private stopEmission(fx: Fx): void {
    if (fx.stopped) return;
    fx.stopped = true;
    for (const sys of fx.sim.systems) (sys as unknown as { emit: () => void }).emit = noop;
  }

  private spawn(
    system: string,
    place: FxPlacement,
    key: string | null,
    parent: 'world' | 'vm',
  ): void {
    const lib = this.particles;
    if (!lib) return;
    const loaded = lib.peek(system);
    if (loaded === undefined) {
      // Not loaded yet: loops wait for it; one-shots wait a moment, then are dropped.
      if (key) this.pending.set(key, { ...place, system, parent });
      else if (this.waiting.length < 32) this.waiting.push({ system, place, parent, age: 0 });
      void lib.load(system);
      return;
    }
    if (!loaded) return;
    if (this.live.length >= MAX_LIVE_SYSTEMS) {
      // Cap: retire the oldest one-shot.
      const victim = this.live.find((f) => !f.key);
      if (!victim) return;
      this.retire(victim);
    }
    const fx = this.take(system, loaded.bundle, loaded.textures);
    if (!fx) return;
    fx.place = place;
    fx.key = key;
    fx.age = 0;
    fx.stopped = false;
    this.placeFx(fx, true);
    (parent === 'vm' ? this.vmGroup : this.group).add(fx.renderer.group);
    this.live.push(fx);
    if (key) this.loops.set(key, fx);
  }

  private take(system: string, bundle: ParticleBundle, textures: LoadedTextures): Fx | null {
    const pooled = this.pool.get(system)?.pop();
    if (pooled) {
      resetSimulation(pooled.sim);
      return pooled;
    }
    try {
      const env: ParticleEnvironment = {
        points: new Map([[0, controlPoint()]]),
        player: new Vector3(),
      };
      const sim = new ParticleSimulation(bundle, env);
      // The renderer must not release the library's shared textures.
      const renderer = new ParticleRenderer(sim, { get: textures.get, dispose: noop });
      for (const layer of renderer.layers) {
        const defs = layer.material.defines as Record<string, unknown>;
        if (defs.REFRACT) layer.mesh.visible = false;
        if (defs.SOFT_PARTICLE) {
          delete defs.SOFT_PARTICLE;
          layer.material.needsUpdate = true;
        }
      }
      return {
        system,
        schema: bundle.schema ?? {},
        sim,
        renderer,
        env,
        place: {},
        key: null,
        age: 0,
        stopped: false,
        at: new Vector3(),
      };
    } catch {
      return null;
    }
  }

  private retire(fx: Fx): void {
    const i = this.live.indexOf(fx);
    if (i >= 0) this.live.splice(i, 1);
    if (fx.key && this.loops.get(fx.key) === fx) this.loops.delete(fx.key);
    fx.renderer.group.removeFromParent();
    let list = this.pool.get(fx.system);
    if (!list) this.pool.set(fx.system, (list = []));
    if (list.length < 8) list.push(fx);
    else fx.renderer.dispose();
  }

  private ctx: RenderContext | null = null;

  /** Moves CP0 (and CP1) to the effect's placement (Source space). */
  private placeFx(fx: Fx, first: boolean): void {
    const p = fx.place;
    const cp0 = fx.env.points.get(0)!;
    let placed = false;
    if (p.schemaPrefix !== undefined && p.entity !== undefined && this.ctx) {
      for (let i = 0; i < 8; i++) {
        const name = i === 0 ? fx.schema.attachment : fx.schema[`control_point_${i}`];
        if (!name || !this.ctx.attachment(p.entity, p.schemaPrefix + name.toLowerCase(), tmpM))
          continue;
        let cp = fx.env.points.get(i);
        if (!cp) fx.env.points.set(i, (cp = controlPoint()));
        tmpM.decompose(tmpV, tmpQ, tmpV2);
        glToSourceV(tmpV, cp.position);
        cp.rotation.copy(tmpQ).premultiply(GL_TO_SOURCE);
        if (first) {
          cp.previous.copy(cp.position);
          cp.previousRotation.copy(cp.rotation);
        }
        if (i === 0) placed = true;
      }
    }
    if (p.cps) {
      for (const [k, v] of Object.entries(p.cps)) {
        const i = Number(k);
        let cp = fx.env.points.get(i);
        if (!cp) fx.env.points.set(i, (cp = controlPoint()));
        cp.position.set(v.x, v.y, v.z);
        cp.previous.copy(cp.position);
      }
    }
    if (!placed && p.entity !== undefined && this.ctx) {
      if (this.ctx.attachment(p.entity, p.attachment ?? '', tmpM)) {
        tmpM.decompose(tmpV, tmpQ, tmpV2);
        glToSourceV(tmpV, cp0.position);
        cp0.rotation.copy(tmpQ).premultiply(GL_TO_SOURCE);
        placed = true;
      }
    }
    if (!placed && p.pos) {
      cp0.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (p.normal) normalToRotation(p.normal, cp0.rotation);
    }
    if (p.cp1 || p.cp1Entity !== undefined) {
      let cp1 = fx.env.points.get(1);
      if (!cp1) fx.env.points.set(1, (cp1 = controlPoint()));
      if (
        p.cp1Entity !== undefined &&
        this.ctx?.attachment(p.cp1Entity, p.cp1Attachment ?? '', tmpM)
      ) {
        tmpV.setFromMatrixPosition(tmpM);
        glToSourceV(tmpV, cp1.position);
      } else if (p.cp1) cp1.position.set(p.cp1.x, p.cp1.y, p.cp1.z);
      if (first) {
        cp1.previous.copy(cp1.position);
        cp1.previousRotation.copy(cp1.rotation);
      }
    }
    if (first) {
      cp0.previous.copy(cp0.position);
      cp0.previousRotation.copy(cp0.rotation);
    }
    fx.at.copy(cp0.position);
  }

  private distance(p: Vec3Like): number {
    return Math.hypot(p.x - this.camSrc.x, p.y - this.camSrc.y, p.z - this.camSrc.z);
  }

  // ─── tracers and decals ───────────────────────────────────────────────────

  /** A bullet tracer from start to end (Source points). */
  tracer(start: Vec3Like, end: Vec3Like, team = 0, crit = false): void {
    const s = srcToThree(start.x, start.y, start.z, new Vector3());
    const e = srcToThree(end.x, end.y, end.z, new Vector3());
    const dir = e.sub(s);
    const length = dir.length();
    if (length < 1e-3) return;
    dir.divideScalar(length);
    if (this.tracers.length >= MAX_TRACERS) this.tracers.shift();
    const color = crit
      ? team === TF_TEAM_BLUE
        ? new Color(0.4, 0.6, 1.6)
        : new Color(1.6, 0.4, 0.3)
      : new Color(1.4, 1.1, 0.6);
    this.tracers.push({ start: s, dir, length, t: 0, color });
  }

  /** A decal on a surface (Source point and normal), sized in Source units. */
  decal(kind: number, pos: Vec3Like, normal: Vec3Like, size: number): void {
    const n = new Vector3(normal.y, normal.z, normal.x).normalize();
    if (n.lengthSq() < 0.5) return;
    const p = srcToThree(pos.x, pos.y, pos.z, new Vector3()).addScaledVector(n, 0.3 * SOURCE_UNIT);
    const up = Math.abs(n.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    const xa = new Vector3().crossVectors(up, n).normalize();
    const ya = new Vector3().crossVectors(n, xa);
    const ang = Math.random() * Math.PI * 2;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    const sz = size * SOURCE_UNIT;
    const x2 = xa.clone().multiplyScalar(c).addScaledVector(ya, s).multiplyScalar(sz);
    const y2 = ya.clone().multiplyScalar(c).addScaledVector(xa, -s).multiplyScalar(sz);
    tmpM.makeBasis(x2, y2, n).setPosition(p);
    const i = this.decalNext;
    this.decalMesh.setMatrixAt(i, tmpM);
    this.decalKind.setX(i, kind);
    this.decalFade.setX(i, 1);
    this.decalSeed.setX(i, Math.random() * 100);
    this.decalNext = (i + 1) % MAX_DECALS;
    this.decalCount = Math.min(MAX_DECALS, this.decalCount + 1);
    this.decalMesh.count = this.decalCount;
    this.decalMesh.instanceMatrix.needsUpdate = true;
    this.decalKind.needsUpdate = true;
    this.decalFade.needsUpdate = true;
    this.decalSeed.needsUpdate = true;
  }

  // ─── gibs ─────────────────────────────────────────────────────────────────

  /** Player gibs (SDK C_TFPlayer::CreatePlayerGibs): every gib model of the class, flung. */
  gibs(cls: string, origin: Vec3Like, ev: DeathEvent | null, ctx: RenderContext): void {
    void this.spawnGibs(`models/player/gibs/${cls}gib`, origin, ctx, 1);
    if (ev?.crit)
      this.oneShot('ExplosionCore_MidAir', { pos: { x: origin.x, y: origin.y, z: origin.z + 40 } });
  }

  /** Building gibs from the building model (models/buildables/gibs/<model>_gib*). */
  buildingGibs(model: string, origin: Vec3Like, ctx: RenderContext): void {
    const base = /models\/buildables\/(\w+?)(?:_light|_heavy)?\.mdl/.exec(model.toLowerCase())?.[1];
    if (!base) return;
    const name =
      base === 'dispenser_lvl2' ? 'dispenser' : base === 'dispenser_lvl3' ? 'dispenser' : base;
    void this.spawnGibs(`models/buildables/gibs/${name}_gib`, origin, ctx, 0.7);
  }

  private async spawnGibs(
    prefix: string,
    origin: Vec3Like,
    ctx: RenderContext,
    force: number,
  ): Promise<void> {
    const index = await ctx.models.loadIndex();
    if (!index) return;
    const paths = Object.keys(index).filter((k) => k.startsWith(prefix));
    for (const path of paths.slice(0, 12)) {
      const asset: ModelAsset | null = await ctx.models.asset(path);
      if (!asset) continue;
      const inst = new ModelInstance(asset, { fog: ctx.lighting?.shared, noAnim: true });
      const a = Math.random() * Math.PI * 2;
      const sp = (150 + Math.random() * 250) * force;
      const gib: Gib = {
        inst,
        pos: new Vector3(
          origin.x + Math.cos(a) * 8,
          origin.y + Math.sin(a) * 8,
          origin.z + 30 + Math.random() * 30,
        ),
        vel: new Vector3(Math.cos(a) * sp, Math.sin(a) * sp, (250 + Math.random() * 300) * force),
        rot: new Quaternion().setFromAxisAngle(
          new Vector3(Math.random(), Math.random(), Math.random()).normalize(),
          Math.random() * 6,
        ),
        spin: new Vector3(
          Math.random() - 0.5,
          Math.random() - 0.5,
          Math.random() - 0.5,
        ).multiplyScalar(14),
        age: 0,
        floor: origin.z,
        probe: new LightProbe(),
      };
      this.group.add(inst.root);
      this.debris.push(gib);
    }
  }

  private updateGibs(ctx: RenderContext): void {
    const dt = ctx.dt;
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const g = this.debris[i];
      g.age += dt;
      if (g.age > GIB_LIFETIME) {
        g.inst.dispose();
        this.debris.splice(i, 1);
        continue;
      }
      g.vel.z -= this.gravity * dt;
      const next = tmpV.copy(g.pos).addScaledVector(g.vel, dt);
      let hit = false;
      if (this.trace) {
        const tr = this.trace(g.pos, next);
        if (tr && tr.fraction < 1) {
          const n = tmpV2.set(tr.normal.x, tr.normal.y, tr.normal.z);
          const vn = g.vel.dot(n);
          g.vel.addScaledVector(n, -1.4 * vn).multiplyScalar(0.6);
          g.pos.set(tr.endPos.x + n.x, tr.endPos.y + n.y, tr.endPos.z + n.z);
          hit = true;
        }
      } else if (next.z < g.floor + 2) {
        next.z = g.floor + 2;
        g.vel.z = Math.abs(g.vel.z) * 0.35;
        g.vel.x *= 0.6;
        g.vel.y *= 0.6;
        hit = true;
      }
      if (!hit) g.pos.copy(next);
      if (hit) g.spin.multiplyScalar(0.6);
      tmpQ.setFromAxisAngle(tmpV.copy(g.spin).normalize(), g.spin.length() * dt);
      if (g.spin.lengthSq() > 1e-6) g.rot.multiply(tmpQ);
      // Place: Source position, three rotation applied in model space.
      srcToThree(g.pos.x, g.pos.y, g.pos.z, tmpV);
      g.inst.root.matrix.compose(tmpV, g.rot, tmpV2.set(1, 1, 1));
      g.inst.root.matrixWorldNeedsUpdate = true;
      g.inst.uniforms.uAlpha.value = g.age > GIB_LIFETIME - 1 ? GIB_LIFETIME - g.age : 1;
      g.probe.update(ctx, g.inst.uniforms, g.pos, 8);
      g.inst.updateMatrices();
    }
  }

  // ─── events ───────────────────────────────────────────────────────────────

  /** Handles one simulation effect event. */
  handle(ev: EffectEvent, ctx: RenderContext): void {
    this.ctx = ctx;
    const teamOf = (id: number | undefined) =>
      id !== undefined ? num(ctx.entity(id)?.fields ?? {}, 'team') : 0;
    switch (ev.kind) {
      case 'particle': {
        if (!ev.system) return;
        if (ev.entity !== undefined && ev.value === 1) {
          this.loop(`p:${ev.entity}:${ev.system}`, ev.system, {
            entity: ev.entity,
            attachment: ev.attachment,
            pos: ev.pos,
          });
        } else if (ev.entity !== undefined && ev.value === 0) {
          this.stop(`p:${ev.entity}:${ev.system}`);
        } else {
          this.oneShot(ev.system, {
            pos: ev.pos,
            normal: ev.normal,
            entity: ev.attachment ? ev.entity : undefined,
            attachment: ev.attachment,
          });
        }
        return;
      }
      case 'muzzleflash':
        if (ev.system)
          this.oneShot(ev.system, {
            entity: ev.entity,
            attachment: ev.attachment ?? 'muzzle',
            pos: ev.pos,
          });
        return;
      case 'tracer': {
        const team = ev.team ?? teamOf(ev.entity);
        const start = this.tracerStart(ev, ctx) ?? ev.start ?? ev.pos;
        this.tracer(start, ev.end ?? ev.pos, team, (ev.value ?? 0) >= 2);
        return;
      }
      case 'impact':
        this.oneShot(impactSystemFor(ev.material), { pos: ev.pos, normal: ev.normal });
        if (ev.normal) this.decal(DECAL_BULLET, ev.pos, ev.normal, 4);
        return;
      case 'blood':
        this.oneShot('blood_impact_red_01', { pos: ev.pos, normal: ev.normal });
        return;
      case 'explosion': {
        const system = ev.system || (ev.normal ? 'ExplosionCore_Wall' : 'ExplosionCore_MidAir');
        this.oneShot(system, { pos: ev.pos, normal: ev.normal });
        return;
      }
      case 'decal':
        if (ev.normal) {
          const kind = /scorch/i.test(ev.system ?? '')
            ? DECAL_SCORCH
            : /blood/i.test(ev.system ?? '')
              ? DECAL_BLOOD
              : DECAL_BULLET;
          this.decal(
            kind,
            ev.pos,
            ev.normal,
            kind === DECAL_SCORCH ? 64 : kind === DECAL_BLOOD ? 24 : 4,
          );
        }
        return;
      case 'beam': {
        const sys = ev.system ?? '';
        if (sys === 'dispenser_heal_stop') {
          this.stop(`beam:${ev.entity}:${ev.value}`);
          return;
        }
        if (/^dispenser_heal/.test(sys)) {
          this.loop(`beam:${ev.entity}:${ev.value}`, sys, {
            entity: ev.entity,
            attachment: 'heal_origin',
            pos: ev.pos,
            cp1Entity: ev.value,
            cp1Attachment: 'chest',
          });
          return;
        }
        // Medi Gun: value = target id, 0 stops (CWeaponMedigun::ManageChargeEffect / beam).
        const key = `beam:${ev.entity}`;
        if (!ev.value) this.stop(key);
        else
          this.loop(key, sys, {
            entity: ev.entity,
            attachment: 'muzzle',
            pos: ev.pos,
            cp1Entity: ev.value,
            cp1Attachment: 'chest',
          });
        return;
      }
      case 'spark':
        this.oneShot('impact_metal', { pos: ev.pos, normal: ev.normal ?? { x: 0, y: 0, z: 1 } });
        return;
      case 'gibs':
        if (ev.system && /buildables/.test(ev.system)) this.buildingGibs(ev.system, ev.pos, ctx);
        return;
      default:
        // crittext, shake, fade, ragdoll: HUD / camera / player renderer.
        return;
    }
  }

  /** Tracers start at the shooter's muzzle attachment when it is drawn. */
  private tracerStart(ev: EffectEvent, ctx: RenderContext): Vec3Like | null {
    if (ev.entity === undefined) return null;
    if (!ctx.attachment(ev.entity, ev.attachment ?? 'muzzle', tmpM)) return null;
    tmpV.setFromMatrixPosition(tmpM);
    return { x: tmpV.z / SOURCE_UNIT, y: tmpV.x / SOURCE_UNIT, z: tmpV.y / SOURCE_UNIT };
  }

  // ─── per frame ────────────────────────────────────────────────────────────

  update(ctx: RenderContext, camera: Camera): void {
    this.ctx = ctx;
    camera.layers.enable(1);
    camera.getWorldPosition(this.cam);
    this.camSrc.x = this.cam.z / SOURCE_UNIT;
    this.camSrc.y = this.cam.x / SOURCE_UNIT;
    this.camSrc.z = this.cam.y / SOURCE_UNIT;
    // Loops whose bundle arrived.
    for (const [key, p] of [...this.pending]) {
      const loaded = this.particles?.peek(p.system);
      if (loaded === undefined) continue;
      this.pending.delete(key);
      if (loaded) this.spawn(p.system, p, key, p.parent);
    }
    const dt = ctx.dt;
    for (let i = this.waiting.length - 1; i >= 0; i--) {
      const w = this.waiting[i];
      w.age += dt;
      const loaded = this.particles?.peek(w.system);
      if (loaded === undefined && w.age < ONE_SHOT_WAIT) continue;
      this.waiting.splice(i, 1);
      if (loaded) this.spawn(w.system, w.place, null, w.parent);
    }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const fx = this.live[i];
      fx.age += dt;
      if (!fx.key && !fx.stopped && fx.age > ONE_SHOT_EMIT_MAX) this.stopEmission(fx);
      this.placeFx(fx, false);
      const far = this.distance(fx.at) > LOD_DISTANCE;
      fx.renderer.group.visible = !far;
      if (!far) fx.sim.advance(dt);
      const done =
        (fx.stopped || !fx.key) &&
        fx.age > 0.25 &&
        (liveParticles(fx.sim) === 0 || fx.age > ONE_SHOT_EMIT_MAX + DRAIN_MAX);
      if (done && (fx.stopped || this.emittersFinished(fx))) {
        this.retire(fx);
        continue;
      }
      if (!far) fx.renderer.update(camera, 1);
    }
    this.updateTracers(dt, camera);
    this.updateGibs(ctx);
  }

  private emittersFinished(fx: Fx): boolean {
    // A one-shot whose emitters have a duration is finished once past it; an endless emitter
    // is cut at ONE_SHOT_EMIT_MAX (stopEmission).
    return fx.sim.systems.every((s) =>
      s.definition.emitters.every((e) => {
        const dur = Number(e.params.emission_duration ?? 0);
        return (
          e.function === 'emit_instantaneously' ||
          (dur > 0 && s.time > Number(e.params.emission_start_time ?? 0) + dur)
        );
      }),
    );
  }

  private updateTracers(dt: number, camera: Camera): void {
    const m = this.tracerMesh;
    const camPos = camera.getWorldPosition(tmpV2);
    let n = 0;
    const L = TRACER_LENGTH * SOURCE_UNIT;
    const W = TRACER_WIDTH * SOURCE_UNIT;
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.t += TRACER_SPEED * SOURCE_UNIT * dt;
      const head = Math.min(t.t, t.length);
      const tail = Math.max(0, t.t - L);
      if (tail >= t.length) {
        this.tracers.splice(i, 1);
        continue;
      }
      const a = tmpV.copy(t.start).addScaledVector(t.dir, tail);
      const len = head - tail;
      const toCam = new Vector3().subVectors(camPos, a);
      const side = new Vector3().crossVectors(t.dir, toCam).normalize().multiplyScalar(W);
      const normal = new Vector3().crossVectors(t.dir, side).normalize();
      tmpM.makeBasis(t.dir.clone().multiplyScalar(len), side, normal).setPosition(a);
      m.setMatrixAt(n, tmpM);
      m.setColorAt(n, t.color);
      n++;
    }
    m.count = n;
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  /** Stops every effect following an entity (it was removed). */
  stopEntity(id: number): void {
    for (const [key, fx] of [...this.loops])
      if (fx.place.entity === id || fx.place.cp1Entity === id) this.stop(key);
    for (const [key, p] of [...this.pending]) if (p.entity === id) this.pending.delete(key);
  }

  dispose(): void {
    for (const fx of this.live) fx.renderer.dispose();
    for (const list of this.pool.values()) for (const fx of list) fx.renderer.dispose();
    this.live.length = 0;
    this.pool.clear();
    this.loops.clear();
    for (const g of this.debris) g.inst.dispose();
    this.debris.length = 0;
    this.tracerMesh.geometry.dispose();
    (this.tracerMesh.material as MeshBasicMaterial).dispose();
    this.decalMesh.geometry.dispose();
    (this.decalMesh.material as ShaderMaterial).dispose();
    this.group.clear();
    this.vmGroup.clear();
  }
}

function glToSourceV(gl: Vector3, out: Vector3): Vector3 {
  return out.set(gl.z / SOURCE_UNIT, gl.x / SOURCE_UNIT, gl.y / SOURCE_UNIT);
}

/** A CP rotation whose +X (Source forward) points along a surface normal. */
function normalToRotation(n: Vec3Like, out: Quaternion): Quaternion {
  return out.setFromUnitVectors(new Vector3(1, 0, 0), new Vector3(n.x, n.y, n.z).normalize());
}
