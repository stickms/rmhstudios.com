/**
 * Shared types of the entity renderer: the per-entity state it consumes (a plain record of a
 * net schema's fields — the client's snapshot mirror, or a single-player world writing the
 * same fields), the context renderables draw into, and per-instance lighting.
 */
import { Matrix4, type Object3D, Vector3, type Vector2, type Vector4 } from 'three';
import type { BspFile, BspWorldLight } from '../../formats/bsp';
import { decompressVis, findLeaf } from '../../formats/bsp';
import { srcDirToThree } from '../coords';
import { newAmbientCube, type AmbientCube, type SunLight, type Vec3Like } from '../lighting';
import type { LoadoutModels } from './loadout-models';
import type { ModelLibrary } from './model-asset';
import { setInstanceLighting, type InstanceUniforms } from './model-material';

export type NetValue = number | string | boolean;

/**
 * One networked entity as the renderer sees it. `fields` uses the schema's field names
 * (sim/net-schema.ts and every registerNetSchema); `origin` / `angles` override the
 * `ox/oy/oz` and `pitch/yaw/roll` fields when the caller interpolates them itself.
 */
export interface EntityState {
  id: number;
  /** Net schema type: 'player', 'projectile', 'sentrygun', 'prop', 'pickup', 'flag', … */
  type: string;
  fields: Readonly<Record<string, NetValue>>;
  origin?: Vec3Like;
  angles?: Vec3Like;
}

export const num = (f: Readonly<Record<string, NetValue>>, k: string, d = 0): number => {
  const v = f[k];
  return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : d;
};
export const str = (f: Readonly<Record<string, NetValue>>, k: string): string => {
  const v = f[k];
  return typeof v === 'string' ? v : '';
};
export const bool = (f: Readonly<Record<string, NetValue>>, k: string): boolean => !!f[k];

export function stateOrigin(s: EntityState, out: { x: number; y: number; z: number }) {
  if (s.origin) {
    out.x = s.origin.x;
    out.y = s.origin.y;
    out.z = s.origin.z;
  } else {
    out.x = num(s.fields, 'ox');
    out.y = num(s.fields, 'oy');
    out.z = num(s.fields, 'oz');
  }
  return out;
}

export function stateAngles(s: EntityState, out: { x: number; y: number; z: number }) {
  if (s.angles) {
    out.x = s.angles.x;
    out.y = s.angles.y;
    out.z = s.angles.z;
  } else {
    out.x = num(s.fields, 'pitch');
    out.y = num(s.fields, 'yaw');
    out.z = num(s.fields, 'roll');
  }
  return out;
}

/** TF_COND bit test over the player record's `cond0…cond4` words. */
export function inCond(f: Readonly<Record<string, NetValue>>, cond: number): boolean {
  const w = num(f, `cond${cond >> 5}`);
  return ((w >>> (cond & 31)) & 1) === 1;
}

/** What the map renderer offers models (WorldRenderer satisfies it). */
export interface LightingSource {
  sampleAmbient(pos: Vec3Like, out?: AmbientCube): AmbientCube;
  readonly sun: SunLight | null;
  readonly sunUniforms: { uSunDir: { value: Vector3 }; uSunColor: { value: Vector3 } };
  readonly shared: { uFogColor: { value: Vector4 }; uFogRange: { value: Vector2 } };
  /** The map, for local world lights (WorldRenderer has these). */
  readonly bsp?: BspFile;
  readonly hdr?: boolean;
  readonly lightScale?: number;
}

/** DWL_FLAGS_INAMBIENTCUBE: the light is already in the leaf ambient cubes. */
const DWL_FLAGS_INAMBIENTCUBE = 0x1;
/** Local lights fainter than this at a model are skipped (lightmap units). */
const LOCAL_LIGHT_MIN = 0.01;

/**
 * The SDK's per-model local lights (engine R_LightVec / the model lighting state): world lights
 * that vrad left out of the ambient cubes, attenuated to a point (Source points, lightmap units).
 */
export function localLightAt(l: BspWorldLight, p: Vec3Like, scale = 1): number {
  const dx = l.origin.x - p.x;
  const dy = l.origin.y - p.y;
  const dz = l.origin.z - p.z;
  const d2 = dx * dx + dy * dy + dz * dz;
  const d = Math.sqrt(d2) || 1;
  if (l.radius > 0 && d > l.radius) return 0;
  let ratio: number;
  if (l.type === 0) {
    // emit_surface: cosine at the emitter over d².
    const dot = -(dx * l.normal.x + dy * l.normal.y + dz * l.normal.z) / d;
    ratio = dot > 0 ? dot / d2 : 0;
  } else {
    const denom = l.constantAttn + l.linearAttn * d + l.quadraticAttn * d2;
    ratio = denom > 0 ? 1 / denom : 0;
    if (l.type === 2) {
      const dot = -(dx * l.normal.x + dy * l.normal.y + dz * l.normal.z) / d;
      if (dot <= l.stopdot2) ratio = 0;
      else if (dot <= l.stopdot) {
        const f = (dot - l.stopdot2) / Math.max(1e-6, l.stopdot - l.stopdot2);
        ratio *= l.exponent > 0 ? Math.pow(f, l.exponent) : f;
      }
    }
  }
  return ratio * scale;
}

