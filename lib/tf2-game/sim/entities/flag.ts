/**
 * Capture the flag (SDK: shared/tf/entity_capture_flag.cpp CCaptureFlag,
 * server/tf/func_capture_zone.cpp CCaptureZone):
 *
 * - item_teamflag: home / stolen / dropped. An enemy touching it picks it up
 *   (not while invulnerable, cloaked, phased, already carrying, or standing in
 *   a respawn room); the carrier's disguise drops. It drops where the carrier
 *   dies (traced to the ground, parented to a mover under it) and returns
 *   home after ReturnTime (60 s) — touching your own dropped flag does
 *   nothing with tf_flag_return_on_touch 0. A thrown (dropped by key) flag
 *   can't be re-taken by its dropper for 3 s.
 * - func_capturezone: a carrier of the enemy flag touching their own team's
 *   zone captures — the team's flag caps go up (tf_flag_caps_per_round 3
 *   wins the round, checked by the CTF mode), the team gets
 *   TF_COND_CRITBOOSTED_CTF_CAPTURE for tf_ctf_bonus_time (10 s).
 */

import { emptyTrace, NO_ENTITY } from '../../core/types';
import { MASK_SOLID, MOVETYPE_NONE, TEAM_UNASSIGNED } from '../../core/constants';
import { vec3, type Vec3 } from '../../core/vec';
import {
  COLLISION_GROUP_DEBRIS,
  EF_NODRAW,
  type Entity,
  FSOLID_NOT_SOLID,
  FSOLID_TRIGGER,
  MOVETYPE_PUSH,
  RENDER_NORMAL,
  SOLID_BBOX,
} from '../entity';
import { registerEntityClass } from '../entity-registry';
import type { NetRecord, NetSchema } from '../net-schema';
import type { Player } from '../player';
import { TF_COND } from '../conditions';
import { BaseTrigger, SF_TRIGGER_ALLOW_ALL } from '../triggers';
import type { GameWorld } from '../world';
import { MapEntity, atof, atoi, teamOutputIndex, type ThinkContext } from './base';
import { NET_FLAG } from './net';
import {
  flagsMayBeCapped,
  isStealthed,
  objectives,
  TF_CTF_BONUS_TIME,
  TF_FLAG_CAPS_PER_ROUND,
  TF_FLAG_RETURN_ON_TOUCH,
  track,
  untrack,
} from './objectives';

// ETFFlagType.
export const TF_FLAGTYPE_CTF = 0;
export const TF_FLAGTYPE_ATTACK_DEFEND = 1;
export const TF_FLAGTYPE_TERRITORY_CONTROL = 2;
export const TF_FLAGTYPE_INVADE = 3;
export const TF_FLAGTYPE_RESOURCE_CONTROL = 4;

// m_nFlagStatus.
export const TF_FLAGINFO_HOME = 0;
export const TF_FLAGINFO_STOLEN = 1;
export const TF_FLAGINFO_DROPPED = 2;

/** TF_FLAG_THINK_TIME. */
export const TF_FLAG_THINK_TIME = 0.25;
/** TF_FLAG_OWNER_PICKUP_TIME. */
export const TF_FLAG_OWNER_PICKUP_TIME = 3.0;
/** TF_FLAG_NUMBEROFSKINS. */
const TF_FLAG_NUMBEROFSKINS = 3;
const TF_CTF_ENEMY_STOLEN = 'CaptureFlag.EnemyStolen';
const TF_CTF_ENEMY_DROPPED = 'CaptureFlag.EnemyDropped';
const TF_CTF_ENEMY_CAPTURED = 'CaptureFlag.EnemyCaptured';
const TF_CTF_ENEMY_RETURNED = 'CaptureFlag.EnemyReturned';
const TF_CTF_TEAM_STOLEN = 'CaptureFlag.TeamStolen';
const TF_CTF_TEAM_DROPPED = 'CaptureFlag.TeamDropped';
const TF_CTF_TEAM_CAPTURED = 'CaptureFlag.TeamCaptured';
const TF_CTF_TEAM_RETURNED = 'CaptureFlag.TeamReturned';
const TF_CTF_FLAGSPAWN = 'CaptureFlag.FlagSpawn';
const DEFAULT_FLAG_MODEL = 'models/flag/briefcase.mdl';

