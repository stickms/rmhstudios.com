/**
 * The first-person view model: the class arms with the weapon's c_model bone-merged onto
 * them, drawn after the world with its own projection (viewmodel_fov 54, SDK
 * ClientModeTFNormal::GetViewModelFOV) into a cleared depth buffer.
 *
 *   - Animation: the weapon's networked/predicted view-model activity (sim VM_ACTIVITY_NAMES
 *     id + a change counter) → the item's `vmActivities` (data/weapons.ts, the SDK's
 *     s_viewmodelacttable) → a weighted sequence of the arms' activity table. A new counter
 *     restarts the sequence; a finished one holds its last frame (the weapon sends IDLE).
 *   - Placement: CBaseViewModel::CalcViewModelView — the eye position and angles plus the TF
 *     weapon bob (CTFWeaponBase::AddViewmodelBob → CalcViewModelBobHelper, cl_bobcycle 0.8,
 *     cl_bobup 0.5). TF2 has no view-model lag: CTFViewModel::CalcViewModelLag returns
 *     while cl_wpn_sway_interp is 0 (its default).
 *   - Muzzle flashes at the c_model's `muzzle` attachment on fire activities (the shooter
 *     does not receive their own muzzle-flash event); the minigun barrel spins on
 *     PREFIRE/PRIMARYATTACK and winds down on POSTFIRE (CTFMinigun::SendWeaponAnim).
 *   - Hidden when zoomed, dead or spectating (the caller says so with `visible`).
 */
import { Matrix4, PerspectiveCamera, Scene, Vector3, type WebGLRenderer } from 'three';
import { CLASS_DATA } from '../../data/classes';
import { STOCK_WEAPONS, weaponScriptFor } from '../../data/weapons';
import { TF_TEAM_BLUE } from '../../core/constants';
import { vmActivityName } from '../../sim/weapons/constants';
import { sourceFovToVertical, type SourceCamera } from '../camera';
import { SOURCE_UNIT } from '../coords';
import type { Vec3Like } from '../lighting';
import { angleVectors } from '../coords';
import { LightProbe, type RenderContext } from './common';
import type { EffectSystem } from './effects';
import { ModelInstance } from './model-instance';

/** viewmodel_fov default. */
export const VIEWMODEL_FOV = 54;
/** cl_bobcycle / cl_bobup (CHEAT, so constant). */
export const CL_BOBCYCLE = 0.8;
export const CL_BOBUP = 0.5;

/** BobState_t + CalcViewModelBobHelper (tf_weaponbase.cpp), pure. */
export class BobState {
  bobTime = 0;
  lastBobTime = 0;
  lastSpeed = 0;
  verticalBob = 0;
  lateralBob = 0;

  /** Advances with the player's 2D speed at time `now` (seconds). */
  calc(speed2d: number, now: number): void {
    const dtime = now - this.lastBobTime;
    if (dtime <= 0) {
      this.lastBobTime = now;
      return;
    }
    const maxDelta = Math.max(0, dtime * 320);
    let speed = Math.min(this.lastSpeed + maxDelta, Math.max(this.lastSpeed - maxDelta, speed2d));
    speed = Math.max(-320, Math.min(320, speed));
    this.lastSpeed = speed;
    const bobOffset = speed / 320;
    this.bobTime += dtime * bobOffset;
    this.lastBobTime = now;
    const phase = (cycleLen: number) => {
      let c = this.bobTime - Math.trunc(this.bobTime / cycleLen) * cycleLen;
      c /= cycleLen;
      return c < CL_BOBUP
        ? (Math.PI * c) / CL_BOBUP
        : Math.PI + (Math.PI * (c - CL_BOBUP)) / (1 - CL_BOBUP);
    };
    let v = speed * 0.005;
    v = v * 0.3 + v * 0.7 * Math.sin(phase(CL_BOBCYCLE));
    this.verticalBob = Math.max(-7, Math.min(4, v));
    let l = speed * 0.005;
    l = l * 0.3 + l * 0.7 * Math.sin(phase(CL_BOBCYCLE * 2));
    this.lateralBob = Math.max(-7, Math.min(4, l));
  }

