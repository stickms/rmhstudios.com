/**
 * Teleporters (the SDK's CObjectTeleporter, tf_obj_teleporter.cpp): an
 * entrance and an exit built by the same engineer link up (FindMatch) and
 * share their upgrade state (CopyUpgradeStateToMatch). A teammate — or any
 * spy — standing still on a ready entrance is sent (TeleporterSend), arrives
 * on the exit 0.1 + 0.25 s later (TeleporterReceive → RecieveTeleportingPlayer,
 * telefragging enemies in the way), glows for 12 s (TeleportEffect,
 * TF_COND_TELEPORTED) and the pair recharges for g_iTeleporterRechargeTimes
 * (10 / 5 / 3 s by level).
 */

import { NO_ENTITY } from '../../core/types';
import { TF_CLASS_SPY, TF_TEAM_RED, VEC_HULL_MAX, VEC_HULL_MIN } from '../../core/constants';
import { set, vec3, type Vec3 } from '../../core/vec';
import { TELEPORTER } from '../../data';
import { MODE_TELEPORTER_ENTRANCE, MODE_TELEPORTER_EXIT, OBJ_TELEPORTER } from '../building-api';
import { TF_COND } from '../conditions';
import { createDamageInfo, DMG_CRUSH, resetDamageInfo, TF_DMG_CUSTOM_TELEFRAG } from '../damage';
import { EF_NODRAW, LIFE_ALIVE, type Entity } from '../entity';
import type { NetRecord, NetSchema } from '../net-schema';
import type { Player } from '../player';
import type { TouchVolume } from '../world';
import { objectsOf, TFBaseObject } from './base-object';
import { NET_TELEPORTER } from './net';

/** TELEPORTER_STATE_* (tf_shareddefs.h). */
export const TELEPORTER_STATE_BUILDING = 0;
export const TELEPORTER_STATE_IDLE = 1;
export const TELEPORTER_STATE_READY = 2;
export const TELEPORTER_STATE_SENDING = 3;
export const TELEPORTER_STATE_RECEIVING = 4;
export const TELEPORTER_STATE_RECEIVING_RELEASE = 5;
export const TELEPORTER_STATE_RECHARGING = 6;
export const TELEPORTER_STATE_UPGRADING = 7;

/** BUILD_TELEPORTER_NEXT_THINK. */
const TELEPORTER_THINK = 0.05;
/** TeleporterSend: the exit is told 0.1 s after the entrance fires. */
const SEND_DELAY = 0.1;
/** TeleporterTouch: a player must be (almost) standing still. */
const MAX_SEND_SPEED_SQR = 5 * 5;
/** TeleporterTouch: a reservation lapses after this long off the pad / without using it. */
const RESERVE_AFTER_TOUCH = 2;
const RESERVE_GRIEF_TIME = 3;
/** RecieveTeleportingPlayer telefrag box expansion and damage. */
const TELEFRAG_EXPAND = 4;
const TELEFRAG_DAMAGE = 1000;

const MODEL_ENTRANCE_PLACEMENT = 'models/buildables/teleporter_blueprint_enter.mdl';
const MODEL_EXIT_PLACEMENT = 'models/buildables/teleporter_blueprint_exit.mdl';
const MODEL_BUILDING = 'models/buildables/teleporter.mdl';
const MODEL_LIGHT = 'models/buildables/teleporter_light.mdl';

const TELE_MINS: Vec3 = { ...TELEPORTER.mins };
const TELE_MAXS: Vec3 = { ...TELEPORTER.maxs };

const sPos = vec3();
const sMins = vec3();
const sMaxs = vec3();
const teleInfo = createDamageInfo();
const telefragVictims: Player[] = [];