/** The flag's forced collision bounds (SetCollisionBounds in CCaptureFlag::Spawn). */
const FLAG_MINS: Vec3 = { x: -19.5, y: -22.5, z: -6.5 };
const FLAG_MAXS: Vec3 = { x: 19.5, y: 22.5, z: 6.5 };
/** UseTriggerBounds(true, 24): x/y and top bloat. */
const FLAG_TRIGGER_BLOAT = 24;

const dropTrace = emptyTrace();
const dropStart = vec3();
const dropEnd = vec3();

/** A team-filtered announcement (CTeamRecipientFilter + PlaySound). */
function teamSound(world: GameWorld, team: number, name: string): void {
  if (!world.isServer) return;
  world.events.push({ type: 'sound', name, channel: 0, team });
}

/** CTFPlayer::HasTheFlag. */
export function hasTheFlag(p: Player): boolean {
  return p.carriedFlag !== NO_ENTITY;
}

export class CaptureFlag extends MapEntity {
  flagType = TF_FLAGTYPE_CTF;
  returnTime = 60;
  useTrailEffect = 0;
  disabled = false;
  visibleWhenDisabled = false;
  flagModel = '';
  hudIcon = '';
  paperEffect = '';
  trailEffect = '';
  status = TF_FLAGINFO_HOME;
  resetTime = 0;
  maxResetTime = 0;
  /** m_hPrevOwner (the carrier while stolen). */
  prevOwner: number = NO_ENTITY;
  initialPlayer: number = NO_ENTITY;
  allowOwnerPickup = true;
  ownerPickupTime = 0;
  captured = false;
  readonly resetPos = vec3();
  readonly resetAng = vec3();
  private initialParent: number = NO_ENTITY;
  private readonly offset = vec3();
  originalTeam = TEAM_UNASSIGNED;
  sequence = 'spin';
  private readonly flagThink: ThinkContext;

  constructor(classname: string) {
    super(classname);
    this.flagThink = this.context(() => this.flagThinkFn());
  }

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'gametype':
        this.flagType = atoi(value);
        return true;
      case 'returntime':
        this.returnTime = atoi(value);
        return true;
      case 'trail_effect':
        this.useTrailEffect = atoi(value);
        return true;
      case 'visiblewhendisabled':
        this.visibleWhenDisabled = atoi(value) !== 0;
        return true;
      case 'flag_model':
        this.flagModel = value;
        return true;
      case 'flag_icon':
        this.hudIcon = value;
        return true;
      case 'flag_paper':
        this.paperEffect = value;
        return true;
      case 'flag_trail':
        this.trailEffect = value;
        return true;
      case 'startdisabled':
        this.disabled = atoi(value) !== 0;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CCaptureFlag::Spawn. */
  override spawn(): void {
    super.spawn();
    track(objectives(this.world).flags, this);
    this.model = this.flagModel || DEFAULT_FLAG_MODEL;
    this.solid = SOLID_BBOX;
    this.solidFlags = FSOLID_NOT_SOLID | FSOLID_TRIGGER;
    this.setSize(FLAG_MINS, FLAG_MAXS);
    this.originalTeam = this.team;
    this.resetPos.x = this.origin.x;
    this.resetPos.y = this.origin.y;
    this.resetPos.z = this.origin.z;
    this.resetAng.x = this.angles.x;
    this.resetAng.y = this.angles.y;
    this.resetAng.z = this.angles.z;
    this.skin = this.team === TEAM_UNASSIGNED ? 2 : this.team - 2;
    this.setFlagStatus(TF_FLAGINFO_HOME);
    this.resetTime = 0;
    this.initialPlayer = NO_ENTITY;
    this.allowOwnerPickup = true;
    this.prevOwner = NO_ENTITY;
    this.captured = false;
    this.world.registerTrigger(this);
    this.setDisabled(this.disabled);
  }

