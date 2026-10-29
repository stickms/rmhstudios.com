/**
 * Triggers in single player. The TF trigger classes (lib/tf2-game/sim/
 * triggers.ts) run here with single-player toucher rules (SDK:
 * CBaseTrigger::PassesTriggerFilters — clients, NPCs, physics objects,
 * everything), plus:
 *
 * - trigger_changelevel / trigger_transition (SDK: CChangeLevel): builds the
 *   transition record — the player and the physics objects inside the
 *   landmark's transition volume, relative to the landmark — and asks the
 *   world to change level. A trigger the player starts inside is armed only
 *   once the player has left it.
 * - trigger_look: fires when the player inside looks at its target for
 *   LookTime seconds within FieldOfView.
 * - trigger_wind: pushes physics objects inside along its direction.
 * - trigger_teleport: zeroes velocity like the SDK (landmark keeps offsets).
 */

import { angleVectors, normalize, vec3 } from '../../tf2-game/core/vec';
import type { Entity } from '../../tf2-game/sim/entity';
import { MOVETYPE_PUSH } from '../../tf2-game/sim/entity';
import {
  BaseTrigger,
  SF_TRIGGER_ALLOW_ALL,
  SF_TRIGGER_ALLOW_CLIENTS,
  SF_TRIGGER_ALLOW_NPCS,
  SF_TRIGGER_ALLOW_PHYSICS,
  SF_TRIG_TOUCH_DEBRIS,
  TriggerHurt,
  TriggerMultiple,
  TriggerOnce,
  TriggerPush,
  TriggerTeleport,
} from '../../tf2-game/sim/triggers';
import type { CarriedEntity, TransitionData } from '../level/transition';
import { findLandmark } from '../level/arrival';
import { registerSp } from './base';
import type { SpWorld } from '../world/sp-world';

const sp = (e: Entity): SpWorld => e.world as unknown as SpWorld;

/** NPC actors expose isNPC(). */
const isNpc = (e: Entity): boolean => typeof (e as Entity & { isNPC?: () => boolean }).isNPC === 'function' && (e as Entity & { isNPC: () => boolean }).isNPC();
/** Physics objects expose a body (props, physboxes, energy balls). */
const isPhysics = (e: Entity): boolean => !e.isPlayer() && !isNpc(e) && e.moveType !== MOVETYPE_PUSH;

/** SDK: CBaseTrigger::PassesTriggerFilters, single-player flavour. */
function spPasses(t: BaseTrigger, other: Entity): boolean {
  const f = t.spawnflags;
  const allowed =
    (f & SF_TRIGGER_ALLOW_ALL) !== 0 ||
    ((f & SF_TRIGGER_ALLOW_CLIENTS) !== 0 && other.isPlayer()) ||
    ((f & SF_TRIGGER_ALLOW_NPCS) !== 0 && isNpc(other)) ||
    ((f & (SF_TRIGGER_ALLOW_PHYSICS | SF_TRIG_TOUCH_DEBRIS)) !== 0 && isPhysics(other));
  if (!allowed) return false;
  if (other.isPlayer() && !other.alive) return false;
  return t.filter ? t.filter.passesFilter(t, other) : true;
}

function spWants(t: BaseTrigger, other: Entity): boolean {
  const f = t.spawnflags;
  if (other.isPlayer()) return (f & (SF_TRIGGER_ALLOW_ALL | SF_TRIGGER_ALLOW_CLIENTS)) !== 0;
  if (isNpc(other)) return (f & (SF_TRIGGER_ALLOW_ALL | SF_TRIGGER_ALLOW_NPCS)) !== 0;
  return (f & (SF_TRIGGER_ALLOW_ALL | SF_TRIGGER_ALLOW_PHYSICS | SF_TRIG_TOUCH_DEBRIS)) !== 0;
}

export class SpTriggerMultiple extends TriggerMultiple {
  override passesTriggerFilters(other: Entity): boolean {
    return spPasses(this, other);
  }
  override wantsToucher(other: Entity): boolean {
    return spWants(this, other);
  }
}

export class SpTriggerOnce extends TriggerOnce {
  override passesTriggerFilters(other: Entity): boolean {
    return spPasses(this, other);
  }
  override wantsToucher(other: Entity): boolean {
    return spWants(this, other);
  }
}