/** The pad's touch volume: players standing on (or in) the teleporter. */
class TeleporterPad implements TouchVolume {
  readonly id: number;
  removed = false;
  constructor(readonly owner: ObjectTeleporter) {
    this.id = owner.id;
  }
  wantsToucher(other: Entity): boolean {
    return other.isPlayer();
  }
  touchesBox(mins: Vec3, maxs: Vec3): boolean {
    const o = this.owner;
    return (
      mins.x < o.origin.x + o.maxs.x &&
      maxs.x > o.origin.x + o.mins.x &&
      mins.y < o.origin.y + o.maxs.y &&
      maxs.y > o.origin.y + o.mins.y &&
      mins.z <= o.origin.z + o.maxs.z + 2 &&
      maxs.z > o.origin.z + o.mins.z
    );
  }
  startTouch(other: Entity): void {
    this.owner.padStartTouch(other);
  }
  touch(other: Entity): void {
    this.owner.teleporterTouch(other);
  }
  endTouch(other: Entity): void {
    this.owner.padEndTouch(other);
  }
}

export class ObjectTeleporter extends TFBaseObject {
  readonly objectType = OBJ_TELEPORTER;
  readonly baseHealth = TELEPORTER.baseHealth;
  readonly objMins = TELE_MINS;
  readonly objMaxs = TELE_MAXS;

  /** m_iState. */
  state = TELEPORTER_STATE_BUILDING;
  lastStateChangeTime = 0;
  /** m_flMyNextThink: the state machine waits until then. */
  myNextThink = 0;
  /** m_flRechargeTime / m_flCurrentRechargeDuration. */
  rechargeTime = 0;
  rechargeDuration = 0;
  timesUsed = 0;
  /** m_hMatchingTeleporter / m_hTeleportingPlayer / m_hReservedForPlayer. */
  matchId: number = NO_ENTITY;
  teleportingPlayer: number = NO_ENTITY;
  reservedFor: number = NO_ENTITY;
  reserveAfterTouchUntil = 0;
  private pad: TeleporterPad | null = null;

  constructor(classname = 'obj_teleporter') {
    super(classname);
  }

  override netSchema(): NetSchema | null {
    return NET_TELEPORTER;
  }

  get isEntrance(): boolean {
    return this.objectMode === MODE_TELEPORTER_ENTRANCE;
  }

  get isExit(): boolean {
    return this.objectMode === MODE_TELEPORTER_EXIT;
  }

  override get killIcon(): string {
    return 'obj_teleporter';
  }

  /** SDK: CObjectTeleporter::SetState. */
  setState(state: number): void {
    if (state !== this.state) {
      this.state = state;
      this.lastStateChangeTime = this.world.curtime;
    }
  }

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  protected override onRespawnObject(): void {
    this.model = this.isEntrance ? MODEL_ENTRANCE_PLACEMENT : MODEL_EXIT_PLACEMENT;
  }

  /** SDK: CObjectTeleporter::IsPlacementPosValid — a player fits standing on it. */
  protected override extraPlacementCheck(): boolean {
    set(sPos, this.buildOrigin.x, this.buildOrigin.y, this.buildOrigin.z + TELE_MAXS.z);
    return this.hullClearAt(sPos);
  }

  /** SDK: CObjectTeleporter::StartBuilding / SetStartBuildingModel. */
  protected override onStartBuilding(): void {
    this.setState(TELEPORTER_STATE_BUILDING);
    this.model = MODEL_BUILDING;
  }

  /** SDK: CObjectTeleporter::OnGoActive. */
  protected override onGoActive(): void {
    this.model = MODEL_LIGHT;
    this.setState(TELEPORTER_STATE_IDLE);
    this.lastStateChangeTime = 0;
    this.myNextThink = 0;
    if (!this.pad) {
      this.pad = new TeleporterPad(this);
      this.world.registerTrigger(this.pad);
    }
    if (this.isMatchingTeleporterReady()) {
      const m = this.matching();
      if (m) this.updateMaxHealth(m.maxHealth);
    }
    this.setContextThinkIn(0.1);
  }

  /** SDK: CObjectTeleporter::StartUpgrading — the partner matches our max health. */
  protected override onStartUpgrading(): void {
    const m = this.matching();
    if (m && !this.carryDeploy && !m.carryDeploy) m.updateMaxHealth(this.maxHealth);
    this.setState(TELEPORTER_STATE_UPGRADING);
  }

  protected override onFinishUpgrading(): void {
    this.setState(TELEPORTER_STATE_IDLE);
  }