  /** The initial parent (a flag riding a mover) is resolved after everything spawned. */
  override activate(): void {
    super.activate();
    const p = this.world.entity(this.parent);
    if (p) {
      this.initialParent = p.id;
      this.offset.x = this.origin.x - p.origin.x;
      this.offset.y = this.origin.y - p.origin.y;
      this.offset.z = this.origin.z - p.origin.z;
    }
  }

  override onRemove(): void {
    const carrier = this.world.player(this.prevOwner);
    if (carrier && carrier.carriedFlag === this.id) carrier.carriedFlag = NO_ENTITY;
    untrack(objectives(this.world).flags, this);
    this.world.unregisterTrigger(this);
    super.onRemove();
  }

  isHome(): boolean {
    return this.status === TF_FLAGINFO_HOME;
  }

  isStolen(): boolean {
    return this.status === TF_FLAGINFO_STOLEN;
  }

  isDropped(): boolean {
    return this.status === TF_FLAGINFO_DROPPED;
  }

  /** SDK: CCaptureFlag::SetDisabled. */
  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    if (disabled) {
      if (this.visibleWhenDisabled) {
        this.renderMode = 4; // kRenderTransAlpha
        this.renderAlpha = 180;
        this.effects &= ~EF_NODRAW;
      } else this.effects |= EF_NODRAW;
      this.setContextThink(this.flagThink, -1);
    } else {
      this.effects &= ~EF_NODRAW;
      this.renderMode = RENDER_NORMAL;
      this.renderAlpha = 255;
      this.setContextThink(this.flagThink, this.world.curtime);
    }
  }

  private setFlagStatus(status: number): void {
    this.status = status;
    this.sequence = status === TF_FLAGINFO_STOLEN ? 'idle' : 'spin';
  }

  // TouchVolume.
  wantsToucher(other: Entity): boolean {
    return other.isPlayer();
  }

  touchesBox(mins: Vec3, maxs: Vec3): boolean {
    const o = this.origin;
    return (
      mins.x < o.x + FLAG_MAXS.x + FLAG_TRIGGER_BLOAT &&
      maxs.x > o.x + FLAG_MINS.x - FLAG_TRIGGER_BLOAT &&
      mins.y < o.y + FLAG_MAXS.y + FLAG_TRIGGER_BLOAT &&
      maxs.y > o.y + FLAG_MINS.y - FLAG_TRIGGER_BLOAT &&
      mins.z < o.z + FLAG_MAXS.z + FLAG_TRIGGER_BLOAT * 0.5 &&
      maxs.z > o.z + FLAG_MINS.z
    );
  }

  override touch(other: Entity): void {
    this.flagTouch(other);
  }

  /** SDK: CCaptureFlag::FlagTouch. */
  flagTouch(other: Entity): void {
    if (this.disabled || this.isStolen() || this.captured) return;
    if (!other.isPlayer() || !other.alive) return;
    const p = other as Player;
    if (this.prevOwner === p.id && !this.allowOwnerPickup) return;
    if (p.team === this.team) {
      this.fireOutput('OnTouchSameTeam', this);
      if (this.flagType === TF_FLAGTYPE_CTF) {
        if (!TF_FLAG_RETURN_ON_TOUCH) return;
        if (this.isHome() || this.isStolen()) return;
      }
    }
    if (
      (this.flagType === TF_FLAGTYPE_ATTACK_DEFEND ||
        this.flagType === TF_FLAGTYPE_TERRITORY_CONTROL) &&
      p.team !== this.team
    )
      return;
    if (
      (this.flagType === TF_FLAGTYPE_INVADE || this.flagType === TF_FLAGTYPE_RESOURCE_CONTROL) &&
      this.team !== TEAM_UNASSIGNED &&
      p.team !== this.team
    )
      return;
    const c = p.cond;
    if (
      c.has(TF_COND.INVULNERABLE) ||
      c.has(TF_COND.INVULNERABLE_USER_BUFF) ||
      c.has(TF_COND.INVULNERABLE_CARD_EFFECT)
    )
      return;
    if (isStealthed(p)) return;
    if (c.has(TF_COND.PHASE)) return;
    if (hasTheFlag(p) && !TF_FLAG_RETURN_ON_TOUCH) return;
    if (this.world.pointInRespawnRoom(p, this.world.centerOf(p))) return;
    if (
      this.isDropped() &&
      p.team === this.team &&
      this.flagType === TF_FLAGTYPE_CTF &&
      TF_FLAG_RETURN_ON_TOUCH
    ) {
      this.reset();
      this.resetMessage();
      p.stats.flagReturns++;
      return;
    }
    this.pickUp(p);
  }

  /** SDK: CCaptureFlag::PickUp. */
  pickUp(p: Player): void {
    const world = this.world;
    if (this.disabled) return;
    if (!flagsMayBeCapped(world)) return;
    if (!this.allowOwnerPickup && this.prevOwner === p.id) return;
    // Parent to the carrier (the renderer puts it on the "flag" attachment).
    this.origin.x = p.origin.x;
    this.origin.y = p.origin.y;
    this.origin.z = p.origin.z;
    this.setParent(p);
    p.carriedFlag = this.id;
    // A spy carrying the intelligence loses his disguise.
    if (p.cond.has(TF_COND.DISGUISED) || p.cond.has(TF_COND.DISGUISING)) {
      p.cond.remove(TF_COND.DISGUISED);
      p.cond.remove(TF_COND.DISGUISING);
    }
    this.skin = this.skin + TF_FLAG_NUMBEROFSKINS;
    this.prevOwner = p.id;
    this.allowOwnerPickup = true;
    if (this.initialPlayer === NO_ENTITY) this.initialPlayer = p.id;
    if (this.flagType === TF_FLAGTYPE_CTF) {
      for (const team of [2, 3])
        teamSound(world, team, team !== p.team ? TF_CTF_ENEMY_STOLEN : TF_CTF_TEAM_STOLEN);
    }
    const wasHome = this.status === TF_FLAGINFO_HOME;
    this.setFlagStatus(TF_FLAGINFO_STOLEN);
    this.resetTime = 0;
    world.events.push({
      type: 'flag',
      kind: 'pickup',
      player: p.id,
      team: this.team,
      flag: this.id,
    });
    void wasHome;
    this.fireOutput('OnPickUp', this);
    this.fireOutput('OnPickup1', p);
    const idx = teamOutputIndex(p.team);
    if (idx === 1) this.fireOutput('OnPickupTeam1', this);
    else if (idx === 2) this.fireOutput('OnPickupTeam2', this);
  }

  /** SDK: CCaptureFlag::Capture. */
  capture(p: Player, capturePoint: number): void {
    const world = this.world;
    if (this.disabled) return;
    void capturePoint;
    const rules = world.rules;
    if (this.flagType === TF_FLAGTYPE_CTF) {
      let notify = true;
      const caps = rules.flagCaptures[p.team];
      if (TF_FLAG_CAPS_PER_ROUND > 0 && caps >= 0 && TF_FLAG_CAPS_PER_ROUND - caps <= 1)
        notify = false;
      if (notify) {
        for (const team of [2, 3])
          teamSound(world, team, team !== p.team ? TF_CTF_ENEMY_CAPTURED : TF_CTF_TEAM_CAPTURED);
        handleCTFCaptureBonus(world, p.team);
      }
      p.stats.captures++;
      const initial = world.player(this.initialPlayer);
      if (initial && initial !== p) initial.stats.captures++;
      this.initialPlayer = NO_ENTITY;
      if (TF_FLAG_CAPS_PER_ROUND > 0) rules.flagCaptures[p.team]++;
      else rules.addTeamScore(p.team, 1);
    }
    world.events.push({
      type: 'flag',
      kind: 'captured',
      player: p.id,
      team: this.team,
      flag: this.id,
    });
    this.setFlagStatus(TF_FLAGINFO_HOME);
    this.resetTime = 0;
    this.skin = this.team === TEAM_UNASSIGNED ? 2 : this.team - 2;
    p.carriedFlag = NO_ENTITY;
    this.reset();
    this.fireOutput('OnCapture', this);
    this.fireOutput('OnCapture1', p);
    const idx = teamOutputIndex(p.team);
    if (idx === 1) this.fireOutput('OnCapTeam1', this);
    else if (idx === 2) this.fireOutput('OnCapTeam2', this);
    this.captured = true;
    this.setContextThink(this.flagThink, world.curtime + TF_FLAG_THINK_TIME);
    if (rules.inStalemate() && rules.flagCaptures[p.team] < TF_FLAG_CAPS_PER_ROUND)
      rules.flagCaptures[p.team] = TF_FLAG_CAPS_PER_ROUND;
  }

  /** SDK: CCaptureFlag::Drop. */
  drop(p: Player, visible: boolean, thrown = false, message = true): void {
    const world = this.world;
    if (this.disabled) return;
    void visible;
    p.carriedFlag = NO_ENTITY;
    this.setParent(null);
    if (thrown) {
      this.allowOwnerPickup = false;
      this.ownerPickupTime = world.curtime + TF_FLAG_OWNER_PICKUP_TIME;
    }
    // Trace down from the carrier's centre to find the ground.
    const filter = world.entityFilter(this, COLLISION_GROUP_DEBRIS);
    const c = world.centerOf(p);
    let found = false;
    const muls = [0, 1, -1];
    for (let z = 0; z < 3 && !found; z++) {
      for (let y = 0; y < 3 && !found; y++) {
        for (let x = 0; x < 3 && !found; x++) {
          dropStart.x = c.x + muls[x] * 10;
          dropStart.y = c.y + muls[y] * 10;
          dropStart.z = c.z + muls[z] * 10;
          dropEnd.x = dropStart.x;
          dropEnd.y = dropStart.y;
          dropEnd.z = dropStart.z - 8000;
          world.traceHull(dropStart, dropEnd, FLAG_MINS, FLAG_MAXS, MASK_SOLID, filter, dropTrace);
          if (!dropTrace.startSolid) found = true;
        }
      }
    }
    if (!found) {
      world.centerOf(p);
      this.origin.x = c.x;
      this.origin.y = c.y;
      this.origin.z = c.z;
    } else {
      this.origin.x = dropTrace.endPos.x;
      this.origin.y = dropTrace.endPos.y;
      this.origin.z = dropTrace.endPos.z;
      const hit = world.entity(dropTrace.entity);
      if (hit && hit.moveType === MOVETYPE_PUSH) this.setParent(hit);
    }
    if (this.flagType === TF_FLAGTYPE_CTF && message) {
      for (const team of [2, 3])
        teamSound(world, team, team !== p.team ? TF_CTF_ENEMY_DROPPED : TF_CTF_TEAM_DROPPED);
    }
    this.skin = this.skin - TF_FLAG_NUMBEROFSKINS;
    this.setFlagReturnIn(this.returnTime);
    this.angles.x = this.resetAng.x;
    this.angles.y = this.resetAng.y;
    this.angles.z = this.resetAng.z;
    this.setFlagStatus(TF_FLAGINFO_DROPPED);
    world.events.push({
      type: 'flag',
      kind: 'dropped',
      player: p.id,
      team: this.team,
      flag: this.id,
    });
    this.fireOutput('OnDrop', this);
    this.fireOutput('OnDrop1', p);
    // Re-link touches at the new spot (CBaseEntity::SetAbsOrigin re-links the trigger).
    world.resetTriggerTouches(this);
  }

  private setFlagReturnIn(seconds: number): void {
    this.resetTime = this.world.curtime + seconds;
    this.maxResetTime = seconds;
  }

  /** SDK: CCaptureFlag::Reset. */
  reset(): void {
    const world = this.world;
    const parent = world.entity(this.initialParent);
    this.setParent(null);
    if (!parent) {
      this.origin.x = this.resetPos.x;
      this.origin.y = this.resetPos.y;
      this.origin.z = this.resetPos.z;
    } else {
      this.origin.x = parent.origin.x + this.offset.x;
      this.origin.y = parent.origin.y + this.offset.y;
      this.origin.z = parent.origin.z + this.offset.z;
      this.setParent(parent);
    }
    this.angles.x = this.resetAng.x;
    this.angles.y = this.resetAng.y;
    this.angles.z = this.resetAng.z;
    const carrier = world.player(this.prevOwner);
    if (carrier && carrier.carriedFlag === this.id) carrier.carriedFlag = NO_ENTITY;
    this.setFlagStatus(TF_FLAGINFO_HOME);
    this.resetTime = 0;
    this.initialPlayer = NO_ENTITY;
    this.allowOwnerPickup = true;
    this.prevOwner = NO_ENTITY;
    if (this.flagType === TF_FLAGTYPE_INVADE || this.flagType === TF_FLAGTYPE_RESOURCE_CONTROL) {
      this.changeTeam(this.originalTeam);
      this.skin = this.team === TEAM_UNASSIGNED ? 2 : this.team - 2;
    }
    this.moveType = MOVETYPE_NONE;
    world.resetTriggerTouches(this);
  }

  /** SDK: CCaptureFlag::ResetMessage. */
  resetMessage(): void {
    const world = this.world;
    if (this.flagType === TF_FLAGTYPE_CTF) {
      for (const team of [2, 3])
        teamSound(world, team, team === this.team ? TF_CTF_ENEMY_RETURNED : TF_CTF_TEAM_RETURNED);
      world.events.push({
        type: 'flag',
        kind: 'returned',
        player: 0,
        team: this.team,
        flag: this.id,
      });
      world.emitSound(TF_CTF_FLAGSPAWN, { entity: this.id });
    }
    this.fireOutput('OnReturn', this);
  }

  /** SDK: CCaptureFlag::Think. */
  private flagThinkFn(): void {
    const world = this.world;
    if (this.disabled) return;
    if (!flagsMayBeCapped(world)) {
      this.setContextThink(this.flagThink, world.curtime + TF_FLAG_THINK_TIME);
      return;
    }
    if (this.captured) this.captured = false;
    if (this.isDropped()) {
      if (!this.allowOwnerPickup && this.ownerPickupTime && world.curtime > this.ownerPickupTime)
        this.allowOwnerPickup = true;
      if (this.resetTime && world.curtime > this.resetTime) {
        this.reset();
        this.resetMessage();
      }
    }
    this.setContextThink(this.flagThink, world.curtime + TF_FLAG_THINK_TIME);
  }

  /** CTFPlayer::DropFlag for this flag's carrier. */
  dropFromCarrier(thrown: boolean, message = true): void {
    const p = this.world.player(this.prevOwner);
    if (p && p.carriedFlag === this.id) this.drop(p, true, thrown, message);
  }

  override acceptInput(
    input: string,
    value: string,
    activator: Entity | null,
    caller: Entity | null,
  ): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.setDisabled(false);
        return true;
      case 'disable':
        this.setDisabled(true);
        return true;
      case 'roundactivate': {
        const p = this.world.player(this.prevOwner);
        if (p && p.carriedFlag === this.id) this.drop(p, true, false, false);
        this.reset();
        return true;
      }
      case 'forcedrop':
        this.dropFromCarrier(false);
        return true;
      case 'forcereset':
      case 'forceresetsilent':
      case 'forceresetanddisablesilent': {
        if (!this.isHome()) {
          const silent = input.toLowerCase() !== 'forcereset';
          this.dropFromCarrier(false, !silent);
          this.reset();
          if (!silent) this.resetMessage();
        }
        if (input.toLowerCase() === 'forceresetanddisablesilent') this.setDisabled(true);
        return true;
      }
      case 'setreturntime':
      case 'showtimer': {
        const t = atoi(value);
        this.returnTime = t >= 0 ? t : 0;
        if (input.toLowerCase() === 'showtimer' || this.isDropped())
          this.setFlagReturnIn(this.returnTime);
        return true;
      }
      case 'forceglowdisabled':
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override netSchema(): NetSchema | null {
    return NET_FLAG;
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.status = this.status;
    out.flagType = this.flagType;
    out.disabled = this.disabled;
    out.resetTime = this.resetTime;
    out.maxResetTime = this.maxResetTime;
    out.carrier = this.isStolen() ? this.prevOwner : -1;
    out.hudIcon = this.hudIcon;
    out.paperEffect = this.paperEffect;
    out.trailEffect = this.trailEffect;
    out.useTrailEffect = this.useTrailEffect;
  }
}