/** Everything a renderable needs; owned by EntityRenderer. */
export interface RenderContext {
  models: ModelLibrary;
  lighting: LightingSource | null;
  /** Whether the sun reaches a Source point (a trace in the client); default yes. */
  sunVisible?: (p: Vec3Like) => boolean;
  /** Whether two Source points see each other (local light occlusion); default yes. */
  lineOfSight?: (a: Vec3Like, b: Vec3Like) => boolean;
  /** Parent for entity roots. */
  scene: Object3D;
  /** Render (server) time, seconds. */
  time: number;
  dt: number;
  /** The viewing player (−1: spectator / none) and their team. */
  localPlayer: number;
  localTeam: number;
  /** First person: the local player's body is not drawn. */
  firstPerson: boolean;
  /** Another entity's state this frame (flags carried by players, beams to targets). */
  entity(id: number): EntityState | undefined;
  /** An entity's attachment (or origin) in three world space. */
  attachment(id: number, name: string, out: Matrix4): boolean;
  /** Game of the assets ('tf2' | 'hl2' | 'portal'). */
  game: string;
  /** The loadout model channel (unlock weapons, cosmetics); absent: stock looks only. */
  loadout?: LoadoutModels | null;
  /** The world camera's position (three world space), for level of detail. */
  cameraPosition?: Vector3;
}

/**
 * Ambient cube + sun for one instance, resampled when it moves (16 units) or every 0.25 s
 * (lighting.ts `sampleAmbientCube`, the SDK's per-leaf ambient lighting).
 */
export class LightProbe {
  private readonly cube = newAmbientCube();
  private readonly last = new Vector3(Infinity, 0, 0);
  private lastTime = -Infinity;
  private sunScale = 1;
  private readonly p = { x: 0, y: 0, z: 0 };
  private pvs: Uint8Array | null = null;

  update(
    ctx: RenderContext,
    u: InstanceUniforms,
    origin: Vec3Like,
    height = 40,
    force = false,
  ): void {
    const L = ctx.lighting;
    if (!L) return;
    const dx = origin.x - this.last.x;
    const dy = origin.y - this.last.y;
    const dz = origin.z - this.last.z;
    if (
      !force &&
      dx * dx + dy * dy + dz * dz < 256 &&
      ctx.time - this.lastTime < 0.25 &&
      ctx.time >= this.lastTime
    ) {
      return;
    }
    this.last.set(origin.x, origin.y, origin.z);
    this.lastTime = ctx.time;
    this.p.x = origin.x;
    this.p.y = origin.y;
    this.p.z = origin.z + height;
    L.sampleAmbient(this.p, this.cube);
    this.sunScale = L.sun && (!ctx.sunVisible || ctx.sunVisible(this.p)) ? 1 : 0;
    setInstanceLighting(
      u,
      this.cube,
      L.sunUniforms.uSunDir.value,
      L.sunUniforms.uSunColor.value,
      this.sunScale,
    );
    this.localLights(ctx, u);
  }

  /** The two strongest local lights the point's cluster can see. */
  private localLights(ctx: RenderContext, u: InstanceUniforms): void {
    const L = ctx.lighting!;
    const cols = u.uLocalColor.value;
    cols[0].set(0, 0, 0);
    cols[1].set(0, 0, 0);
    const bsp = L.bsp;
    if (!bsp) return;
    const lights = L.hdr && bsp.worldLightsHdr.length ? bsp.worldLightsHdr : bsp.worldLights;
    const scale = L.hdr && bsp.worldLightsHdr.length ? (L.lightScale ?? 1) : 1;
    const leaf = findLeaf(bsp, this.p);
    const cluster = leaf >= 0 ? bsp.leafs.cluster[leaf] : -1;
    const vis = bsp.visibility;
    this.pvs = vis && cluster >= 0 ? decompressVis(vis, cluster, 0, this.pvs ?? undefined) : null;
    let b0 = -1;
    let b1 = -1;
    let i0 = 0;
    let i1 = 0;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (l.type !== 0 && l.type !== 1 && l.type !== 2) continue;
      if (l.flags & DWL_FLAGS_INAMBIENTCUBE) continue;
      if (this.pvs && l.cluster >= 0 && !(this.pvs[l.cluster >> 3] & (1 << (l.cluster & 7))))
        continue;
      const v = localLightAt(l, this.p, scale);
      const lum = v * (l.intensity.x + l.intensity.y + l.intensity.z);
      if (lum < LOCAL_LIGHT_MIN) continue;
      if (lum > i0) {
        b1 = b0;
        i1 = i0;
        b0 = i;
        i0 = lum;
      } else if (lum > i1) {
        b1 = i;
        i1 = lum;
      }
    }
    const best = [b0, b1];
    for (let k = 0; k < 2; k++) {
      const i = best[k];
      if (i < 0) continue;
      const l = lights[i];
      if (ctx.lineOfSight && !ctx.lineOfSight(this.p, l.origin)) continue;
      const v = localLightAt(l, this.p, scale);
      cols[k].set(l.intensity.x * v, l.intensity.y * v, l.intensity.z * v);
      srcDirToThree(
        l.origin.x - this.p.x,
        l.origin.y - this.p.y,
        l.origin.z - this.p.z,
        u.uLocalDir.value[k],
      ).normalize();
    }
  }
}

/** Team colours (linear) for glows, tints and fallbacks. */
export const TEAM_GLOW: Record<number, Vector3> = {
  2: new Vector3(0.9, 0.18, 0.12),
  3: new Vector3(0.15, 0.35, 0.9),
};

export const scratchMatrix = new Matrix4();
