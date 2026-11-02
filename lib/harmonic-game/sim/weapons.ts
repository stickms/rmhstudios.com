/**
 * The player's weapons (plan H1.3): inventory, switching, firing, reload, aim-down-sights, and the
 * outputs the HUD, the view model and the audio read. One `HarmonicWeapons` per world
 * (`sim.weapons`, installed by `attachHarmonicSim`). All numbers are in `weapon-table.ts`.
 *
 * Checkpoint rule (documented in work-packages.md H1.3): the inventory is part of the checkpoint.
 * Dying restores the inventory as it was when the checkpoint was taken (the level start, or the
 * last `logic_autosave`) — exactly as the pickup entities are restored — so nothing can be farmed
 * by dying and weapons found after a checkpoint are found again. Transient state (reload, aim,
 * cooldowns) is reset on the reload.
 *
 * Deterministic: spread is a pure function of the shot counter (`spreadOffset`); timing reads
 * `world.curtime`. No DOM.
 */
import { IN_ATTACK, IN_ATTACK2, IN_RELOAD } from '../../tf2-game/core/constants';
import { angleVectors, normalize, vec3 } from '../../tf2-game/core/vec';
import type { SpUserCmd } from '../../sp-game/player/sp-player';
import type { SpWorld } from '../../sp-game/world/sp-world';
import { hash01 } from '../assets/rng';
import { harmonicSounds } from '../audio/events';
import type { HarmonicSoundName } from '../audio/recipes';
import type { HarmonicCombat, HitResult } from './combat';
import {
  AMMO_PICKUP_AMOUNT,
  PRYBAR_PANEL_DAMAGE,
  RESERVE_MAX,
  SPREAD_SEED,
  WEAPONS,
  WEAPON_IDS,
  weaponBySlot,
  type AmmoType,
  type WeaponDef,
  type WeaponId,
} from './weapon-table';

/** Seconds between empty clicks. */
export const EMPTY_CLICK_INTERVAL = 0.3;
const EPS = 1e-6;

export interface WeaponsState {
  owned: Record<WeaponId, boolean>;
  clip: Record<WeaponId, number>;
  reserve: Record<AmmoType, number>;
  active: WeaponId | null;
  last: WeaponId | null;
  /** Shots fired so far: indexes the spread stream. */
  shots: number;
}

export type WeaponEvent =
  | { type: 'draw'; weapon: WeaponId }
  | { type: 'fire'; weapon: WeaponId; hit: HitResult }
  | { type: 'empty'; weapon: WeaponId }
  | { type: 'reload'; weapon: WeaponId }
  | { type: 'reloaded'; weapon: WeaponId }
  | { type: 'pickup'; weapon: WeaponId | null; ammo: AmmoType | null }
  | { type: 'ads'; on: boolean; fov: number };

export type WeaponListener = (ev: WeaponEvent) => void;

export interface HudWeapon {
  id: string;
  ammo: number;
  reserve: number;
  reloading: boolean;
}

export interface WeaponContextLike {
  slots: number[];
  active: number;
  last: number;
}

/** The n-th shot's offset on the plane at unit distance: a pure function of the shot index. */
export function spreadOffset(shot: number, halfAngleDeg: number): { x: number; y: number } {
  if (halfAngleDeg <= 0) return { x: 0, y: 0 };
  const radius = Math.sqrt(hash01(SPREAD_SEED, shot, 0)) * Math.tan((halfAngleDeg * Math.PI) / 180);
  const theta = hash01(SPREAD_SEED, shot, 1) * Math.PI * 2;
  return { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius };
}

export function emptyWeaponsState(): WeaponsState {
  return {
    owned: { prybar: false, pulse: false, coil: false },
    clip: { prybar: 0, pulse: 0, coil: 0 },
    reserve: { pulse: 0, coil: 0 },
    active: null,
    last: null,
    shots: 0,
  };
}

const cloneState = (s: WeaponsState): WeaponsState => ({
  owned: { ...s.owned },
  clip: { ...s.clip },
  reserve: { ...s.reserve },
  active: s.active,
  last: s.last,
  shots: s.shots,
});

const SURFACES = ['concrete', 'metal', 'grating', 'wood', 'glass', 'ice', 'snow', 'water'];
function impactSound(surface: string): HarmonicSoundName {
  const s = surface.toLowerCase();
  return `impact.${SURFACES.find((n) => s.includes(n)) ?? 'concrete'}` as HarmonicSoundName;
}

const eye = vec3();
const fwd = vec3();
const right = vec3();
const up = vec3();
const aim = vec3();

export class HarmonicWeapons {
  state: WeaponsState = emptyWeaponsState();
  private readonly listeners = new Set<WeaponListener>();
  /** curtime before which the active weapon cannot fire (cooldown, draw). */
  nextAttackAt = 0;
  /** curtime the running reload finishes, or 0. */
  reloadEndsAt = 0;
  ads = false;
  private prevButtons = 0;
  private wasDead = false;
  private cpRef: unknown = null;
  private cpState: WeaponsState = emptyWeaponsState();
  private pendingPlay: string | null = null;

