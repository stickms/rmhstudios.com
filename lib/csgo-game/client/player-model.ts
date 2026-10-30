/**
 * A CS:GO player drawn with its team's published model (one per team, as the asset channel publishes
 * them: scripts/tf2-game/csgo-model-list.py) and the game's own layered animation:
 *
 *   - the main sequence is the movement blend (`move`, or the knife / grenade / C4 variant), its walk,
 *     run and crouch layers weighted by pose parameters and its direction by `move_yaw`;
 *   - gesture slot 0 is the weapon's aim matrix (`rifle_aim`, …), steered by `body_pitch` and blended
 *     between its stand / walk / run / crouch poses by the `aim_blend_*` parameters;
 *   - slot 1 plays the networked animation events (fire, reload, jump);
 *   - a dead player's body (corpse.ts) takes the game's death pose for the hit — head or body, standing
 *     or crouched (ACT_DIE_STAND_HEADSHOT …), turned to the shot by `death_yaw` — and goes limp into a
 *     ragdoll pushed by the bullet, on the head for a headshot; it lies CORPSE_TIME seconds, and fades at
 *     once when the player respawns.
 *
 * The weapon out is its world model bone-merged into the hand. Returns false from `update` while the
 * model is loading (or missing), so the caller can draw its stand-in figure.
 */
import { Matrix4 } from 'three';
import { isHeadshot } from '../../tf2-game/sim/damage';
import { LIFE_ALIVE } from '../../tf2-game/sim/entity';
import type { DeathEvent, EffectEvent } from '../../tf2-game/sim/events';
import { Corpse } from '../../tf2-game/render/entities/corpse';
import {
  PLAYERANIMEVENT_ATTACK_PRIMARY,
  PLAYERANIMEVENT_ATTACK_SECONDARY,
  PLAYERANIMEVENT_JUMP,
  PLAYERANIMEVENT_RELOAD,
} from '../../tf2-game/sim/player';
import type { EntityState, RenderContext } from '../../tf2-game/render/entities';
import { bool, LightProbe, num, stateOrigin, str } from '../../tf2-game/render/entities/common';
import { ModelInstance } from '../../tf2-game/render/entities/model-instance';
import { CS_TEAM_CT, CS_TEAM_T } from '../constants';
import { csWeapon, type CsWeaponCategory } from '../data/weapon-data';

/** Each team's player model: the classic factions' first model (de_dust2.kv names none). */
export const CS_PLAYER_MODELS: Record<number, string> = {
  [CS_TEAM_T]: 'models/player/custom_player/legacy/tm_phoenix.mdl',
  [CS_TEAM_CT]: 'models/player/custom_player/legacy/ctm_sas.mdl',
};

/** The animation set each weapon category uses (`<prefix>_aim`, `<prefix>_fire`, …). */
const ANIM_PREFIX: Record<CsWeaponCategory, string> = {
  pistol: 'pistol',
  smg: 'smg',
  rifle: 'rifle',
  sniper: 'sniper',
  shotgun: 'shotgun',
  machinegun: 'heavy',
  knife: 'knife',
  grenade: 'grenade',
  c4: 'c4',
  taser: 'pistol',
  equipment: 'pistol',
};

/** Speeds (units/s) where the walk blend is full and the run blend begins and is full. */
const WALK_SPEED = 130;
const RUN_SPEED = 250;
/** Seconds a body lies before fading (and the fade); CS:GO keeps them all round, this keeps the frame rate. */
const CORPSE_TIME = 10;
const CORPSE_FADE = 1;
/** Seconds of death pose before the ragdoll takes over. */
const DEATH_POSE_TIME = 0.2;
/** The head bone a headshot pushes. */
const HEAD_BONE = 'head_0';
const MAX_CORPSES = 2;
const AIM_SLOT = 0;
const ACTION_SLOT = 1;

interface V3 {
  x: number;
  y: number;
  z: number;
}

const tmpOrigin = { x: 0, y: 0, z: 0 };
const tmpAngles = { x: 0, y: 0, z: 0 };

