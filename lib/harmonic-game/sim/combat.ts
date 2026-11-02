/**
 * HarmonicCombat — the combat service attached to an `SpWorld` (plan H1.1, architecture §5).
 *
 * Hitscan and melee are traces against the map plus solid box entities (`SpCollision.boxes`), so
 * a wall in front of a target blocks the shot. Damage is routed to `Entity.onTakeDamage`
 * (`SpPlayer` and Harmonic entities alike) with a `DamageInfo`, and the outcome is published on a
 * typed event stream the HUD, audio and effects subscribe to. No DOM, no `Math.random`.
 */
import { MASK_SHOT } from '../../tf2-game/core/constants';
import { emptyTrace, NO_ENTITY, type TraceFilter } from '../../tf2-game/core/types';
import { copy, vec3, type Vec3 } from '../../tf2-game/core/vec';
import { DMG_BULLET, DMG_CLUB, DMG_FALL, DMG_RADIATION, DMG_SHOCK, createDamageInfo, type DamageInfo } from '../../tf2-game/sim/damage';
import { DAMAGE_NO, type Entity } from '../../tf2-game/sim/entity';
import type { SpWorld } from '../../sp-game/world/sp-world';
import { HIT_FORCE_SCALE, MELEE_HULL_RADIUS } from './constants';

export type HarmonicDamageType = 'bullet' | 'melee' | 'cold' | 'fall' | 'phase';

const DAMAGE_BITS: Record<HarmonicDamageType, number> = {
  bullet: DMG_BULLET,
  melee: DMG_CLUB,
  cold: DMG_RADIATION,
  fall: DMG_FALL,
  phase: DMG_SHOCK,
};

/** What an entity must offer to be hurt: any `Entity` with `takeDamage` set qualifies. */
export interface Damageable {
  readonly id: number;
  health: number;
  takeDamage: number;
  onTakeDamage(info: DamageInfo): number;
  /** Optional veto (phase immunity, invulnerable states): false = the hit is ignored. */
  acceptsDamage?(d: HarmonicDamage): boolean;
}

export interface HarmonicDamage {
  amount: number;
  type: HarmonicDamageType;
  /** Entity responsible, or null (the world: cold, falls). */
  attacker: Entity | null;
  /** Where it landed. */
  position: Vec3;
  /** Unit direction of travel (zero vector when not directional). */
  direction: Vec3;
}

export interface HitResult {
  kind: 'none' | 'world' | 'entity';
  /** Distance from `from` to the hit (the range when nothing was hit). */
  distance: number;
  position: Vec3;
  normal: Vec3;
  entity: Entity | null;
  /** Health actually removed (0 for the world, or an entity that ignored it). */
  damageDealt: number;
  killed: boolean;
  surface: string;
}

export type CombatEvent =
  | {
      type: 'hit';
      /** Entity id, or null for the world. */
      target: number | null;
      position: Vec3;
      normal: Vec3;
      damage: number;
      damageType: HarmonicDamageType;
      killed: boolean;
      surface: string;
    }
  | { type: 'kill'; target: number; attacker: number; damageType: HarmonicDamageType; isPlayer: boolean }
  | { type: 'playerHurt'; amount: number; damageType: HarmonicDamageType; health: number; dead: boolean; attacker: number };

export type CombatListener = (ev: CombatEvent) => void;

const trace = emptyTrace();
const endPos = vec3();
const hullMins = vec3();
const hullMaxs = vec3();
const ZERO = Object.freeze(vec3());

export class HarmonicCombat {
  readonly world: SpWorld;
  private readonly listeners = new Set<CombatListener>();

  constructor(world: SpWorld) {
    this.world = world;
  }