/** SDK: CTFGameRules::HandleCTFCaptureBonus — the capping team is crit boosted for the bonus time. */
export function handleCTFCaptureBonus(world: GameWorld, team: number): void {
  const o = objectives(world);
  const bonus = o.ctfCaptureBonusTime >= 0 ? o.ctfCaptureBonusTime : TF_CTF_BONUS_TIME;
  if (bonus <= 0) return;
  world.forEachPlayer((p) => {
    if (p.alive && p.team === team) p.cond.add(TF_COND.CRITBOOSTED_CTF_CAPTURE, bonus);
  });
}

/** CTFPlayer::DropFlag: the flag the player carries, dropped where he stands. */
export function dropPlayerFlag(world: GameWorld, p: Player, thrown = false): void {
  if (p.carriedFlag === NO_ENTITY) return;
  const f = world.entity(p.carriedFlag);
  if (f instanceof CaptureFlag) f.drop(p, true, thrown, true);
  else p.carriedFlag = NO_ENTITY;
}

// ─── func_capturezone ──────────────────────────────────────────────────────

export class CaptureZone extends BaseTrigger {
  capturePoint = 0;
  captureDelay = 1.1;
  captureDelayOffset = 0.025;
  shouldBlock = true;
  private nextTouchingEnemyZoneWarning = -1;