  protected override onMakeCarried(): void {
    this.removePad();
    this.clearTeleportingPlayer();
    const m = this.matching();
    if (m) {
      m.clearTeleportingPlayer();
      m.matchId = NO_ENTITY;
    }
    this.matchId = NO_ENTITY;
    this.setState(TELEPORTER_STATE_IDLE);
  }

  override onRemove(): void {
    this.removePad();
    const m = this.world.entity(this.matchId);
    if (m instanceof ObjectTeleporter && m.matchId === this.id) m.matchId = NO_ENTITY;
    super.onRemove();
  }

  private removePad(): void {
    if (!this.pad) return;
    this.pad.removed = true;
    this.world.unregisterTrigger(this.pad);
    this.pad = null;
  }

  private clearTeleportingPlayer(): void {
    const p = this.world.player(this.teleportingPlayer);
    if (p) p.cond.remove(TF_COND.SELECTED_TO_TELEPORT);
    this.teleportingPlayer = NO_ENTITY;
  }

  /** SDK: CObjectTeleporter::UpdateMaxHealth — keep the health fraction. */
  updateMaxHealth(maxHealth: number, force = false): void {
    if (this.carryDeploy && !force) return;
    const frac = this.maxHealth > 0 ? this.health / this.maxHealth : 1;
    this.maxHealth = maxHealth;
    this.setHealth(maxHealth * frac);
  }

  /** SDK: CObjectTeleporter::Explode — the partner drops back to level 1. */
  protected override explode(): void {
    const m = this.matching();
    if (m) {
      m.highestLevel = 1;
      m.level = 1;
      m.upgradeMetal = 0;
      m.updateMaxHealth(m.maxHealthForCurrentLevel(), true);
      m.clearTeleportingPlayer();
    }
    this.clearTeleportingPlayer();
    super.explode();
  }

  // ─── Matching ─────────────────────────────────────────────────────────────

  matching(): ObjectTeleporter | null {
    const e = this.world.entity(this.matchId);
    return e instanceof ObjectTeleporter && !e.removed ? e : null;
  }