  /** Subscribes to combat events; returns the unsubscribe function. */
  on(fn: CombatListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(ev: CombatEvent): void {
    for (const fn of this.listeners) fn(ev);
  }

  private filterFor(attacker: Entity | null): TraceFilter {
    const self = attacker ? attacker.id : NO_ENTITY;
    return (id) => id !== self;
  }

  /** A line from `from` along unit `dir`, up to `range`, damaging the first damageable it meets. */
  hitscan(from: Vec3, dir: Vec3, range: number, damage: number, attacker: Entity | null, type: HarmonicDamageType = 'bullet'): HitResult {
    endPos.x = from.x + dir.x * range;
    endPos.y = from.y + dir.y * range;
    endPos.z = from.z + dir.z * range;
    this.world.collision.traceLine(from, endPos, MASK_SHOT, this.filterFor(attacker), trace);
    return this.resolve(from, dir, range, damage, attacker, type);
  }

  /** A short hull sweep (the player's strike): like `hitscan` with a fat ray and a short reach. */
  melee(from: Vec3, dir: Vec3, range: number, damage: number, attacker: Entity | null, hullRadius = MELEE_HULL_RADIUS): HitResult {
    endPos.x = from.x + dir.x * range;
    endPos.y = from.y + dir.y * range;
    endPos.z = from.z + dir.z * range;
    hullMins.x = hullMins.y = hullMins.z = -hullRadius;
    hullMaxs.x = hullMaxs.y = hullMaxs.z = hullRadius;
    this.world.collision.traceHull(from, endPos, hullMins, hullMaxs, MASK_SHOT, this.filterFor(attacker), trace);
    return this.resolve(from, dir, range, damage, attacker, 'melee');
  }

  private resolve(from: Vec3, dir: Vec3, range: number, damage: number, attacker: Entity | null, type: HarmonicDamageType): HitResult {
    const res: HitResult = {
      kind: 'none',
      distance: range,
      position: copy(vec3(), trace.endPos),
      normal: copy(vec3(), trace.plane.normal),
      entity: null,
      damageDealt: 0,
      killed: false,
      surface: trace.surfaceName,
    };
    if (trace.fraction >= 1 && !trace.startSolid) {
      res.position = vec3(from.x + dir.x * range, from.y + dir.y * range, from.z + dir.z * range);
      return res;
    }
    res.distance = trace.fraction * range;
    const hitId = trace.entity;
    const target = hitId > 0 ? this.world.entity(hitId) : null;
    if (target && target.takeDamage !== DAMAGE_NO) {
      res.kind = 'entity';
      res.entity = target;
      const r = this.applyDamage(target, { amount: damage, type, attacker, position: res.position, direction: dir });
      res.damageDealt = r.dealt;
      res.killed = r.killed;
    } else {
      res.kind = 'world';
    }
    this.emit({
      type: 'hit',
      target: res.entity ? res.entity.id : null,
      position: res.position,
      normal: res.normal,
      damage: res.damageDealt,
      damageType: type,
      killed: res.killed,
      surface: res.surface,
    });
    return res;
  }

  /**
   * Routes damage to the player (`SpPlayer.onTakeDamage`) or any other damageable entity and
   * publishes `playerHurt` / `kill`. Returns the health removed and whether it died of this.
   */
  applyDamage(target: Entity, d: HarmonicDamage): { dealt: number; killed: boolean } {
    const t = target as unknown as Damageable;
    if (target.removed || target.takeDamage === DAMAGE_NO || d.amount <= 0) return { dealt: 0, killed: false };
    if (t.acceptsDamage && !t.acceptsDamage(d)) return { dealt: 0, killed: false };
    const info = createDamageInfo();
    info.attacker = d.attacker ? d.attacker.id : NO_ENTITY;
    info.inflictor = info.attacker;
    info.damage = info.baseDamage = d.amount;
    info.damageType = DAMAGE_BITS[d.type];
    copy(info.position, d.position);
    info.force.x = d.direction.x * d.amount * HIT_FORCE_SCALE;
    info.force.y = d.direction.y * d.amount * HIT_FORCE_SCALE;
    info.force.z = d.direction.z * d.amount * HIT_FORCE_SCALE;
    info.directHitEntity = target.id;

    const player = this.world.player;
    const isPlayer = target === player;
    const wasDead = isPlayer ? player.dead : target.health <= 0;
    const dealt = t.onTakeDamage(info);
    const nowDead = isPlayer ? player.dead : target.health <= 0 || target.takeDamage === DAMAGE_NO;
    const killed = !wasDead && nowDead;
    if (isPlayer && dealt > 0) {
      this.emit({ type: 'playerHurt', amount: dealt, damageType: d.type, health: player.health, dead: player.dead, attacker: info.attacker });
    }
    if (killed) this.emit({ type: 'kill', target: target.id, attacker: info.attacker, damageType: d.type, isPlayer });
    return { dealt, killed };
  }

  /** Damage with no attacker and no direction (cold, falls, scripted hurt). */
  hurt(target: Entity, amount: number, type: HarmonicDamageType): { dealt: number; killed: boolean } {
    return this.applyDamage(target, { amount, type, attacker: null, position: target.origin, direction: ZERO });
  }
}