  override keyValue(key: string, value: string): boolean {
    switch (key) {
      case 'capturepoint':
        this.capturePoint = atoi(value);
        return true;
      case 'capture_delay':
        this.captureDelay = atof(value);
        return true;
      case 'capture_delay_offset':
        this.captureDelayOffset = atof(value);
        return true;
      case 'shouldblock':
        this.shouldBlock = atoi(value) !== 0;
        return true;
      default:
        return super.keyValue(key, value);
    }
  }

  /** SDK: CCaptureZone::Spawn. */
  override spawn(): void {
    super.spawn();
    this.spawnflags |= SF_TRIGGER_ALLOW_ALL;
    track(objectives(this.world).zones, this);
  }

  override onRemove(): void {
    untrack(objectives(this.world).zones, this);
    super.onRemove();
  }

  /** SDK: CCaptureZone::ShimTouch. */
  override touch(other: Entity): void {
    if (this.disabled || !other.isPlayer()) return;
    const p = other as Player;
    if (!hasTheFlag(p)) return;
    const flag = this.world.entity(p.carriedFlag);
    if (!(flag instanceof CaptureFlag)) return;
    if (
      !flag.captured &&
      this.team !== TEAM_UNASSIGNED &&
      p.team !== TEAM_UNASSIGNED &&
      p.team !== this.team
    ) {
      if (
        flag.flagType === TF_FLAGTYPE_CTF &&
        this.nextTouchingEnemyZoneWarning < this.world.curtime
      ) {
        this.world.events.push({
          type: 'hud',
          kind: 'center',
          key: '#TF_CTF_Wrong_Goal',
          to: p.id,
        });
        this.nextTouchingEnemyZoneWarning = this.world.curtime + 5;
      }
      return;
    }
    this.capture(p, flag);
  }

  /** SDK: CCaptureZone::Capture (CanFlagBeCaptured: with tf_flag_return_on_touch your own flag must be home). */
  private capture(p: Player, flag: CaptureFlag): void {
    if (TF_FLAG_RETURN_ON_TOUCH) {
      for (const f of objectives(this.world).flags) if (f.team === p.team && !f.isHome()) return;
    }
    if (flag.captured) return;
    flag.capture(p, this.capturePoint);
    this.fireOutput('OnCapture', this);
    const idx = teamOutputIndex(p.team);
    if (idx === 1) this.fireOutput('OnCapTeam1', this);
    else if (idx === 2) this.fireOutput('OnCapTeam2', this);
  }

  /** Where a player stands in this zone (tests and bots). */
  center(out: Vec3): Vec3 {
    return this.world.brushCenter(this, out);
  }
}

registerEntityClass('item_teamflag', CaptureFlag);
registerEntityClass('func_capturezone', CaptureZone);