  /** AddViewModelBobHelper: offsets origin/angles (Source units / degrees) in place. */
  apply(
    origin: { x: number; y: number; z: number },
    angles: { x: number; y: number; z: number },
  ): void {
    const fwd = [0, 0, 0];
    const right = [0, 0, 0];
    angleVectors(angles.x, angles.y, angles.z, fwd, right);
    const v = this.verticalBob;
    origin.x += fwd[0] * v * 0.4;
    origin.y += fwd[1] * v * 0.4;
    origin.z += fwd[2] * v * 0.4;
    origin.z += v * 0.1;
    angles.z += v * 0.5;
    angles.x -= v * 0.4;
    angles.y -= this.lateralBob * 0.3;
    const l = this.lateralBob * 0.2;
    origin.x += right[0] * l;
    origin.y += right[1] * l;
    origin.z += right[2] * l;
  }
}

export interface ViewModelInput {
  cls: number;
  team: number;
  /** Active weapon defindex (−1: none). */
  defindex: number;
  /** VM_ACTIVITY_NAMES id and its change counter (the local weapon's vmActivity / vmActivitySeq). */
  vmActivity: number;
  vmActivitySeq: number;
  eyeOrigin: Vec3Like;
  eyeAngles: Vec3Like;
  velocity: Vec3Like;
  /** False when zoomed, dead, spectating or in third person. */
  visible: boolean;
  /** Cloak 0…1 (the spy's view model fades with him). */
  invis?: number;
  uber?: boolean;
  crit?: boolean;
}

/** Fire activities that flash the muzzle. */
const FIRE_ACTIVITIES = new Set(['ACT_VM_PRIMARYATTACK', 'ACT_VM_SECONDARYATTACK']);

