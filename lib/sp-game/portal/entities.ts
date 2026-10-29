/**
 * Portal's entities, clean-room from the Valve Developer Community entity
 * documentation and the game's observable behaviour:
 *
 * - prop_portal: PortalTwo (orange), Activated, LinkageGroupID;
 *   SetActivatedState, Fizzle, NewLocation; OnPlacedSuccessfully and the
 *   teleport outputs (fired by the service).
 * - weapon_portalgun: the pickup; CanFirePortal1/2 decide which shots the
 *   player gets (an upgrade keeps what the player already had);
 *   OnPlayerPickup; FirePortal1/2 fire from the gun entity itself.
 * - trigger_portal_cleanser (the fizzler): closes the player's gun portals
 *   when the player passes, dissolves physics objects (OnDissolve,
 *   OnDissolveBox for cubes), OnFizzle.
 * - func_portal_detector: OnStartTouchPortal / Portal1 / Portal2 /
 *   LinkedPortal and the matching OnEndTouch outputs for open portals inside it.
 * - func_noportal_volume, func_portal_bumper: placement refusal and bumping.
 * - point_energy_ball_launcher / prop_energy_ball: bouncing energy balls that
 *   pass through portals, kill the player, and are caught by triggers
 *   filtered with filter_combineball_type.
 */

import { angleVectors, copy, vec3, type Vec3 } from '../../tf2-game/core/vec';
import { emptyTrace, WORLD_ENTITY } from '../../tf2-game/core/types';
import { MASK_SOLID } from '../../tf2-game/core/constants';
import type { Entity } from '../../tf2-game/sim/entity';
import { MOVETYPE_VPHYSICS, SOLID_NONE } from '../../tf2-game/sim/entity';
import { BaseFilter, BaseTrigger } from '../../tf2-game/sim/triggers';
import { registerSp, SpEntity } from '../entities/base';
import { PropPhysics } from '../entities/props';
import { FuncBrush } from '../entities/brush';
import { SpTriggerMultiple } from '../entities/triggers';
import { DMG_DISSOLVE } from '../constants';
import { frameFromAngles, transformPoint, transformVector, type PortalFrame } from './portal-math';
import type { PortalEntity, PortalVolume } from './portals';
import type { SpWorld } from '../world/sp-world';

// ─── prop_portal ────────────────────────────────────────────────────────────

export class PropPortal extends SpEntity implements PortalEntity {
  which: 0 | 1 = 0;
  linkage = 0;
  activated = false;
  frame: PortalFrame = frameFromAngles(vec3(), vec3());
  fromGun = false;
  openedAt = 0;
  private startOpen = false;

  override spawn(): void {
    super.spawn();
    if (this.kv) {
      this.which = this.kvBool('PortalTwo') ? 1 : 0;
      this.linkage = this.kvNumber('LinkageGroupID', 0);
      this.startOpen = this.kvBool('Activated');
    }
    this.frame = frameFromAngles(this.origin, this.angles);
    this.sp.portals.register(this);
    this.extra = { kind: 'prop_portal' };
  }

  override activate(): void {
    super.activate();
    if (this.startOpen) this.sp.portals.open(this);
  }

  /** NewLocation / placement: moves the rectangle. */
  place(origin: Vec3, angles: Vec3): void {
    copy(this.origin, origin);
    copy(this.angles, angles);
    this.frame = frameFromAngles(origin, angles);
    if (this.activated) this.sp.portals.refresh();
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const svc = this.sp.portals;
    switch (input.toLowerCase()) {
      case 'setactivatedstate':
        if ((parseInt(value, 10) || 0) !== 0) {
          this.frame = frameFromAngles(this.origin, this.angles);
          svc.open(this);
        } else svc.close(this, false);
        return true;
      case 'fizzle':
        svc.close(this, true);
        return true;
      case 'newlocation': {
        const p = value.trim().split(/\s+/).map(Number);
        if (p.length >= 6) this.place(vec3(p[0], p[1], p[2]), vec3(p[3], p[4], p[5]));
        return true;
      }
      case 'setlinkagegroupid':
        this.linkage = parseInt(value, 10) || 0;
        svc.refresh();
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }

  override onRemove(): void {
    this.activated = false;
    this.sp.portals.unregister(this);
  }

  registerAgain(): void {
    this.sp.portals.register(this);
  }

  afterRestore(): void {
    this.frame = frameFromAngles(this.origin, this.angles);
  }
}

// ─── weapon_portalgun ───────────────────────────────────────────────────────

export class WeaponPortalgun extends SpEntity {
  disabled = false;