export class CsPlayerModel {
  private inst: ModelInstance | null = null;
  private model = '';
  private weapon: ModelInstance | null = null;
  private weaponModel = '';
  private readonly probe = new LightProbe();
  private crouch = 0;
  private walk = 0;
  private run = 0;
  private lastEventSeq = -1;
  private aimSeq = '';
  private dead = false;
  private readonly corpses: Corpse[] = [];
  /** The kill notice and the bullet's push, until the body they belong to exists. */
  private headshot = false;
  private pendingPush: { force: V3; at: V3 | null } | null = null;
  private readonly velocity = { x: 0, y: 0, z: 0 };
  private readonly origin = { x: 0, y: 0, z: 0 };
  private yaw = 0;

  /** Draws the player; false while its model is not ready (the caller shows its stand-in). */
  update(s: EntityState, ctx: RenderContext, visible: boolean): boolean {
    const f = s.fields;
    const team = num(f, 'team');
    const alive = num(f, 'lifeState') === LIFE_ALIVE;
    for (let i = this.corpses.length - 1; i >= 0; i--) {
      if (this.corpses[i].update(ctx, this.probe)) continue;
      this.corpses[i].dispose();
      this.corpses.splice(i, 1);
    }
    if (!alive) {
      if (!this.dead) this.die(ctx);
      this.dead = true;
      return true;
    }
    if (this.dead) {
      this.dead = false;
      this.lastEventSeq = num(f, 'animEventSeq');
      // Respawned: the old body goes at once, so nobody takes it for them.
      for (const c of this.corpses) c.fadeSoon();
    }
    const model = CS_PLAYER_MODELS[team] ?? '';
    const inst = this.ensure(model, ctx);
    if (!inst?.animator) {
      this.hide();
      return false;
    }
    const a = inst.animator;
    inst.root.visible = visible;
    if (!visible) {
      if (this.weapon) this.weapon.root.visible = false;
      return true;
    }

    stateOrigin(s, tmpOrigin);
    const yaw = num(f, 'eyeYaw');
    const pitch = num(f, 'eyePitch');
    const info = csWeapon(str(f, 'weaponName'));
    const prefix = info ? ANIM_PREFIX[info.category] : 'pistol';
    this.velocity.x = num(f, 'vx');
    this.velocity.y = num(f, 'vy');
    this.velocity.z = num(f, 'vz');
    this.origin.x = tmpOrigin.x;
    this.origin.y = tmpOrigin.y;
    this.origin.z = tmpOrigin.z;
    this.yaw = yaw;

    const k = Math.min(1, ctx.dt * 10);
    const vx = num(f, 'vx');
    const vy = num(f, 'vy');
    const speed = Math.hypot(vx, vy);
    this.crouch += ((bool(f, 'ducked') ? 1 : 0) - this.crouch) * k;
    this.walk += (Math.min(1, speed / WALK_SPEED) - this.walk) * k;
    this.run +=
      (Math.max(0, Math.min(1, (speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED))) - this.run) * k;
    // Movement: the weapon family's blend, its direction relative to the body.
    const moveName =
      prefix === 'knife' || prefix === 'grenade' || prefix === 'c4' ? `move_${prefix}` : 'move';
    const move = a.set.seq(moveName) ?? a.set.seq('move');
    if (move && a.main?.seq !== move) a.setSequence(move, { fade: true });
    if (a.main) a.main.rate = speed > 1 ? Math.max(0.4, speed / RUN_SPEED) : 0.4;
    const moveYaw = speed > 1 ? angleDiff((Math.atan2(vy, vx) * 180) / Math.PI, yaw) : 0;
    a.setPoseParam('move_yaw', moveYaw);
    a.setPoseParam('move_blend_crouch', this.crouch);
    a.setPoseParam('move_blend_walk', this.walk * (1 - this.run));
    a.setPoseParam('move_blend_run', this.run);
    a.setPoseParam('speed', speed);
    a.setPoseParam('stand', 1 - this.crouch);
    // The aim matrix of the weapon out.
    const moving = Math.min(1, this.walk + this.run);
    a.setPoseParam('body_yaw', 0);
    a.setPoseParam('body_pitch', -pitch);
    a.setPoseParam('aim_blend_stand_idle', (1 - this.crouch) * (1 - moving));
    a.setPoseParam('aim_blend_stand_walk', (1 - this.crouch) * this.walk * (1 - this.run));
    a.setPoseParam('aim_blend_stand_run', (1 - this.crouch) * this.run);
    a.setPoseParam('aim_blend_crouch_idle', this.crouch * (1 - moving));
    a.setPoseParam('aim_blend_crouch_walk', this.crouch * moving);
    const aimName = `${prefix}_aim`;
    if (aimName !== this.aimSeq) {
      this.aimSeq = aimName;
      a.restartGesture(AIM_SLOT, a.set.seq(aimName) ?? null, aimName, false);
    }
    this.playEvent(a, f, prefix, speed > 1);

    tmpAngles.x = 0;
    tmpAngles.y = yaw;
    tmpAngles.z = 0;
    inst.place(tmpOrigin, tmpAngles, 1);
    this.probe.update(ctx, inst.uniforms, tmpOrigin, 40);
    inst.animate(ctx.dt);
    inst.applyPose();
    this.attachWeapon(inst, info?.worldModel ?? '', ctx);
    inst.updateMatrices();
    return true;
  }