export class ViewModelRenderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private arms: ModelInstance | null = null;
  private armsModel = '';
  private weapon: ModelInstance | null = null;
  private weaponModel = '';
  private lastSeq = -1;
  private lastAct = -1;
  private lastDef = -2;
  private readonly bob = new BobState();
  private readonly probe = new LightProbe();
  private barrelAngle = 0;
  private barrelSpeed = 0;
  private barrelTarget = 0;
  private visible = false;
  fov = VIEWMODEL_FOV;
  private readonly origin = { x: 0, y: 0, z: 0 };
  private readonly angles = { x: 0, y: 0, z: 0 };

  constructor(private readonly effects: EffectSystem | null) {
    this.camera = new PerspectiveCamera(
      sourceFovToVertical(VIEWMODEL_FOV),
      16 / 9,
      1 * SOURCE_UNIT,
      2048 * SOURCE_UNIT,
    );
    this.scene.name = 'viewmodel';
    if (effects) this.scene.add(effects.vmGroup);
  }

  update(inp: ViewModelInput, ctx: RenderContext): void {
    const cls = CLASS_DATA[inp.cls];
    this.visible = inp.visible && !!cls;
    if (!cls) return this.hide();
    // Arms.
    if (cls.handsModel !== this.armsModel || !this.arms) {
      const asset = ctx.models.peek(cls.handsModel);
      if (!asset) return this.hide();
      this.arms?.dispose();
      this.arms = new ModelInstance(asset, { fog: ctx.lighting?.shared });
      this.scene.add(this.arms.root);
      this.armsModel = cls.handsModel;
      this.weapon = null;
      this.weaponModel = '';
      this.lastSeq = -1;
    }
    const arms = this.arms;
    const w = inp.defindex >= 0 ? STOCK_WEAPONS[inp.defindex] : undefined;
    const vmModel = w?.attachToHands ? (w.viewModel ?? '') : '';
    if (vmModel !== this.weaponModel) {
      const asset = vmModel ? ctx.models.peek(vmModel) : null;
      if (asset !== undefined) {
        this.weapon?.dispose();
        this.weapon = null;
        this.weaponModel = vmModel;
        if (asset) {
          this.weapon = new ModelInstance(asset, { uniforms: arms.uniforms, noAnim: true });
          arms.attach(this.weapon);
        }
      }
    }
    const skin = inp.team === TF_TEAM_BLUE ? 1 : 0;
    arms.setSkin(skin);
    this.weapon?.setSkin(skin);
    // Activity → sequence.
    if (
      inp.vmActivitySeq !== this.lastSeq ||
      inp.defindex !== this.lastDef ||
      inp.vmActivity !== this.lastAct
    ) {
      const restart = inp.vmActivitySeq !== this.lastSeq;
      this.lastSeq = inp.vmActivitySeq;
      this.lastDef = inp.defindex;
      this.lastAct = inp.vmActivity;
      this.playActivity(vmActivityName(inp.vmActivity), inp, ctx, restart);
    }
    if (!this.visible) return this.hide();
    arms.root.visible = true;
    // Placement: eye + bob (no lag in TF2).
    this.origin.x = inp.eyeOrigin.x;
    this.origin.y = inp.eyeOrigin.y;
    this.origin.z = inp.eyeOrigin.z;
    this.angles.x = inp.eyeAngles.x;
    this.angles.y = inp.eyeAngles.y;
    this.angles.z = inp.eyeAngles.z;
    this.bob.calc(Math.hypot(inp.velocity.x, inp.velocity.y), ctx.time);
    this.bob.apply(this.origin, this.angles);
    arms.place(this.origin, this.angles);
    const u = arms.uniforms;
    u.uCloak.value = Math.min(0.85, inp.invis ?? 0);
    (u.uGlow.value as Vector3).set(0, 0, 0);
    if (inp.crit)
      (u.uGlow.value as Vector3)
        .set(inp.team === TF_TEAM_BLUE ? 0.15 : 0.9, 0.2, inp.team === TF_TEAM_BLUE ? 0.9 : 0.12)
        .multiplyScalar(0.5);
    if (inp.uber) arms.setSkin(skin + 2);
    this.probe.update(ctx, u, inp.eyeOrigin, 0);
    arms.animate(ctx.dt);
    arms.applyPose();
    this.spinBarrel(ctx.dt);
    arms.updateMatrices();
  }

  private playActivity(
    base: string,
    inp: ViewModelInput,
    ctx: RenderContext,
    restart: boolean,
  ): void {
    const arms = this.arms;
    const anim = arms?.animator;
    if (!anim || !base) return;
    const w = inp.defindex >= 0 ? STOCK_WEAPONS[inp.defindex] : undefined;
    const act = w?.vmActivities[base] ?? base;
    const seq = anim.set.selectWeightedSequence(act) ?? anim.set.selectWeightedSequence(base);
    if (seq) anim.setSequence(seq, { restart: true, fade: false });
    else if (restart) anim.restartMain();
    // Minigun barrel (SDK CTFMinigun::SendWeaponAnim).
    if (base === 'ACT_MP_ATTACK_STAND_PREFIRE' || base === 'ACT_VM_PRIMARYATTACK')
      this.barrelTarget = 20;
    else if (base === 'ACT_MP_ATTACK_STAND_POSTFIRE') this.barrelTarget = 0;
    // Muzzle flash for the local shooter.
    if (restart && FIRE_ACTIVITIES.has(base) && this.effects && w) {
      const className = CLASS_DATA[inp.cls]?.name;
      const script = className ? weaponScriptFor(inp.defindex, className) : undefined;
      if (script?.muzzleFlashParticle) {
        this.effects.oneShot(
          script.muzzleFlashParticle,
          { entity: VIEWMODEL_ENTITY, attachment: 'muzzle' },
          'vm',
        );
      }
    }
    void ctx;
  }

  private spinBarrel(dt: number): void {
    const accel = 6;
    if (this.barrelSpeed < this.barrelTarget)
      this.barrelSpeed = Math.min(this.barrelTarget, this.barrelSpeed + accel * dt);
    else this.barrelSpeed = Math.max(this.barrelTarget, this.barrelSpeed - accel * dt);
    this.barrelAngle += this.barrelSpeed * dt;
    const barrel = this.weapon?.bone('barrel');
    if (barrel) barrel.quaternion.setFromAxisAngle(Z, this.barrelAngle);
  }

  private hide(): void {
    if (this.arms) this.arms.root.visible = false;
  }

  /** A view-model attachment (three world space: the view model shares the world camera's view). */
  attachment(name: string, out: Matrix4): boolean {
    if (!this.arms || !this.visible) return false;
    return this.arms.attachmentMatrix(name, out);
  }

  /** Draws the view model over the world (call after WorldRenderer.render). */
  render(renderer: WebGLRenderer, cam: SourceCamera): void {
    if (!this.visible || !this.arms) return;
    const c = this.camera;
    c.position.copy(cam.camera.position);
    c.quaternion.copy(cam.camera.quaternion);
    c.aspect = cam.camera.aspect;
    const vfov = sourceFovToVertical(this.fov);
    if (c.fov !== vfov) c.fov = vfov;
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
    c.layers.enable(1);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, c);
    renderer.autoClear = autoClear;
  }

  get instance(): ModelInstance | null {
    return this.arms;
  }

  dispose(): void {
    this.arms?.dispose();
    this.arms = null;
    this.scene.clear();
  }
}

/** The entity id effects use to follow the view model. */
export const VIEWMODEL_ENTITY = -2;

const Z = new Vector3(0, 0, 1);
