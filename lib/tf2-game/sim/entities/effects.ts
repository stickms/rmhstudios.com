/**
 * Visual and audio map entities: they never change the game, but they take
 * the map's inputs and expose what the renderer and the sound system need.
 *
 * - ambient_generic (server/sound.cpp CAmbientGeneric): PlaySound / StopSound
 *   / ToggleSound / Volume / Pitch / FadeIn / FadeOut → sound events, plus a
 *   net record so a late joiner hears looping sounds.
 * - prop_dynamic(_override), prop_physics(_multiplayer/_override)
 *   (server/props.cpp): model, skin, body, visibility, animation (sequence
 *   name + start time for the client to play), collision toggles. Physics
 *   props are static here (TF2's are cosmetic clutter); their collision comes
 *   from `addMapPropCollision` at load. Dynamic props collide as their hull box
 *   when a model-bounds resolver is installed (`setPropBoundsResolver`).
 * - info_particle_system, env_sprite, env_lightglow, point_spotlight,
 *   env_spark, env_smokestack: an `fx` record when they have a name (so I/O can
 *   change them); unnamed ones are static and the renderer reads the BSP lump.
 * - env_shake / env_fade: effect events.
 * - info_observer_point: spectator cameras.
 * - env_fog_controller: networked fog parameters.
 * - Everything else these maps use that is compile-time or purely cosmetic
 *   (lights, ropes, soundscapes, tonemap, colour correction, sky camera,
 *   shadow/water LOD control, devshot cameras, intro viewpoints, decals,
 *   phys_constraint, …) is registered as an inert entity that accepts its
 *   inputs, so nothing a map sends is silently unknown.
 */

import { TEAM_UNASSIGNED } from '../../core/constants';
import { vec3, type Vec3 } from '../../core/vec';
import { EF_NODRAW, type Entity, FSOLID_NOT_SOLID, SOLID_BBOX, SOLID_NONE } from '../entity';
import { registerEntityClass } from '../entity-registry';
import type { NetRecord, NetSchema } from '../net-schema';
import { MapEntity, atof, atoi } from './base';
import { NET_AMBIENT, NET_FOG, NET_FX, NET_OBSERVER_POINT, NET_PROP } from './net';
import type { LoadedMap } from '../map-loader';
import type { PropCollisionModel } from '../../world/prop-collision';

// ─── ambient_generic ───────────────────────────────────────────────────────

const SF_AMBIENT_SOUND_EVERYWHERE = 1;
const SF_AMBIENT_SOUND_START_SILENT = 16;
const SF_AMBIENT_SOUND_NOT_LOOPING = 32;

export class AmbientGeneric extends MapEntity {
  sound = '';
  volume = 10;
  pitch = 100;
  radius = 1250;
  playing = false;
  startedAt = 0;
  sourceName = '';
  private source = -1;

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'message':
        this.sound = value;
        return true;
      case 'health':
        this.volume = atof(value);
        return true;
      case 'pitch':
        this.pitch = atof(value);
        return true;
      case 'radius':
        this.radius = atof(value);
        return true;
      case 'sourceentityname':
        this.sourceName = value;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  get looped(): boolean {
    return (this.spawnflags & SF_AMBIENT_SOUND_NOT_LOOPING) === 0;
  }

  override activate(): void {
    super.activate();
    if (this.sourceName) {
      const s = this.world.findByName(this.sourceName);
      this.source = s ? s.id : -1;
    }
    // A looped sound that doesn't start silent starts with the map.
    if (this.sound && this.looped && !(this.spawnflags & SF_AMBIENT_SOUND_START_SILENT))
      this.play();
  }

  private emitAt(stop: boolean): void {
    const world = this.world;
    if (!world.isServer) return;
    const everywhere = (this.spawnflags & SF_AMBIENT_SOUND_EVERYWHERE) !== 0;
    world.events.push({
      type: 'sound',
      name: this.sound,
      entity: this.source >= 0 ? this.source : everywhere ? undefined : this.id,
      pos: everywhere ? undefined : { x: this.origin.x, y: this.origin.y, z: this.origin.z },
      volume: Math.max(0, Math.min(1, this.volume / 10)),
      pitch: this.pitch,
      channel: 6,
      stop: stop || undefined,
    });
  }

  play(): void {
    if (!this.sound) return;
    this.emitAt(false);
    this.playing = this.looped;
    this.startedAt = this.world.curtime;
  }