  /** SDK: CObjectTeleporter::FindMatch — the builder's other end; the more upgraded one wins. */
  findMatch(): ObjectTeleporter | null {
    if (this.builder === NO_ENTITY) return null;
    const list = objectsOf(this.world);
    let match: ObjectTeleporter | null = null;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o === this || o.removed || !(o instanceof ObjectTeleporter) || o.builder !== this.builder)
        continue;
      if (o.placing || o.carried) continue;
      if (!((this.isEntrance && o.isExit) || (this.isExit && o.isEntrance))) continue;
      const other = o.matching();
      if (other && other !== this) continue;
      match = o;
      break;
    }
    if (match) {
      const from = match.level > this.level || match.upgradeMetal > this.upgradeMetal;
      if (from) match.copyUpgradeStateToMatch(this);
      else this.copyUpgradeStateToMatch(match);
      match.matchId = this.id;
    }
    return match;
  }

  /** SDK: CObjectTeleporter::CopyUpgradeStateToMatch (ours onto `to`). */
  copyUpgradeStateToMatch(to: ObjectTeleporter | null): void {
    if (!to) return;
    to.highestLevel = this.highestLevel;
    to.level = this.level;
    to.upgradeMetal = this.upgradeMetal;
    to.upgradeMetalRequired = this.upgradeMetalRequired;
    to.upgradeCompleteTime = this.upgradeCompleteTime;
  }

  /** SDK: CObjectTeleporter::IsMatchingTeleporterReady. */
  isMatchingTeleporterReady(): boolean {
    let m = this.matching();
    if (!m) {
      m = this.findMatch();
      this.matchId = m ? m.id : NO_ENTITY;
    }
    return (
      !!m && m.state !== TELEPORTER_STATE_BUILDING && !m.building && !m.upgrading && !m.disabled
    );
  }

  /** SDK: CObjectTeleporter::IsReady. */
  isReady(): boolean {
    if (!this.isMatchingTeleporterReady()) return false;
    return this.state !== TELEPORTER_STATE_BUILDING && !this.upgrading && !this.disabled;
  }

  /** SDK: CObjectTeleporter::CheckUpgradeOnHit — upgrades are shared with the other end. */
  override checkUpgradeOnHit(player: Player): boolean {
    if (super.checkUpgradeOnHit(player)) {
      this.copyUpgradeStateToMatch(this.matching());
      return true;
    }
    return false;
  }

  /** SDK: CObjectTeleporter::Command_Repair — 5 health per metal, mirrored onto the match. */
  override commandRepair(player: Player, amount: number, mod: number): number {
    const ratio = 5;
    const added = super.commandRepair(player, amount, mod, ratio);
    const m = this.matching();
    if (added > 0) {
      if (m) m.setHealth(Math.min(m.maxHealth, m.health + added));
      return added;
    }
    if (m && !m.building) {
      const max = amount * mod;
      const repair = Math.min(max, m.maxHealth - m.health);
      let cost = Math.ceil(repair / ratio);
      if (cost > player.ammo[3]) cost = player.ammo[3];
      if (cost > 0) {
        const add = cost * ratio;
        player.ammo[3] -= cost;
        m.setHealth(Math.min(m.maxHealth, m.health + add));
        return add;
      }
    }
    return 0;
  }

  // ─── Using it ─────────────────────────────────────────────────────────────

  /** SDK: CObjectTeleporter::PlayerCanBeTeleported — teammates, and spies of either team. */
  playerCanBeTeleported(p: Player | null): boolean {
    if (!p || !p.alive) return false;
    if (p.carriedFlag !== NO_ENTITY) return false;
    const builder = this.builderPlayer();
    if (!builder && !this.mapPlaced) return false;
    if (p.playerClass === TF_CLASS_SPY) return true;
    if (builder && builder.team !== p.team) return false;
    if (this.mapPlaced && this.team !== p.team) return false;
    return true;
  }

  padStartTouch(other: Entity): void {
    if (this.reservedFor === other.id) this.reserveAfterTouchUntil = 0;
  }

  padEndTouch(other: Entity): void {
    if (this.reservedFor === other.id)
      this.reserveAfterTouchUntil = this.world.curtime + RESERVE_AFTER_TOUCH;
  }

  /** SDK: CObjectTeleporter::TeleporterTouch. */
  teleporterTouch(other: Entity): void {
    if (this.disabled || !other.isPlayer() || this.building || this.carried) return;
    const p = other as Player;
    if (!this.playerCanBeTeleported(p)) {
      if (p.carriedFlag !== NO_ENTITY)
        this.world.events.push({
          type: 'hud',
          kind: 'center',
          key: '#TF_NoTeleWithFlag',
          to: p.id,
        });
      if (this.reservedFor === p.id) this.reservedFor = NO_ENTITY;
      return;
    }
    if (!this.isEntrance) return;
    const now = this.world.curtime;
    let setReserved = this.reservedFor === NO_ENTITY;
    if (!setReserved) {
      const r = this.world.player(this.reservedFor);
      setReserved =
        !r ||
        !this.playerCanBeTeleported(r) ||
        !r.alive ||
        (this.reserveAfterTouchUntil !== 0 && this.reserveAfterTouchUntil < now);
    }
    if (setReserved) {
      this.reservedFor = p.id;
      this.reserveAfterTouchUntil = 0;
    }
    if (this.reservedFor !== p.id) return;
    if (this.state === TELEPORTER_STATE_READY) {
      const v = p.velocity;
      if (v.x * v.x + v.y * v.y + v.z * v.z < MAX_SEND_SPEED_SQR) {
        if (this.matching()) this.teleporterSend(p);
      } else if (now - this.lastStateChangeTime > RESERVE_GRIEF_TIME) this.reservedFor = NO_ENTITY;
    }
  }

  /** The team colour of a teleport effect (a disguised spy shows the builder's team). */
  private effectTeam(p: Player): number {
    const builder = this.builderPlayer();
    if (
      p.playerClass === TF_CLASS_SPY &&
      p.cond.has(TF_COND.DISGUISED) &&
      builder &&
      p.team !== builder.team
    )
      return builder.team;
    return p.team;
  }

  /** SDK: CObjectTeleporter::TeleporterSend. */
  teleporterSend(p: Player): void {
    const world = this.world;
    this.teleportingPlayer = p.id;
    p.cond.add(TF_COND.SELECTED_TO_TELEPORT);
    const pos = { x: this.origin.x, y: this.origin.y, z: this.origin.z };
    const red = this.effectTeam(p) === TF_TEAM_RED;
    world.emitEffect({ kind: 'particle', system: red ? 'teleported_red' : 'teleported_blue', pos });
    world.emitEffect({
      kind: 'particle',
      system: red ? 'player_sparkles_red' : 'player_sparkles_blue',
      pos,
      entity: p.id,
    });
    world.emitSound('Building_Teleporter.Send', { entity: this.id });
    this.setState(TELEPORTER_STATE_SENDING);
    this.myNextThink = world.curtime + SEND_DELAY;
    this.timesUsed++;
    this.reservedFor = NO_ENTITY;
  }

  /** SDK: CObjectTeleporter::TeleporterReceive. */
  teleporterReceive(p: Player | null): void {
    if (!p) return;
    const world = this.world;
    this.teleportingPlayer = p.id;
    const red = this.effectTeam(p) === TF_TEAM_RED;
    world.emitEffect({
      kind: 'particle',
      system: red ? 'teleportedin_red' : 'teleportedin_blue',
      pos: { x: this.origin.x, y: this.origin.y, z: this.origin.z },
    });
    world.emitSound('Building_Teleporter.Receive', { entity: this.id });
    this.setState(TELEPORTER_STATE_RECEIVING);
    this.myNextThink = world.curtime + TELEPORTER.fadeOutTime;
    this.timesUsed++;
  }

  /** SDK: CObjectTeleporter::RecieveTeleportingPlayer — telefrag and move the player. */
  receiveTeleportingPlayer(p: Player | null): void {
    if (!p || this.removed || !p.alive) return;
    const world = this.world;
    set(sPos, this.origin.x, this.origin.y, this.origin.z + TELE_MAXS.z + 1);
    set(
      sMins,
      sPos.x + VEC_HULL_MIN.x - TELEFRAG_EXPAND,
      sPos.y + VEC_HULL_MIN.y - TELEFRAG_EXPAND,
      sPos.z + VEC_HULL_MIN.z - TELEFRAG_EXPAND,
    );
    set(
      sMaxs,
      sPos.x + VEC_HULL_MAX.x + TELEFRAG_EXPAND,
      sPos.y + VEC_HULL_MAX.y + TELEFRAG_EXPAND,
      sPos.z + VEC_HULL_MAX.z + TELEFRAG_EXPAND,
    );
    telefragVictims.length = 0;
    let clear = true;
    world.forEachEntity((e) => {
      if (!clear || e === this || e === p || e.removed) return;
      const overlaps =
        sMins.x < e.origin.x + e.maxs.x &&
        sMaxs.x > e.origin.x + e.mins.x &&
        sMins.y < e.origin.y + e.maxs.y &&
        sMaxs.y > e.origin.y + e.mins.y &&
        sMins.z < e.origin.z + e.maxs.z &&
        sMaxs.z > e.origin.z + e.mins.z;
      if (!overlaps) return;
      if (e.isPlayer()) {
        const q = e as Player;
        if (q.lifeState === LIFE_ALIVE && q.team !== p.team) telefragVictims.push(q);
        return;
      }
      if (e.isBaseObject() || e.isTrigger() || !e.isSolid() || e.effects & EF_NODRAW) return;
      if (e.classname.startsWith('tf_projectile') || e.classname === 'tf_ammo_pack') return;
      clear = false;
    });
    if (!clear) {
      this.detonate();
      return;
    }
    for (let i = 0; i < telefragVictims.length; i++) {
      const info = teleInfo;
      resetDamageInfo(info);
      info.attacker = p.id;
      info.inflictor = p.id;
      info.damage = TELEFRAG_DAMAGE;
      info.damageType = DMG_CRUSH;
      info.customKill = TF_DMG_CUSTOM_TELEFRAG;
      info.killIcon = 'telefrag';
      telefragVictims[i].eyePosition(info.position);
      world.applyDamage(telefragVictims[i], info);
    }
    telefragVictims.length = 0;
    set(sMins, this.angles.x, this.angles.y, this.angles.z);
    set(sMaxs, 0, 0, 0);
    world.teleportEntity(p, sPos, sMins, sMaxs);
  }

  /** SDK: CObjectTeleporter::TeleporterThink. */
  protected override contextThink(): void {
    if (this.carried || this.placing || this.building) return;
    const world = this.world;
    this.setContextThinkIn(TELEPORTER_THINK);
    if (this.disabled || !this.isMatchingTeleporterReady()) {
      if (this.state !== TELEPORTER_STATE_IDLE && this.state !== TELEPORTER_STATE_UPGRADING)
        this.setState(TELEPORTER_STATE_IDLE);
      return;
    }
    if (this.myNextThink && this.myNextThink > world.curtime + 1e-9) return;
    const match = this.matching();
    if (!match) return;
    switch (this.state) {
      case TELEPORTER_STATE_BUILDING:
      case TELEPORTER_STATE_UPGRADING:
        break;
      case TELEPORTER_STATE_READY:
        break;
      case TELEPORTER_STATE_SENDING: {
        match.teleporterReceive(world.player(this.teleportingPlayer));
        this.rechargeDuration = TELEPORTER.rechargeTime[this.level] ?? TELEPORTER.rechargeTime[1];
        this.rechargeTime =
          world.curtime + TELEPORTER.fadeOutTime + TELEPORTER.fadeInTime + this.rechargeDuration;
        this.setState(TELEPORTER_STATE_RECHARGING);
        break;
      }
      case TELEPORTER_STATE_RECEIVING: {
        this.receiveTeleportingPlayer(world.player(this.teleportingPlayer));
        if (this.removed) return;
        this.setState(TELEPORTER_STATE_RECEIVING_RELEASE);
        this.myNextThink = world.curtime + TELEPORTER.fadeInTime;
        break;
      }
      case TELEPORTER_STATE_RECEIVING_RELEASE: {
        const p = world.player(this.teleportingPlayer);
        if (p) {
          // CTFPlayer::TeleportEffect: the glow lasts 12 s (removed on death).
          p.cond.add(TF_COND.TELEPORTED, TELEPORTER.effectTime);
          p.cond.remove(TF_COND.SELECTED_TO_TELEPORT);
          // CTF_GameStats.Event_PlayerUsedTeleport: the builder scores teleports of others.
          const builder = this.builderPlayer();
          if (builder && builder !== p) builder.stats.teleports++;
        }
        this.teleportingPlayer = NO_ENTITY;
        match.teleportingPlayer = NO_ENTITY;
        this.setState(TELEPORTER_STATE_RECHARGING);
        this.rechargeDuration = TELEPORTER.rechargeTime[this.level] ?? TELEPORTER.rechargeTime[1];
        this.rechargeTime = world.curtime + this.rechargeDuration;
        this.myNextThink = world.curtime + this.rechargeDuration;
        break;
      }
      case TELEPORTER_STATE_RECHARGING:
        if (world.curtime > this.rechargeTime) {
          this.setState(TELEPORTER_STATE_READY);
          world.emitSound('Building_Teleporter.Ready', { entity: this.id });
        }
        break;
      default:
        // IDLE: a ready match makes us ready.
        if (this.isMatchingTeleporterReady()) {
          this.setState(TELEPORTER_STATE_READY);
          world.emitSound('Building_Teleporter.Ready', { entity: this.id });
        }
        break;
    }
  }

  /** Recharge progress 0…1 (1 = ready). */
  charge(): number {
    if (this.state === TELEPORTER_STATE_READY) return 1;
    if (this.state !== TELEPORTER_STATE_RECHARGING || this.rechargeDuration <= 0) return 0;
    const left = this.rechargeTime - this.world.curtime;
    return Math.min(1, Math.max(0, 1 - left / this.rechargeDuration));
  }

  override writeNet(out: NetRecord): void {
    super.writeNet(out);
    out.teleState = this.state;
    out.charge = this.charge();
    out.rechargeTime = this.rechargeTime;
    out.rechargeDuration = this.rechargeDuration;
    out.timesUsed = this.timesUsed;
    out.matchId = this.matchId;
    out.teleportingPlayer = this.teleportingPlayer;
  }
}
