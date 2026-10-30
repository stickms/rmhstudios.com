/**
 * Every CS:GO firearm, data-driven (pistols, SMGs, rifles, shotguns, machine guns, snipers): the
 * item's numbers decide the cycle, automatic or semi-automatic fire, the clip and reserve, the reload
 * (whole clip, or shell by shell for the Nova / XM1014 / Sawed-Off), the inaccuracy model, the spray
 * pattern and the scope (zoom levels, scoped speed and accuracy, the AWP's rescope after its bolt).
 *
 * Runs identically on the host and on a predicting client: the shot's offsets come from the command's
 * seeded stream (`world.sharedRandom(cmd.randomSeed)`), the recoil from the weapon's generated pattern
 * and the networked recoil index, the inaccuracy from the networked penalty.
 */

import { IN_ATTACK, IN_ATTACK2, IN_RELOAD, TICK_INTERVAL } from '../../tf2-game/core/constants';
import type { UserCmd } from '../../tf2-game/core/types';
import { length2D, vec3 } from '../../tf2-game/core/vec';
import { PLAYERANIMEVENT_ATTACK_PRIMARY, PLAYERANIMEVENT_RELOAD } from '../../tf2-game/sim/player';
import {
  csInaccuracy,
  csShotOffsets,
  inaccuracyTable,
  kickAimPunch,
  recoilTableFor,
  recoverPenalty,
  WEAPON_RECOIL_SCALE,
} from '../combat';
import {
  CsWeapon,
  RELOAD_IDLE,
  RELOAD_SHELLS,
  RELOAD_START,
  VM_FIRE,
  VM_IDLE,
  VM_RELOAD,
  VM_SECONDARY,
} from './base';
import { fireCsBullets } from './bullets';

/** Seconds between zoom changes (community measurement of the scope toggle). */
export const ZOOM_TOGGLE_DELAY = 0.3;
/** A sniper with a cycle this long is a bolt action: it unscopes to cycle and rescopes after. */
export const BOLT_ACTION_CYCLE = 1.0;
/** Shell-by-shell reload: the first shell after this lead-in (community measurement). */
export const SHELL_RELOAD_START = 0.45;
/** An empty gun clicks and waits this long. */
export const DRY_FIRE_DELAY = 0.2;

const MAX_PELLETS = 16;
const angles = vec3();

export class CsGun extends CsWeapon {
  /** The last shot's pellet directions (3 per pellet), host and prediction alike (tests, effects). */
  readonly lastShotDirs = new Float64Array(MAX_PELLETS * 3);
  /** The last shot's inaccuracy (thousandths of a radian), for the crosshair. */
  lastInaccuracy = 0;
  private readonly offsets = new Float64Array(MAX_PELLETS * 2);

  /**
   * The inaccuracy the next shot would have (thousandths of a radian; the crosshair's gap). Just after
   * scoping in, the scoped accuracy blends in over the level's `zoom time` (a quick-scope is less
   * accurate than a settled one, as in CS:GO).
   */
  currentInaccuracy(): number {
    const p = this.cs;
    if (!p) return 0;
    const state = {
      onGround: p.onGround,
      ducked: p.move.ducked,
      speed: length2D(p.velocity),
      weaponSpeed: this.maxSpeed(),
      zoomed: this.zoomLevel > 0,
      penalty: this.accuracyPenalty,
    };
    const v = csInaccuracy(this.info, state);
    if (this.zoomLevel <= 0) return v;
    const settle = this.info.zoomTime[Math.min(2, this.zoomLevel)] ?? 0.1;
    const since = this.curtime - this.zoomChangedAt;
    if (settle <= 0 || since >= settle) return v;
    const unscoped = csInaccuracy(this.info, { ...state, zoomed: false });
    return unscoped + (v - unscoped) * Math.max(0, since / settle);
  }

  itemPostFrame(cmd: UserCmd): void {
    const owner = this.cs;
    if (!owner) return;
    const t = this.curtime;
    const info = this.info;

    // Recovery: the fire penalty decays; after a cycle without a shot the spray resets toward its start.
    this.accuracyPenalty = recoverPenalty(
      this.accuracyPenalty,
      info,
      owner.move.ducked,
      TICK_INTERVAL,
    );
    if (t - this.lastFireTime > info.cycleTime * 1.5 && this.recoilIndex > 0) {
      const rec = Math.max(0.05, owner.move.ducked ? info.recoveryCrouch : info.recoveryStand);
      this.recoilIndex = Math.max(0, this.recoilIndex - (TICK_INTERVAL / rec) * 4);
    }

    // Reload completion.
    if (this.inReload && !info.reloadsSingly && t >= this.nextPrimaryAttack) this.finishReload();
    if (info.reloadsSingly && this.reloadMode !== RELOAD_IDLE) this.reloadShellFrame(cmd, t);

    // The AWP rescopes after its bolt.
    if (this.resumeZoom > 0 && t >= this.nextPrimaryAttack) {
      this.zoomLevel = this.resumeZoom;
      this.resumeZoom = 0;
      this.zoomChangedAt = t;
    }

    const buttons = cmd.buttons;
    if (!(buttons & IN_ATTACK)) this.fired = false;

    // Attack2: the scope.
    if (
      buttons & IN_ATTACK2 &&
      info.zoomLevels > 0 &&
      t >= this.nextSecondaryAttack &&
      !this.inReload
    ) {
      this.zoomLevel = (this.zoomLevel + 1) % (info.zoomLevels + 1);
      this.resumeZoom = 0;
      this.zoomChangedAt = t;
      this.nextSecondaryAttack = t + ZOOM_TOGGLE_DELAY;
      this.setActivity(VM_SECONDARY);
      if (owner.world.isServer)
        owner.world.emitSound('Default.Zoom', {
          entity: owner.id,
          predictedBy: owner.isBot ? undefined : owner.id,
        });
    }

    if (
      buttons & IN_ATTACK &&
      t >= this.nextPrimaryAttack &&
      !(this.fired && !info.fullAuto) &&
      !owner.cannotAttack()
    ) {
      if (this.clip <= 0) {
        if (this.reserve > 0) this.startReload(t);
        else {
          this.nextPrimaryAttack = t + DRY_FIRE_DELAY;
          this.fired = true;
          this.sound('Weapon.DryFire');
        }
      } else {
        if (info.reloadsSingly && this.reloadMode !== RELOAD_IDLE) this.reloadMode = RELOAD_IDLE;
        this.shoot(cmd, t);
      }
    } else if (
      buttons & IN_RELOAD &&
      !this.inReload &&
      this.reloadMode === RELOAD_IDLE &&
      this.clip < info.clipSize &&
      this.reserve > 0 &&
      t >= this.nextPrimaryAttack
    ) {
      this.startReload(t);
    } else if (
      !(buttons & (IN_ATTACK | IN_ATTACK2 | IN_RELOAD)) &&
      !this.inReload &&
      t >= this.timeWeaponIdle &&
      this.vmActivity !== VM_IDLE
    ) {
      this.setActivity(VM_IDLE);
      this.timeWeaponIdle = t + 5;
    }
  }