  override spawn(): void {
    if (!this.model) this.model = 'models/weapons/w_portalgun.mdl';
    super.spawn();
    this.solid = SOLID_NONE;
    this.mins.x = this.mins.y = this.mins.z = -16;
    this.maxs.x = this.maxs.y = this.maxs.z = 16;
    this.sp.registerTrigger(this);
  }

  wantsToucher(other: Entity): boolean {
    return other.isPlayer();
  }

  touchesBox(mins: Vec3, maxs: Vec3): boolean {
    return (
      mins.x < this.origin.x + this.maxs.x &&
      maxs.x > this.origin.x + this.mins.x &&
      mins.y < this.origin.y + this.maxs.y &&
      maxs.y > this.origin.y + this.mins.y &&
      mins.z < this.origin.z + this.maxs.z &&
      maxs.z > this.origin.z + this.mins.z
    );
  }

  override startTouch(other: Entity): void {
    if (this.parent !== -1 && this.kvString('parentname')) return; // mounted on a mechanism: not yet
    this.give(other);
  }

  override isUsable(): boolean {
    return true;
  }

  override use(activator: Entity): boolean {
    this.give(activator);
    return true;
  }

  /** The player takes the gun. */
  give(other: Entity): void {
    const p = this.sp.player;
    if (other !== p || this.removed) return;
    const c1 = this.kvBool('CanFirePortal1', true);
    const c2 = this.kvBool('CanFirePortal2', false);
    if (p.portalgun) {
      p.portalgun.canFire1 ||= c1;
      p.portalgun.canFire2 ||= c2;
    } else p.portalgun = { canFire1: c1, canFire2: c2, nextFire: 0 };
    this.sp.emit({ type: 'pickup', entity: this.id, item: 'weapon_portalgun' });
    this.sp.emitSound('Weapon_Portalgun.powerup', { entity: p.id });
    this.fireOutput('OnPlayerPickup', p);
    this.world.remove(this);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    const lc = input.toLowerCase();
    if (lc === 'fireportal1' || lc === 'fireportal2') {
      const which: 0 | 1 = lc === 'fireportal1' ? 0 : 1;
      const f = vec3();
      angleVectors(this.angles, f);
      const end = vec3(this.origin.x + f.x * 8192, this.origin.y + f.y * 8192, this.origin.z + f.z * 8192);
      const res = this.sp.portals.traceThroughPortals(this.origin, end, 0x1 | 0x2 | 0x8 | 0x4000, (id) => id !== this.id && (this.sp.entity(id)?.bspModel ?? 0) > 0);
      this.sp.portals.placeFromTrace(which, 0, res.trace, res.dir);
      return true;
    }
    if (lc === 'chargeportal1' || lc === 'chargeportal2') {
      this.extra = { ...(this.extra ?? {}), charging: lc === 'chargeportal1' ? 1 : 2 };
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }

  override onRemove(): void {
    this.sp.unregisterTrigger(this);
  }
}

// ─── trigger_portal_cleanser ────────────────────────────────────────────────

export class TriggerPortalCleanser extends SpTriggerMultiple {
  /** Renderer state (the field's shimmer is drawn while enabled). */
  extra: Record<string, unknown> | null = null;

  private get sp(): SpWorld {
    return this.world as unknown as SpWorld;
  }