  /** The kill notice: a headshot takes the head's death pose and push. */
  onDeath(ev: DeathEvent): void {
    this.headshot = isHeadshot(ev.customKill);
    const c = this.corpses[this.corpses.length - 1];
    if (c && c.age < 0.15 && c.animating && this.headshot)
      this.poseFor(c, true, this.pendingPush?.force ?? null);
  }

  /** The bullet's push on the body (the sim's ragdoll effect, less the player's own velocity). */
  onRagdoll(ev: EffectEvent): void {
    if (!ev.force) return;
    const push = {
      force: {
        x: ev.force.x - this.velocity.x,
        y: ev.force.y - this.velocity.y,
        z: ev.force.z - this.velocity.z,
      },
      at: ev.start ?? null,
    };
    const c = this.corpses[this.corpses.length - 1];
    if (c && c.age < 0.5) {
      if (c.animating) this.poseFor(c, this.headshot, push.force);
      c.setPush(push.force, push.at, this.headshot ? HEAD_BONE : undefined);
    } else this.pendingPush = push;
  }

  /** The live body becomes a corpse: the death pose for the hit, then a ragdoll. CS:GO drops the gun. */
  private die(ctx: RenderContext): void {
    const inst = this.inst;
    this.weapon?.dispose();
    this.weapon = null;
    this.weaponModel = '';
    this.inst = null;
    this.model = '';
    this.aimSeq = '';
    if (!inst?.root.visible) {
      inst?.dispose();
      this.headshot = false;
      this.pendingPush = null;
      return;
    }
    // The aim and action layers blend out under the death pose (laid in the action slot).
    inst.animator?.clearGestures(true);
    const corpse = new Corpse(inst, {
      origin: { ...this.origin },
      yaw: this.yaw,
      velocity: { ...this.velocity },
      lifetime: CORPSE_TIME,
      fade: CORPSE_FADE,
    });
    this.poseFor(corpse, this.headshot, this.pendingPush?.force ?? null);
    if (this.pendingPush)
      corpse.setPush(
        this.pendingPush.force,
        this.pendingPush.at,
        this.headshot ? HEAD_BONE : undefined,
      );
    this.pendingPush = null;
    this.headshot = false;
    this.corpses.push(corpse);
    while (this.corpses.length > MAX_CORPSES) this.corpses.shift()?.dispose();
    void ctx;
  }

  /** ACT_DIE_[STAND|CROUCH][_HEADSHOT], turned toward where the shot came from (`death_yaw`). */
  private poseFor(c: Corpse, headshot: boolean, force: V3 | null): void {
    const a = c.inst.animator;
    if (!a) return;
    const act = `ACT_DIE_${this.crouch > 0.5 ? 'CROUCH' : 'STAND'}${headshot ? '_HEADSHOT' : ''}`;
    const seq = a.set.selectWeightedSequence(act) ?? a.set.selectWeightedSequence('ACT_DIE_STAND');
    if (!seq) return;
    // The shot travels along the force: it came from the opposite way.
    if (force && Math.hypot(force.x, force.y) > 1e-3)
      a.setPoseParam(
        'death_yaw',
        angleDiff((Math.atan2(-force.y, -force.x) * 180) / Math.PI, this.yaw),
      );
    c.playDeath(seq, DEATH_POSE_TIME, true, ACTION_SLOT);
  }