  private shoot(cmd: UserCmd, t: number): void {
    const owner = this.cs;
    const info = this.info;
    const world = this.world;
    const zoomed = this.zoomLevel > 0;
    const inaccuracy = this.currentInaccuracy();
    this.lastInaccuracy = inaccuracy;
    const spread = zoomed ? info.spreadAlt : info.spread;
    const pellets = Math.min(MAX_PELLETS, info.bullets);
    csShotOffsets(world.sharedRandom(cmd.randomSeed), inaccuracy, spread, pellets, this.offsets);

    // The view plus the aim punch (weapon_recoil_scale × the punch the view shows less of).
    angles.x = cmd.viewAngles.x + owner.aimPunch.x * WEAPON_RECOIL_SCALE;
    angles.y = cmd.viewAngles.y + owner.aimPunch.y * WEAPON_RECOIL_SCALE;
    angles.z = 0;
    const eye = owner.eyePosition(vec3());
    fireCsBullets(
      world,
      owner,
      info,
      eye,
      angles,
      this.offsets,
      pellets,
      cmd.tickCount,
      this.lastShotDirs,
    );

    this.clip--;
    this.lastFireTime = t;
    this.fired = true;
    this.nextPrimaryAttack = t + (zoomed ? info.cycleTimeAlt : info.cycleTime);
    this.nextSecondaryAttack = Math.max(this.nextSecondaryAttack, t + 0.1);
    this.timeWeaponIdle = t + 2;
    this.accuracyPenalty += inaccuracyTable(info, zoomed).fire;
    kickAimPunch(owner.aimPunch, recoilTableFor(info, zoomed), this.recoilIndex);
    this.recoilIndex += 1;
    if (zoomed && info.cycleTime >= BOLT_ACTION_CYCLE) {
      this.resumeZoom = this.zoomLevel;
      this.zoomLevel = 0;
    }
    owner.onFiredWeapon();
    this.setActivity(VM_FIRE);
    owner.doAnimationEvent(PLAYERANIMEVENT_ATTACK_PRIMARY);
    this.sound(info.shotSound);
    if (world.isServer) {
      world.emitEffect({
        kind: 'muzzleflash',
        pos: eye,
        entity: owner.id,
        attachment: 'muzzle_flash',
        notTo: owner.isBot ? undefined : owner.id,
      });
      owner.makeNoise(1800);
    }
  }

  private startReload(t: number): void {
    const info = this.info;
    this.zoomLevel = 0;
    this.resumeZoom = 0;
    if (info.reloadsSingly) {
      this.reloadMode = RELOAD_START;
      this.timeWeaponIdle = t + SHELL_RELOAD_START;
    } else {
      this.inReload = true;
      this.nextPrimaryAttack = t + info.reloadTime;
      this.nextSecondaryAttack = t + info.reloadTime;
      this.timeWeaponIdle = t + info.reloadTime;
    }
    this.setActivity(VM_RELOAD);
    this.cs.doAnimationEvent(PLAYERANIMEVENT_RELOAD);
    this.sound(`${info.shotSound.split('.')[0] || 'Weapon'}.Reload`);
  }

  private finishReload(): void {
    const take = Math.min(this.info.clipSize - this.clip, this.reserve);
    this.clip += take;
    this.reserve -= take;
    this.inReload = false;
  }

  private reloadShellFrame(cmd: UserCmd, t: number): void {
    if (this.timeWeaponIdle > t) return;
    if (
      this.clip >= this.info.clipSize ||
      this.reserve <= 0 ||
      (cmd.buttons & IN_ATTACK && this.clip > 0)
    ) {
      this.reloadMode = RELOAD_IDLE;
      this.setActivity(VM_IDLE);
      return;
    }
    if (this.reloadMode === RELOAD_START) this.reloadMode = RELOAD_SHELLS;
    else {
      this.clip++;
      this.reserve--;
    }
    this.timeWeaponIdle = t + this.info.reloadTime;
    this.nextPrimaryAttack = Math.max(this.nextPrimaryAttack, t);
  }

  override holster(next: Parameters<CsWeapon['holster']>[0]): boolean {
    this.reloadMode = RELOAD_IDLE;
    return super.holster(next);
  }
}