  override spawn(): void {
    super.spawn();
    this.extra = { kind: 'trigger_portal_cleanser', on: !this.disabled };
  }

  override startTouch(other: Entity): void {
    super.startTouch(other);
    if (this.disabled) return;
    if (other.isPlayer()) {
      if (this.sp.portals.fizzleGunPortals() > 0) {
        this.fireOutput('OnFizzle', other);
        this.sp.emitSound('Portal.FizzlerShimmy', { entity: other.id });
      }
      return;
    }
    if (other instanceof PropPhysics && !other.dissolving) {
      other.dissolve();
      this.fireOutput('OnDissolve', other);
      if (/metal_box|cube/i.test(other.model)) this.fireOutput('OnDissolveBox', other);
    }
  }

  override touch(_other: Entity): void {}

  override enable(): void {
    super.enable();
    if (this.extra) this.extra.on = true;
  }

  override disable(): void {
    super.disable();
    if (this.extra) this.extra.on = false;
  }
}

// ─── func_portal_detector ───────────────────────────────────────────────────

export class FuncPortalDetector extends SpEntity {
  disabled = false;
  private touching = new Set<number>();

  override spawn(): void {
    super.spawn();
    this.disabled = this.kvBool('StartDisabled');
    this.solidFlags |= 0x4;
    this.sp.setBrushSolid(this, false);
  }