  /** The networked animation event (fire, reload, jump) as a one-shot in the action slot. */
  private playEvent(a: NonNullable<ModelInstance['animator']>, f: EntityState['fields'], prefix: string, moving: boolean): void {
    const seqNo = num(f, 'animEventSeq');
    if (seqNo === this.lastEventSeq) return;
    const first = this.lastEventSeq < 0;
    this.lastEventSeq = seqNo;
    if (first) return;
    const crouch = this.crouch > 0.5 ? '_crouch' : '';
    let names: string[] = [];
    switch (num(f, 'animEvent')) {
      case PLAYERANIMEVENT_ATTACK_PRIMARY:
        names = [`${prefix}_fire${crouch}`, `${prefix}_fire`, `${prefix}_fire${moving ? '_moving' : ''}`];
        if (prefix === 'knife') names.unshift(`knife_fire_frontswing_a${moving ? '_moving' : ''}`);
        break;
      case PLAYERANIMEVENT_ATTACK_SECONDARY:
        names = [`${prefix}_fire_alt${crouch}`, `${prefix}_fire_alt`, `knife_fire_front${moving ? '_moving' : ''}`];
        break;
      case PLAYERANIMEVENT_RELOAD:
        names = [`${prefix}_reload${crouch}${moving ? '_moving' : ''}`, `${prefix}_reload${crouch}`, `${prefix}_reload`];
        if (prefix === 'shotgun') names.unshift(`shotgun_reload_start${crouch}`);
        break;
      case PLAYERANIMEVENT_JUMP:
        names = [moving ? 'jump_moving' : 'jump'];
        break;
      default:
        return;
    }
    const seq = names.map((n) => a.set.seq(n)).find(Boolean);
    if (seq) a.restartGesture(ACTION_SLOT, seq);
  }

  private ensure(model: string, ctx: RenderContext): ModelInstance | null {
    if (!model) return null;
    if (model !== this.model || !this.inst) {
      const asset = ctx.models.peek(model);
      if (!asset) {
        if (asset === undefined) void ctx.models.asset(model);
        return null;
      }
      this.dispose();
      this.inst = new ModelInstance(asset, { fog: ctx.lighting?.shared });
      this.model = model;
      this.aimSeq = '';
    }
    if (this.inst.root.parent !== ctx.scene) ctx.scene.add(this.inst.root);
    return this.inst;
  }

  /** The weapon's world model, bone-merged onto the hand (re-merged when the weapon changes). */
  private attachWeapon(inst: ModelInstance, model: string, ctx: RenderContext): void {
    if (model !== this.weaponModel) {
      const asset = model ? ctx.models.peek(model) : null;
      if (model && asset === undefined) void ctx.models.asset(model);
      if (model && !asset) {
        if (this.weapon) this.weapon.root.visible = false;
        return;
      }
      this.weapon?.dispose();
      this.weapon = asset ? new ModelInstance(asset, { uniforms: inst.uniforms, noAnim: true }) : null;
      this.weaponModel = model;
      if (this.weapon) inst.attach(this.weapon);
    }
    if (this.weapon) this.weapon.root.visible = !!model;
  }

  /** The muzzle of the weapon out, else the model's origin. */
  attachment(name: string, out: Matrix4): boolean {
    const inst = this.inst;
    if (!inst?.root.visible) return false;
    if (name === 'muzzle' && this.weapon?.root.visible && this.weapon.attachmentMatrix('muzzle_flash', out)) return true;
    if (name && name !== 'muzzle' && inst.attachmentMatrix(name, out)) return true;
    out.copy(inst.root.matrixWorld);
    return true;
  }

  hide(): void {
    if (this.inst) this.inst.root.visible = false;
  }

  dispose(): void {
    for (const c of this.corpses) c.dispose();
    this.corpses.length = 0;
    this.weapon?.dispose();
    this.weapon = null;
    this.weaponModel = '';
    this.inst?.dispose();
    this.inst = null;
    this.model = '';
  }
}

/** a − b in degrees, wrapped to (−180, 180]. */
function angleDiff(a: number, b: number): number {
  return ((((a - b) % 360) + 540) % 360) - 180;
}