  stop(): void {
    if (!this.playing) return;
    this.emitAt(true);
    this.playing = false;
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'playsound':
        this.play();
        return true;
      case 'stopsound':
        this.stop();
        return true;
      case 'togglesound':
        if (this.playing) this.stop();
        else this.play();
        return true;
      case 'volume':
        this.volume = Math.max(0, Math.min(10, atof(value)));
        if (this.volume === 0) this.stop();
        return true;
      case 'pitch':
        this.pitch = Math.max(1, Math.min(255, atof(value)));
        return true;
      case 'fadein':
        this.play();
        return true;
      case 'fadeout':
        this.stop();
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override netSchema(): NetSchema | null {
    return this.looped && this.sound ? NET_AMBIENT : null;
  }

  override writeNet(out: NetRecord): void {
    out.ox = this.origin.x;
    out.oy = this.origin.y;
    out.oz = this.origin.z;
    out.sound = this.sound;
    out.playing = this.playing;
    out.looped = this.looped;
    out.everywhere = (this.spawnflags & SF_AMBIENT_SOUND_EVERYWHERE) !== 0;
    out.volume = this.volume / 10;
    out.pitch = this.pitch;
    out.radius = this.radius;
    out.source = this.source;
    out.startedAt = this.startedAt;
  }
}

// ─── Props ─────────────────────────────────────────────────────────────────

/** A model's hull box (studiohdr_t hull_min/hull_max), for dynamic prop collision. */
export type PropBoundsResolver = (model: string) => { mins: Vec3; maxs: Vec3 } | null;

let propBoundsResolver: PropBoundsResolver | null = null;

/** Installs the resolver that gives prop_dynamic its hull box (null: dynamic props don't collide). */
export function setPropBoundsResolver(fn: PropBoundsResolver | null): void {
  propBoundsResolver = fn;
}

/** prop_dynamic / prop_dynamic_override / prop_physics*: model + animation state for the renderer. */
export class PropEntity extends MapEntity {
  sequence = '';
  defaultAnim = '';
  animStart = 0;
  playbackRate = 1;
  /** The "solid" key (SOLID_NONE / SOLID_BBOX / SOLID_VPHYSICS). */
  solidKey = 6;
  startDisabled = false;
  readonly physics: boolean;

  constructor(classname: string) {
    super(classname);
    this.physics = classname.startsWith('prop_physics');
  }

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'defaultanim':
        this.defaultAnim = value;
        return true;
      case 'solid':
        this.solidKey = atoi(value);
        return true;
      case 'startdisabled':
        this.startDisabled = atoi(value) !== 0;
        return true;
      case 'setbodygroup':
        this.body = atoi(value);
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  override spawn(): void {
    super.spawn();
    this.sequence = this.defaultAnim || 'idle';
    this.animStart = this.world.curtime;
    if (this.startDisabled) this.effects |= EF_NODRAW;
    this.solid = SOLID_NONE;
    // Physics props are static and collide through the map's static prop list (addMapPropCollision).
    if (!this.physics && this.solidKey !== SOLID_NONE && propBoundsResolver && this.model) {
      const b = propBoundsResolver(this.model);
      if (b) {
        rotatedBounds(b.mins, b.maxs, this.angles, this.modelScale, this.mins, this.maxs);
        this.solid = SOLID_BBOX;
        this.contents = 0x1;
      }
    }
  }