  simulate(): void {
    if (this.disabled) return;
    const svc = this.sp.portals;
    const linkage = this.kvNumber('LinkageGroupID', 0);
    const now = svc.portalsInVolume((p) => this.sp.pointInBrushEntity(this, p), linkage);
    const ids = new Set(now.map((p) => p.id));
    for (const p of now) {
      if (this.touching.has(p.id)) continue;
      this.fireOutput('OnStartTouchPortal', p);
      this.fireOutput(p.which === 0 ? 'OnStartTouchPortal1' : 'OnStartTouchPortal2', p);
      if (svc.isLinked(p)) this.fireOutput('OnStartTouchLinkedPortal', p);
      if (now.length === 2 && now[0].which !== now[1].which) this.fireOutput('OnStartTouchBothLinkedPortals', p);
    }
    for (const id of this.touching) {
      if (ids.has(id)) continue;
      const p = this.sp.entity(id);
      this.fireOutput('OnEndTouchPortal', p);
      if (p) this.fireOutput((p as PropPortal).which === 0 ? 'OnEndTouchPortal1' : 'OnEndTouchPortal2', p);
    }
    this.touching = ids;
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        this.disabled = false;
        return true;
      case 'disable':
        this.disabled = true;
        this.touching.clear();
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── Placement volumes ──────────────────────────────────────────────────────

export class FuncNoPortalVolume extends SpEntity implements PortalVolume {
  inactive = false;

  override spawn(): void {
    super.spawn();
    this.inactive = (this.spawnflags & 1) !== 0;
    this.sp.setBrushSolid(this, false);
    this.sp.portals.registerVolume(this, this.classname === 'func_portal_bumper');
  }

  activeVolume(): boolean {
    return !this.inactive;
  }

  pointIsWithin(p: Vec3): boolean {
    return this.sp.pointInBrushEntity(this, p);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'activate':
        this.inactive = false;
        return true;
      case 'deactivate':
        this.inactive = true;
        return true;
      case 'toggle':
        this.inactive = !this.inactive;
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

// ─── Energy balls ───────────────────────────────────────────────────────────

/** filter_combineball_type: passes energy / combine balls. */
export class FilterCombineBallType extends BaseFilter {
  protected override passesFilterImpl(_caller: Entity | null, entity: Entity): boolean {
    return entity.classname === 'prop_energy_ball' || entity.classname === 'prop_combine_ball';
  }
}

export class PropEnergyBall extends SpEntity {
  radius = 12;
  dieAt = 0;
  minLifeAfterPortal = 6;
  launcher: PointEnergyBallLauncher | null = null;
  private readonly hullMins = vec3();
  private readonly hullMaxs = vec3();

  override spawn(): void {
    if (!this.model) this.model = 'models/effects/combineball.mdl';
    super.spawn();
    this.moveType = MOVETYPE_VPHYSICS;
    this.solid = SOLID_NONE;
    this.setRadius(this.radius);
    this.extra = { kind: 'prop_energy_ball', radius: this.radius };
  }

  setRadius(r: number): void {
    this.radius = r;
    this.mins.x = this.mins.y = this.mins.z = -r;
    this.maxs.x = this.maxs.y = this.maxs.z = r;
    // Traces use a smaller box so balls slip into corners like the sphere does.
    const t = r * 0.5;
    this.hullMins.x = this.hullMins.y = this.hullMins.z = -t;
    this.hullMaxs.x = this.hullMaxs.y = this.hullMaxs.z = t;
    if (this.extra) this.extra.radius = r;
  }

  touchCandidate(): boolean {
    return true;
  }

  private blocksBall = (id: number): boolean => {
    if (id === this.id || id === this.sp.player.id) return false;
    const e = this.sp.entity(id);
    if (!e) return true;
    if (e instanceof FuncBrush) return e.blocksClass('prop_energy_ball');
    if (e.classname === 'prop_energy_ball') return false;
    return true;
  };

  simulate(): void {
    const w = this.sp;
    if (w.curtime >= this.dieAt) {
      this.explode();
      return;
    }
    let remaining = w.tick;
    let guard = 0;
    while (remaining > 1e-6 && guard++ < 4) {
      const start = vec3(this.origin.x, this.origin.y, this.origin.z);
      const end = vec3(start.x + this.velocity.x * remaining, start.y + this.velocity.y * remaining, start.z + this.velocity.z * remaining);
      const cross = w.portals.crossing(start, end);
      const tr = emptyTrace();
      w.collision.traceHull(start, end, this.hullMins, this.hullMaxs, MASK_SOLID, this.blocksBall, tr);
      if (cross && cross.t <= tr.fraction + 0.02) {
        const p = vec3(start.x + (end.x - start.x) * cross.t, start.y + (end.y - start.y) * cross.t, start.z + (end.z - start.z) * cross.t);
        transformPoint(cross.passage.transform, p, this.origin);
        transformVector(cross.passage.transform, this.velocity, this.velocity);
        this.dieAt = Math.max(this.dieAt, w.curtime + this.minLifeAfterPortal);
        cross.passage.portal.fireOutput('OnEntityTeleportFromMe', this);
        cross.passage.partner.fireOutput('OnEntityTeleportToMe', this);
        remaining *= 1 - cross.t;
        continue;
      }
      if (tr.fraction >= 1 || tr.startSolid) {
        copy(this.origin, end);
        break;
      }
      copy(this.origin, tr.endPos);
      const n = tr.plane.normal;
      const vn = this.velocity.x * n.x + this.velocity.y * n.y + this.velocity.z * n.z;
      this.velocity.x -= 2 * vn * n.x;
      this.velocity.y -= 2 * vn * n.y;
      this.velocity.z -= 2 * vn * n.z;
      w.emit({ type: 'effect', kind: 'energy_ball_bounce', pos: { ...tr.endPos }, normal: { ...n }, entity: this.id });
      w.emitSound('EnergyBall.Impact', { pos: tr.endPos, quiet: true });
      if (tr.entity !== WORLD_ENTITY && tr.entity > 0) {
        const b = w.bodiesByEntity.get(tr.entity);
        b?.applyImpulseAt({ x: -n.x * 200, y: -n.y * 200, z: -n.z * 200 }, tr.endPos);
      }
      remaining *= 1 - tr.fraction;
    }
    // The player dies on contact.
    const p = w.player;
    if (!p.dead) {
      const o = this.origin;
      const r = this.radius;
      if (
        o.x + r > p.origin.x + p.mins.x &&
        o.x - r < p.origin.x + p.maxs.x &&
        o.y + r > p.origin.y + p.mins.y &&
        o.y - r < p.origin.y + p.maxs.y &&
        o.z + r > p.origin.z + p.mins.z &&
        o.z - r < p.origin.z + p.maxs.z
      ) {
        w.damage(p, 1000, DMG_DISSOLVE, this, this);
        this.explode();
      }
    }
  }

  explode(): void {
    if (this.removed) return;
    this.sp.emit({ type: 'effect', kind: 'energy_ball_explode', pos: { ...this.origin }, entity: this.id });
    this.sp.emitSound('EnergyBall.Explosion', { pos: this.origin });
    this.world.remove(this);
  }

  override onRemove(): void {
    this.launcher?.ballGone(this);
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    if (input.toLowerCase() === 'explode') {
      this.explode();
      return true;
    }
    return super.acceptInput(input, value, activator, caller);
  }
}

export class PointEnergyBallLauncher extends SpEntity {
  disabled = true;
  readonly balls = new Set<PropEnergyBall>();

  override spawn(): void {
    super.spawn();
    this.disabled = (this.spawnflags & 4096) !== 0 || this.kvBool('StartDisabled');
  }

  override activate(): void {
    super.activate();
    if (!this.disabled) this.setThink(() => this.refill(), this.world.curtime + 0.1);
  }

  private refill(): void {
    if (this.disabled) return;
    const count = Math.max(1, this.kvNumber('ballcount', 1));
    if (this.balls.size < count) this.launch();
  }

  launch(): PropEnergyBall | null {
    const w = this.sp;
    const f = vec3();
    angleVectors(this.angles, f);
    const lo = this.kvNumber('minspeed', 200);
    const hi = this.kvNumber('maxspeed', lo);
    const speed = lo + (hi - lo) * w.random();
    const ball = w.spawnEntity('prop_energy_ball', (e) => {
      copy(e.origin, this.origin);
    }) as PropEnergyBall;
    ball.setRadius(this.kvNumber('ballradius', 12));
    ball.velocity.x = f.x * speed;
    ball.velocity.y = f.y * speed;
    ball.velocity.z = f.z * speed;
    ball.dieAt = w.curtime + (this.kvNumber('BallLifetime', 0) || 1e9);
    ball.minLifeAfterPortal = this.kvNumber('MinLifeAfterPortal', 6);
    ball.launcher = this;
    this.balls.add(ball);
    this.fireOutput('OnPostSpawnBall', ball);
    w.emitSound('EnergyBall.Launch', { pos: this.origin });
    return ball;
  }

  ballGone(b: PropEnergyBall): void {
    this.balls.delete(b);
    if (!this.disabled) this.setThink(() => this.refill(), this.world.curtime + this.kvNumber('ballrespawntime', 2));
  }

  override acceptInput(input: string, value: string, activator: Entity | null, caller: Entity | null): boolean {
    switch (input.toLowerCase()) {
      case 'enable':
        if (this.disabled) {
          this.disabled = false;
          this.setThink(() => this.refill(), this.world.curtime + 0.05);
        }
        return true;
      case 'disable':
        this.disabled = true;
        return true;
      case 'launchball':
        this.launch();
        return true;
      default:
        return super.acceptInput(input, value, activator, caller);
    }
  }
}

registerSp(PropPortal, 'prop_portal');
registerSp(WeaponPortalgun, 'weapon_portalgun');
registerSp(TriggerPortalCleanser, 'trigger_portal_cleanser');
registerSp(FuncPortalDetector, 'func_portal_detector');
registerSp(FuncNoPortalVolume, 'func_noportal_volume', 'func_portal_bumper');
registerSp(SpEntity, 'func_portal_volume', 'func_portal_orientation');
registerSp(FilterCombineBallType, 'filter_combineball_type');
registerSp(PropEnergyBall, 'prop_energy_ball');
registerSp(PointEnergyBallLauncher, 'point_energy_ball_launcher');

export type { BaseTrigger };