export class SpTriggerHurt extends TriggerHurt {
  override passesTriggerFilters(other: Entity): boolean {
    return spPasses(this, other);
  }
  override wantsToucher(other: Entity): boolean {
    return spWants(this, other);
  }
}

export class SpTriggerPush extends TriggerPush {
  override passesTriggerFilters(other: Entity): boolean {
    return spPasses(this, other);
  }
  override wantsToucher(other: Entity): boolean {
    return spWants(this, other);
  }
}

/** SDK: CTriggerTeleport::Touch — velocity is zeroed on arrival. */
export class SpTriggerTeleport extends TriggerTeleport {
  override passesTriggerFilters(other: Entity): boolean {
    return spPasses(this, other);
  }
  override wantsToucher(other: Entity): boolean {
    return spWants(this, other);
  }
  override touch(other: Entity): void {
    if (this.disabled || !this.passesTriggerFilters(other)) return;
    const w = sp(this);
    const target = w.findByName(this.kvString('target'), this, other, other);
    if (!target) return;
    const lm = this.kvString('landmark') ? w.findByName(this.kvString('landmark'), this, other, other) : null;
    const d = vec3(target.origin.x, target.origin.y, target.origin.z);
    if (lm) {
      d.x += other.origin.x - lm.origin.x;
      d.y += other.origin.y - lm.origin.y;
      d.z += other.origin.z - lm.origin.z;
    }
    const keepAngles = !!lm || (this.spawnflags & 0x20) !== 0;
    w.teleportEntity(other, d, keepAngles ? null : target.angles, lm ? null : vec3());
    if (other === w.player) w.portals.resetPlayerTracking();
  }
}

/** trigger_look (SDK: CTriggerLook). */
export class TriggerLook extends SpTriggerOnce {
  private lookStart = -1;
  private touchStart = -1;

  override touch(other: Entity): void {
    if (this.disabled || !other.isPlayer() || !this.passesTriggerFilters(other)) return;
    const w = sp(this);
    const now = w.curtime;
    if (this.touchStart < 0) this.touchStart = now;
    const timeout = this.kvNumber('timeout', 0);
    if (timeout > 0 && now - this.touchStart > timeout) {
      this.fireOutput('OnTimeout', other);
      this.disable();
      this.world.remove(this);
      return;
    }
    const target = w.findByName(this.kvString('target'));
    if (!target) return;
    const eye = w.player.eyePosition(vec3());
    const f = vec3();
    angleVectors(w.player.eyeAngles, f);
    const c = target.worldSpaceCenter(vec3());
    const d = vec3(c.x - eye.x, c.y - eye.y, c.z - eye.z);
    normalize(d);
    const fov = this.kvNumber('FieldOfView', 0.9);
    if (d.x * f.x + d.y * f.y + d.z * f.z < fov) {
      this.lookStart = -1;
      return;
    }
    if (this.lookStart < 0) this.lookStart = now;
    if (now - this.lookStart >= this.kvNumber('LookTime', 0.5)) {
      this.fireOutput('OnTrigger', other);
      this.lookStart = -1;
      if (this.wait < 0) {
        this.disabled = true;
        this.world.remove(this);
      }
    }
  }

  override endTouch(other: Entity): void {
    this.lookStart = -1;
    this.touchStart = -1;
    super.endTouch(other);
  }
}

/** trigger_wind: a steady push on physics objects inside (direction `angles`, speed). */
export class TriggerWind extends SpTriggerMultiple {
  override touch(other: Entity): void {
    if (this.disabled || other.isPlayer()) return;
    const b = sp(this).bodiesByEntity.get(other.id);
    if (!b || b.held) return;
    const f = vec3();
    angleVectors(this.kv?.getVec3('angles') ?? this.angles, f);
    const speed = this.kvNumber('Speed', 200);
    const v = b.getVelocity(vec3());
    const along = v.x * f.x + v.y * f.y + v.z * f.z;
    if (along >= speed) return;
    const dv = Math.min(speed - along, 600 * sp(this).tick);
    b.applyImpulse({ x: f.x * dv * b.mass, y: f.y * dv * b.mass, z: f.z * dv * b.mass });
  }
}

/** trigger_transition: the volume of what carries over with a landmark (not a toucher). */
export class TriggerTransition extends BaseTrigger {
  override wantsToucher(): boolean {
    return false;
  }
}

/** SDK: CChangeLevel. */
export class TriggerChangeLevel extends SpTriggerOnce {
  private armed = true;