  /** SDK: CDynamicProp::PropSetAnim. */
  setAnimation(name: string): void {
    this.sequence = name;
    this.animStart = this.world.curtime;
    this.fireOutput('OnAnimationBegun', this);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'setanimation':
        this.setAnimation(value);
        return true;
      case 'setdefaultanimation':
        this.defaultAnim = value;
        return true;
      case 'setplaybackrate':
        this.playbackRate = atof(value);
        return true;
      case 'turnon':
      case 'enable':
        this.effects &= ~EF_NODRAW;
        return true;
      case 'turnoff':
      case 'disable':
        this.effects |= EF_NODRAW;
        return true;
      case 'enablecollision':
        this.solidFlags &= ~FSOLID_NOT_SOLID;
        return true;
      case 'disablecollision':
        this.solidFlags |= FSOLID_NOT_SOLID;
        return true;
      case 'setbodygroup':
        this.body = atoi(value);
        return true;
      case 'break':
        this.fireOutput('OnBreak', activator);
        this.world.remove(this);
        return true;
      case 'enablemotion':
      case 'disablemotion':
      case 'wake':
      case 'sleep':
      case 'disablefloating':
      case 'setanimationnoreset':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override netSchema(): NetSchema | null {
    return this.model ? NET_PROP : null;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.sequence = this.sequence;
    out.animStart = this.animStart;
    out.playbackRate = this.playbackRate;
    out.solid = this.isSolid();
    out.modelScale = this.modelScale;
  }
}

/** AABB of a rotated (and scaled) box (TransformAABB). */
function rotatedBounds(
  mins: Vec3,
  maxs: Vec3,
  angles: Vec3,
  scale: number,
  outMins: Vec3,
  outMaxs: Vec3,
): void {
  const d = Math.PI / 180;
  const sy = Math.sin(angles.y * d);
  const cy = Math.cos(angles.y * d);
  const sp = Math.sin(angles.x * d);
  const cp = Math.cos(angles.x * d);
  const sr = Math.sin(angles.z * d);
  const cr = Math.cos(angles.z * d);
  const m = [
    cp * cy,
    sr * sp * cy - cr * sy,
    cr * sp * cy + sr * sy,
    cp * sy,
    sr * sp * sy + cr * cy,
    cr * sp * sy - sr * cy,
    -sp,
    sr * cp,
    cr * cp,
  ];
  const c = [
    ((mins.x + maxs.x) / 2) * scale,
    ((mins.y + maxs.y) / 2) * scale,
    ((mins.z + maxs.z) / 2) * scale,
  ];
  const h = [
    ((maxs.x - mins.x) / 2) * scale,
    ((maxs.y - mins.y) / 2) * scale,
    ((maxs.z - mins.z) / 2) * scale,
  ];
  const out = [0, 0, 0, 0, 0, 0];
  for (let r = 0; r < 3; r++) {
    const wc = m[r * 3] * c[0] + m[r * 3 + 1] * c[1] + m[r * 3 + 2] * c[2];
    const wh =
      Math.abs(m[r * 3]) * h[0] + Math.abs(m[r * 3 + 1]) * h[1] + Math.abs(m[r * 3 + 2]) * h[2];
    out[r] = wc - wh;
    out[r + 3] = wc + wh;
  }
  outMins.x = out[0];
  outMins.y = out[1];
  outMins.z = out[2];
  outMaxs.x = out[3];
  outMaxs.y = out[4];
  outMaxs.z = out[5];
}

/**
 * Adds the map's prop_physics* entities to its collision world as static
 * props (they never move in this simulation). Call once after loadMap with
 * the same resolver as the static props. Returns how many were added.
 */
export function addMapPropCollision(
  map: LoadedMap,
  resolve: (model: string) => PropCollisionModel | null,
): number {
  let added = 0;
  const o = vec3();
  const a = vec3();
  for (const e of map.entities) {
    const cls = e.classname.toLowerCase();
    if (!cls.startsWith('prop_physics')) continue;
    const model = e.get('model');
    if (!model) continue;
    const m = resolve(model);
    if (!m) continue;
    const og = e.getVec3('origin');
    const an = e.getVec3('angles');
    if (!og) continue;
    o.x = og.x;
    o.y = og.y;
    o.z = og.z;
    a.x = an ? an.x : 0;
    a.y = an ? an.y : 0;
    a.z = an ? an.z : 0;
    const idx = map.collision.addStaticProp(m.hulls, o, a, 6, {
      mins: m.mins,
      maxs: m.maxs,
      surfaceName: m.surfaceProp,
      contents: m.contents || undefined,
    });
    if (idx >= 0) added++;
  }
  return added;
}

// ─── Point effects ─────────────────────────────────────────────────────────

/** info_particle_system, env_sprite, env_lightglow, point_spotlight, env_spark, env_smokestack. */
export class PointEffect extends MapEntity {
  active = false;
  startedAt = 0;
  effectName = '';
  p0 = 0;
  p1 = 0;
  p2 = 0;
  p3 = 0;

  override spawn(): void {
    super.spawn();
    const cls = this.classname;
    switch (cls) {
      case 'info_particle_system':
        this.effectName = this.kvString('effect_name');
        this.active = this.kvBool('start_active');
        break;
      case 'env_sprite':
      case 'env_glow':
        this.effectName = this.model;
        this.model = '';
        this.p0 = this.kvNumber('scale', 1);
        this.p1 = this.kvNumber('framerate', 10);
        this.active = (this.spawnflags & 1) !== 0 || this.targetname === '';
        break;
      case 'env_lightglow':
        this.p0 = this.kvNumber('VerticalGlowSize', 30);
        this.p1 = this.kvNumber('HorizontalGlowSize', 30);
        this.p2 = this.kvNumber('MinDist', 500);
        this.p3 = this.kvNumber('MaxDist', 2000);
        this.active = true;
        break;
      case 'point_spotlight':
        this.p0 = this.kvNumber('spotlightlength', 500);
        this.p1 = this.kvNumber('spotlightwidth', 50);
        this.active = (this.spawnflags & 1) !== 0;
        break;
      case 'env_spark':
        this.p0 = this.kvNumber('MaxDelay', 0);
        this.p1 = this.kvNumber('Magnitude', 1);
        this.p2 = this.kvNumber('TrailLength', 1);
        this.active = (this.spawnflags & 64) !== 0; // SF_SPARK_START_ON
        break;
      default:
        this.active = !this.kvBool('StartDisabled');
    }
    if (this.active) this.startedAt = this.world.curtime;
  }