  constructor(
    private readonly world: SpWorld,
    private readonly combat: HarmonicCombat,
  ) {}

  on(fn: WeaponListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(ev: WeaponEvent): void {
    for (const fn of this.listeners) fn(ev);
  }

  // ─── Queries ──────────────────────────────────────────────────────────────

  get activeDef(): WeaponDef | null {
    return this.state.active ? WEAPONS[this.state.active] : null;
  }

  get reloading(): boolean {
    return this.reloadEndsAt > 0;
  }

  /** The HUD slice. Melee shows no ammo row (undefined). */
  hud(): HudWeapon | undefined {
    const d = this.activeDef;
    if (!d || !d.ammo) return undefined;
    return {
      id: d.id,
      ammo: this.state.clip[d.id],
      reserve: this.state.reserve[d.ammo],
      reloading: this.reloading,
    };
  }

  /** What `buildUserCmd` resolves wheel / next / previous switches against. */
  weaponContext(): WeaponContextLike {
    const slots = WEAPON_IDS.filter((i) => this.state.owned[i])
      .map((i) => WEAPONS[i].slot)
      .sort((a, b) => a - b);
    const d = this.activeDef;
    const l = this.state.last ? WEAPONS[this.state.last].slot : 0;
    return { slots, active: d ? d.slot : 0, last: l };
  }

  /** The view model for this frame; `play` is consumed. */
  viewFrame(): { mdl: string; visible: boolean; play?: string[] } | null {
    const d = this.activeDef;
    if (!d) return null;
    const play = this.pendingPlay ? [this.pendingPlay] : undefined;
    this.pendingPlay = null;
    return { mdl: d.viewModel, visible: true, play };
  }

  // ─── Inventory ────────────────────────────────────────────────────────────

  /** Grants a weapon (a pickup's effect). Returns false when nothing was taken. */
  pickupWeapon(id: WeaponId): boolean {
    const d = WEAPONS[id];
    const s = this.state;
    if (s.owned[id]) {
      if (!d.ammo || s.reserve[d.ammo] >= RESERVE_MAX[d.ammo]) return false;
      s.reserve[d.ammo] = Math.min(RESERVE_MAX[d.ammo], s.reserve[d.ammo] + d.pickupReserve);
    } else {
      s.owned[id] = true;
      s.clip[id] = d.clip;
      if (d.ammo)
        s.reserve[d.ammo] = Math.min(RESERVE_MAX[d.ammo], s.reserve[d.ammo] + d.pickupReserve);
      if (!s.active) this.equip(id);
    }
    this.emit({ type: 'pickup', weapon: id, ammo: null });
    harmonicSounds.sfx('pickup', { entity: this.world.player.id });
    return true;
  }

  /** Adds reserve ammo (an ammo pickup). False when the pool is full. */
  addAmmo(type: AmmoType, amount = AMMO_PICKUP_AMOUNT[type]): boolean {
    const s = this.state;
    if (s.reserve[type] >= RESERVE_MAX[type]) return false;
    s.reserve[type] = Math.min(RESERVE_MAX[type], s.reserve[type] + amount);
    this.emit({ type: 'pickup', weapon: null, ammo: type });
    harmonicSounds.sfx('pickup', { entity: this.world.player.id });
    return true;
  }

  /** Test/script helper: grant a weapon with a full clip and `reserve` rounds. */
  give(id: WeaponId, reserve?: number): void {
    const d = WEAPONS[id];
    this.state.owned[id] = true;
    this.state.clip[id] = d.clip;
    if (d.ammo && reserve !== undefined)
      this.state.reserve[d.ammo] = Math.min(RESERVE_MAX[d.ammo], reserve);
    if (!this.state.active) this.equip(id);
  }

  /** Switch to the weapon in `slot` (1-based). False when not owned or already active. */
  select(slot: number): boolean {
    const d = weaponBySlot(slot);
    if (!d || !this.state.owned[d.id] || this.state.active === d.id) return false;
    this.equip(d.id);
    return true;
  }

  private equip(id: WeaponId): void {
    const s = this.state;
    this.cancelReload();
    this.setAds(false);
    if (s.active && s.active !== id) s.last = s.active;
    s.active = id;
    this.nextAttackAt = this.world.curtime + WEAPONS[id].drawTime;
    this.pendingPlay = 'ACT_VM_DRAW';
    this.emit({ type: 'draw', weapon: id });
  }

  // ─── Per tick ─────────────────────────────────────────────────────────────

  update(cmd: SpUserCmd): void {
    const w = this.world;
    const p = w.player;
    if (p.dead) {
      if (!this.wasDead) {
        this.wasDead = true;
        this.cancelReload();
        this.setAds(false);
      }
      this.prevButtons = cmd.buttons;
      return;
    }
    if (this.wasDead) {
      this.wasDead = false;
      this.restoreFromCheckpoint();
    }
    this.syncCheckpoint();

    const now = w.curtime;
    if (this.reloadEndsAt > 0 && now + EPS >= this.reloadEndsAt) this.finishReload();
    if (cmd.weaponSelect > 0) this.select(cmd.weaponSelect);

    const btn = cmd.buttons;
    const edge = btn & ~this.prevButtons;
    this.prevButtons = btn;
    const d = this.activeDef;
    if (!d) return;

    if (edge & IN_RELOAD) this.startReload();
    this.setAds(!!(btn & IN_ATTACK2) && d.adsFov > 0 && !this.reloading);
    if (btn & IN_ATTACK && (d.auto || edge & IN_ATTACK)) this.tryFire(d);
  }

  /** End of tick: capture the inventory when the world took a new checkpoint. */
  afterTick(): void {
    if (!this.world.player.dead) this.syncCheckpoint();
  }

  private syncCheckpoint(): void {
    const cp = this.world.checkpoint;
    if (cp === this.cpRef) return;
    this.cpRef = cp;
    this.cpState = cloneState(this.state);
  }

  private restoreFromCheckpoint(): void {
    this.state = cloneState(this.cpState);
    this.reloadEndsAt = 0;
    this.nextAttackAt = 0;
    this.pendingPlay = null;
    if (this.state.active) this.equip(this.state.active);
  }

  // ─── Firing ───────────────────────────────────────────────────────────────

  private tryFire(d: WeaponDef): void {
    const now = this.world.curtime;
    if (this.reloading || now + EPS < this.nextAttackAt) return;
    const s = this.state;
    const p = this.world.player;
    if (d.ammo && s.clip[d.id] <= 0) {
      this.nextAttackAt = now + EMPTY_CLICK_INTERVAL;
      this.emit({ type: 'empty', weapon: d.id });
      if (d.sounds.empty) harmonicSounds.sfx(d.sounds.empty, { entity: p.id });
      if (s.reserve[d.ammo] > 0) this.startReload();
      return;
    }
    if (d.ammo) s.clip[d.id]--;
    this.nextAttackAt = now + d.fireInterval;
    const shot = s.shots++;
    p.eyePosition(eye);
    angleVectors(p.eyeAngles, fwd, right, up);
    const off = spreadOffset(shot, d.spread * (this.ads ? d.adsSpreadScale : 1));
    aim.x = fwd.x + right.x * off.x + up.x * off.y;
    aim.y = fwd.y + right.y * off.x + up.y * off.y;
    aim.z = fwd.z + right.z * off.x + up.z * off.y;
    normalize(aim);
    let hit: HitResult;
    if (d.kind === 'melee') {
      hit = this.combat.melee(eye, aim, d.range, d.damage, p);
      const e = hit.entity;
      if (e && e.classname === 'func_breakable' && !e.removed && PRYBAR_PANEL_DAMAGE > d.damage) {
        this.combat.applyDamage(e, {
          amount: PRYBAR_PANEL_DAMAGE - d.damage,
          type: 'melee',
          attacker: p,
          position: hit.position,
          direction: aim,
        });
      }
      harmonicSounds.sfx(d.sounds.fire, { entity: p.id });
      if (hit.kind !== 'none') harmonicSounds.sfx('melee.hit', { pos: hit.position });
    } else {
      hit = this.combat.hitscan(eye, aim, d.range, d.damage, p, 'bullet');
      harmonicSounds.sfx(d.sounds.fire, { entity: p.id });
      if (hit.kind === 'world') harmonicSounds.sfx(impactSound(hit.surface), { pos: hit.position });
    }
    this.pendingPlay = 'ACT_VM_PRIMARYATTACK';
    this.emit({ type: 'fire', weapon: d.id, hit });
  }

  // ─── Reload and aim ───────────────────────────────────────────────────────

  startReload(): boolean {
    const d = this.activeDef;
    const s = this.state;
    if (!d || !d.ammo || this.reloading || s.clip[d.id] >= d.clip || s.reserve[d.ammo] <= 0)
      return false;
    this.setAds(false);
    this.reloadEndsAt = this.world.curtime + d.reloadTime;
    this.pendingPlay = 'ACT_VM_RELOAD';
    if (d.sounds.reload) harmonicSounds.sfx(d.sounds.reload, { entity: this.world.player.id });
    this.emit({ type: 'reload', weapon: d.id });
    return true;
  }

  private cancelReload(): void {
    this.reloadEndsAt = 0;
  }

  private finishReload(): void {
    const d = this.activeDef;
    this.reloadEndsAt = 0;
    if (!d || !d.ammo) return;
    const s = this.state;
    const n = Math.min(d.clip - s.clip[d.id], s.reserve[d.ammo]);
    s.clip[d.id] += n;
    s.reserve[d.ammo] -= n;
    this.emit({ type: 'reloaded', weapon: d.id });
  }

  private setAds(on: boolean): void {
    if (on === this.ads) return;
    this.ads = on;
    const d = this.activeDef;
    const fov = on && d ? d.adsFov : 0;
    this.world.emit({ type: 'zoom', fov, rate: d ? d.adsRate || 0.15 : 0.15 });
    this.emit({ type: 'ads', on, fov });
  }

  /** The zoom FOV in force (0 = the player's own). */
  get zoomFov(): number {
    const d = this.activeDef;
    return this.ads && d ? d.adsFov : 0;
  }
}