  override spawn(): void {
    super.spawn();
    this.spawnflags |= SF_TRIGGER_ALLOW_CLIENTS;
  }

  override activate(): void {
    super.activate();
    // Arriving inside a changelevel (the way back) must not bounce the player.
    const p = sp(this).player;
    const mins = vec3(p.origin.x + p.mins.x, p.origin.y + p.mins.y, p.origin.z + p.mins.z);
    const maxs = vec3(p.origin.x + p.maxs.x, p.origin.y + p.maxs.y, p.origin.z + p.maxs.z);
    if (this.touchesBox(mins, maxs)) this.armed = false;
  }

  /** Re-arm once the player is out (called by the world after a transition placement). */
  rearmCheck(): void {
    const p = sp(this).player;
    const mins = vec3(p.origin.x + p.mins.x, p.origin.y + p.mins.y, p.origin.z + p.mins.z);
    const maxs = vec3(p.origin.x + p.maxs.x, p.origin.y + p.maxs.y, p.origin.z + p.maxs.z);
    if (this.touchesBox(mins, maxs)) this.armed = false;
  }

  override touch(other: Entity): void {
    if (this.disabled || !other.isPlayer() || this.spawnflags & 2) return;
    if (!this.armed) return;
    this.changeLevel(other);
  }

  override endTouch(other: Entity): void {
    if (other.isPlayer()) this.armed = true;
    super.endTouch(other);
  }

  /** SDK: CChangeLevel::ChangeLevelNow. */
  changeLevel(activator: Entity | null): void {
    const w = sp(this);
    if (w.pendingChangeLevel) return;
    const map = this.kvString('map');
    const landmarkName = this.kvString('landmark');
    const lm = landmarkName ? findLandmark(w, landmarkName) : null;
    const base = lm ? lm.origin : vec3();
    const p = w.player;
    const entities: CarriedEntity[] = [];
    if (lm) {
      // Everything physical inside a trigger_transition named like the landmark comes along.
      const volumes = w.findAllByName(landmarkName).filter((e) => e instanceof TriggerTransition) as TriggerTransition[];
      for (const [id, b] of w.bodiesByEntity) {
        const e = w.entity(id);
        if (!e || b.kind !== 'dynamic' || !e.kv) continue;
        const c = b.getCenter(vec3());
        if (!volumes.some((v) => v.pointIsWithin(c))) continue;
        entities.push({
          classname: e.classname,
          targetname: e.targetname,
          globalname: e.kv.get('globalname') ?? '',
          model: e.model,
          offset: { x: e.origin.x - base.x, y: e.origin.y - base.y, z: e.origin.z - base.z },
          angles: { ...e.angles },
          velocity: b.getVelocity(vec3()),
          angularVelocity: b.getAngularVelocity(vec3()),
          skin: e.skin,
          keyvalues: e.kv.props.map(([k, v]) => [k, v] as [string, string]),
        });
      }
    }
    if (p.held) p.drop(false);
    const transition: TransitionData = {
      fromMap: w.mapName,
      toMap: map,
      landmark: landmarkName,
      player: {
        offset: { x: p.origin.x - base.x, y: p.origin.y - base.y, z: p.origin.z - base.z },
        velocity: { ...p.move.velocity },
        eyeAngles: { ...p.eyeAngles },
        ducked: p.move.ducked,
        health: p.health,
        armor: p.armor,
        hasSuit: p.hasSuit,
        suitPower: p.suitPower,
        flashlight: p.flashlight,
        portalgun: p.portalgun ? { canFire1: p.portalgun.canFire1, canFire2: p.portalgun.canFire2 } : null,
      },
      entities,
      globals: Object.fromEntries(w.globals),
    };
    this.fireOutput('OnChangeLevel', activator);
    w.requestChangeLevel(map, landmarkName, transition);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() === 'changelevel') {
      this.changeLevel(activator);
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

registerSp(SpTriggerMultiple, 'trigger_multiple');
registerSp(SpTriggerOnce, 'trigger_once');
registerSp(SpTriggerHurt, 'trigger_hurt');
registerSp(SpTriggerPush, 'trigger_push');
registerSp(SpTriggerTeleport, 'trigger_teleport');
registerSp(TriggerLook, 'trigger_look');
registerSp(TriggerWind, 'trigger_wind');
registerSp(TriggerTransition, 'trigger_transition');
registerSp(TriggerChangeLevel, 'trigger_changelevel');