  private setActive(on: boolean): void {
    if (on && !this.active) this.startedAt = this.world.curtime;
    this.active = on;
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'start':
      case 'showsprite':
      case 'lighton':
      case 'startspark':
      case 'turnon':
      case 'enable':
        this.setActive(true);
        return true;
      case 'stop':
      case 'hidesprite':
      case 'lightoff':
      case 'stopspark':
      case 'turnoff':
      case 'disable':
        this.setActive(false);
        return true;
      case 'togglesprite':
      case 'togglespark':
      case 'toggle':
        this.setActive(!this.active);
        return true;
      case 'sparkonce':
        this.world.emitEffect({
          kind: 'spark',
          pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
          entity: this.id,
          value: this.p1,
        });
        return true;
      case 'destroyimmediately':
        this.setActive(false);
        return true;
      case 'setscale':
        this.p0 = atof(value);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override netSchema(): NetSchema | null {
    // Unnamed, unparented effects never change: the renderer builds them from the entity lump.
    return this.targetname !== '' || this.parentName !== '' ? NET_FX : null;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.kind = this.classname;
    out.name = this.effectName;
    out.active = this.active;
    out.startedAt = this.startedAt;
    out.p0 = this.p0;
    out.p1 = this.p1;
    out.p2 = this.p2;
    out.p3 = this.p3;
  }
}

// ─── env_shake / env_fade ──────────────────────────────────────────────────

const SF_SHAKE_EVERYONE = 0x0001;

export class EnvShake extends MapEntity {
  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'startshake':
      case 'stopshake':
      case 'amplitude':
      case 'frequency': {
        const stop = input.toLowerCase() === 'stopshake';
        const everyone = (this.spawnflags & SF_SHAKE_EVERYONE) !== 0;
        this.world.emitEffect({
          kind: 'shake',
          pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
          value: stop ? 0 : this.kvNumber('amplitude', 4),
          force: {
            x: this.kvNumber('frequency', 2.5),
            y: stop ? 0 : this.kvNumber('duration', 1),
            z: everyone ? 0 : this.kvNumber('radius', 500),
          },
        });
        return true;
      }
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

export class EnvFade extends MapEntity {
  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    if (input.toLowerCase() === 'fade') {
      const c = this.renderColor;
      this.world.emitEffect({
        kind: 'fade',
        pos: { x: 0, y: 0, z: 0 },
        value: this.kvNumber('duration', 2),
        normal: { x: ((c >> 16) & 255) / 255, y: ((c >> 8) & 255) / 255, z: (c & 255) / 255 },
        angles: { x: this.kvNumber('holdtime', 0), y: this.renderAlpha, z: this.spawnflags },
        to: this.spawnflags & 4 && activator && activator.isPlayer() ? activator.id : undefined,
      });
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

// ─── info_observer_point ───────────────────────────────────────────────────

export class ObserverPoint extends MapEntity {
  disabled = false;
  fov = 0;
  defaultWelcome = false;
  matchSummary = false;

  override spawn(): void {
    super.spawn();
    this.disabled = this.kvBool('StartDisabled');
    this.fov = this.kvNumber('fov', 0);
    this.defaultWelcome = this.kvBool('defaultwelcome');
    this.matchSummary = this.kvBool('match_summary');
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.disabled = false;
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      case 'setparentattachment':
      case 'setparentattachmentmaintainoffset':
        // The camera rides its parent (set by parentname); the attachment is applied by the client.
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override netSchema(): NetSchema | null {
    return NET_OBSERVER_POINT;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.disabled = this.disabled;
    out.fov = this.fov;
    out.defaultWelcome = this.defaultWelcome;
    out.matchSummary = this.matchSummary;
  }
}

// ─── env_fog_controller ────────────────────────────────────────────────────

const parseRgb = (v: string): number => {
  const p = v
    .trim()
    .split(/\s+/)
    .map((n) => parseInt(n, 10) || 0);
  return ((p[0] & 255) << 16) | ((p[1] & 255) << 8) | (p[2] & 255);
};

export class FogController extends MapEntity {
  enabled = true;
  fogStart = 0;
  fogEnd = 0;
  maxDensity = 1;
  color = 0;
  color2 = 0;
  farZ = 0;

  override spawn(): void {
    super.spawn();
    this.enabled = this.kvBool('fogenable', true);
    this.fogStart = this.kvNumber('fogstart', 0);
    this.fogEnd = this.kvNumber('fogend', 0);
    this.maxDensity = this.kvNumber('fogmaxdensity', 1);
    this.color = parseRgb(this.kvString('fogcolor', '0 0 0'));
    this.color2 = parseRgb(this.kvString('fogcolor2', '0 0 0'));
    this.farZ = this.kvNumber('farz', -1);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'turnon':
        this.enabled = true;
        return true;
      case 'turnoff':
        this.enabled = false;
        return true;
      case 'setstartdist':
        this.fogStart = atof(value);
        return true;
      case 'setenddist':
        this.fogEnd = atof(value);
        return true;
      case 'setmaxdensity':
        this.maxDensity = atof(value);
        return true;
      case 'setcolor':
        this.color = parseRgb(value);
        return true;
      case 'setcolorsecondary':
        this.color2 = parseRgb(value);
        return true;
      case 'setfarz':
        this.farZ = atof(value);
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override netSchema(): NetSchema | null {
    return NET_FOG;
  }

  override writeNet(out: NetRecord): void {
    out.name = this.targetname;
    out.enabled = this.enabled;
    out.start = this.fogStart;
    out.end = this.fogEnd;
    out.maxDensity = this.maxDensity;
    out.color = this.color;
    out.color2 = this.color2;
    out.farZ = this.farZ;
  }
}

// ─── Inert classes ─────────────────────────────────────────────────────────

/**
 * Entities with no game behaviour that still take their inputs (so the I/O
 * a map sends is accounted for): Enable/Disable/TurnOn/TurnOff and the
 * class-specific setters are accepted and ignored.
 */
export class InertEntity extends MapEntity {
  disabled = false;

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    if (super.acceptInput(input, value, activator, caller)) return true;
    const lc = input.toLowerCase();
    if (lc === 'enable' || lc === 'turnon') this.disabled = false;
    else if (lc === 'disable' || lc === 'turnoff') this.disabled = true;
    // Every other input of these classes (SetBloomScale, SetAutoExposureMin, Break, …) only affects rendering.
    return true;
  }
}

/** info_null removes itself at spawn (CNullEntity::Spawn). */
export class InfoNull extends MapEntity {
  override spawn(): void {
    super.spawn();
    this.world.remove(this);
  }
}

registerEntityClass('ambient_generic', AmbientGeneric);
for (const c of [
  'prop_dynamic',
  'prop_dynamic_override',
  'prop_dynamic_ornament',
  'prop_physics',
  'prop_physics_multiplayer',
  'prop_physics_override',
]) {
  registerEntityClass(c, PropEntity);
}
for (const c of [
  'info_particle_system',
  'env_sprite',
  'env_glow',
  'env_lightglow',
  'point_spotlight',
  'env_spark',
  'env_smokestack',
  'env_steam',
]) {
  registerEntityClass(c, PointEffect);
}
registerEntityClass('env_shake', EnvShake);
registerEntityClass('env_fade', EnvFade);
registerEntityClass('info_observer_point', ObserverPoint);
registerEntityClass('env_fog_controller', FogController);
registerEntityClass('info_null', InfoNull);
for (const c of [
  'env_tonemap_controller',
  'env_soundscape',
  'env_soundscape_proxy',
  'env_soundscape_triggerable',
  'env_sun',
  'color_correction',
  'shadow_control',
  'sky_camera',
  'water_lod_control',
  'light',
  'light_spot',
  'light_environment',
  'light_dynamic',
  'keyframe_rope',
  'move_rope',
  'infodecal',
  'info_overlay',
  'point_devshot_camera',
  'game_intro_viewpoint',
  'info_intermission',
  'info_player_start',
  'info_landmark',
  'path_corner',
  'phys_constraint',
  'phys_ballsocket',
  'phys_hinge',
  'env_wind',
  'env_cubemap',
  'func_ladder',
  'env_detail_controller',
]) {
  registerEntityClass(c, InertEntity);
}

void TEAM_UNASSIGNED;
