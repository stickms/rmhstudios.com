/**
 * The Half-Life 2 / Portal first-person view model: one `v_` model from the game's model
 * channel (it carries its own hands; nothing is bone-merged), drawn like the TF2 view model
 * (viewmodel.ts) — after the world, with its own projection (viewmodel_fov 54) into a cleared
 * depth buffer.
 *
 *   - Animation: the model's own activity table. ACT_VM_IDLE by default; `play(activity)`
 *     (re)starts an activity's weighted sequence (a missing activity falls back to the
 *     caller's next choice), and a finished non-looping sequence returns to idle (the SDK
 *     weapon's WeaponIdle once HasWeaponIdleTimeElapsed).
 *   - Placement: CBaseViewModel::CalcViewModelView — the eye position and angles plus the
 *     weapon bob (BobState, the same CalcViewModelBobHelper the TF2 view model uses).
 *   - Nothing is drawn until the model has loaded, and nothing at all when the channel's
 *     index does not list it: there is no stand-in.
 */
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { sourceFovToVertical, type SourceCamera } from '../camera';
import { SOURCE_UNIT } from '../coords';
import type { Vec3Like } from '../lighting';
import { LightProbe, type RenderContext } from './common';
import { ModelInstance } from './model-instance';
import { BobState, VIEWMODEL_FOV } from './viewmodel';

const ACT_VM_IDLE = 'ACT_VM_IDLE';

export interface SpViewModelInput {
  eyeOrigin: Vec3Like;
  eyeAngles: Vec3Like;
  velocity: Vec3Like;
  /** False when dead, unarmed or seen through another camera. */
  visible: boolean;
}

export class SpViewModelRenderer {
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  private inst: ModelInstance | null = null;
  /** Activities to start on the next update, in order of preference. */
  private pending: string[] | null = null;
  private visible = false;
  private readonly bob = new BobState();
  private readonly probe = new LightProbe();
  private readonly origin = { x: 0, y: 0, z: 0 };
  private readonly angles = { x: 0, y: 0, z: 0 };
  fov = VIEWMODEL_FOV;

  /** `mdl`: the model channel path (e.g. `models/weapons/v_portalgun.mdl`). */
  constructor(readonly mdl: string) {
    this.camera = new PerspectiveCamera(
      sourceFovToVertical(VIEWMODEL_FOV),
      16 / 9,
      1 * SOURCE_UNIT,
      2048 * SOURCE_UNIT,
    );
    this.scene.name = 'viewmodel';
  }

  /** (Re)starts the first of `activities` the model has (SendWeaponAnim). */
  play(...activities: string[]): void {
    this.pending = activities;
  }

  update(inp: SpViewModelInput, ctx: RenderContext): void {
    if (!this.inst) {
      // undefined: still loading (peek starts it); null: not in the channel. Draw nothing.
      const asset = ctx.models.peek(this.mdl);
      if (!asset) {
        this.visible = false;
        return;
      }
      this.inst = new ModelInstance(asset, { fog: ctx.lighting?.shared });
      this.scene.add(this.inst.root);
      this.inst.animator?.setActivity(ACT_VM_IDLE);
    }
    const inst = this.inst;
    this.visible = inp.visible;
    inst.root.visible = inp.visible;
    if (!inp.visible) {
      // A hidden view model does not animate; what it was told to play while hidden is moot.
      this.pending = null;
      return;
    }
    const anim = inst.animator;
    if (anim) {
      if (this.pending) {
        for (const act of this.pending) {
          const seq = anim.set.selectWeightedSequence(act);
          if (!seq) continue;
          anim.setSequence(seq, { restart: true, fade: !seq.snap });
          break;
        }
        this.pending = null;
      }
      const main = anim.main;
      if (!main || (!main.seq.looping && main.cycle >= 1)) anim.setActivity(ACT_VM_IDLE);
    }
    this.origin.x = inp.eyeOrigin.x;
    this.origin.y = inp.eyeOrigin.y;
    this.origin.z = inp.eyeOrigin.z;
    this.angles.x = inp.eyeAngles.x;
    this.angles.y = inp.eyeAngles.y;
    this.angles.z = inp.eyeAngles.z;
    this.bob.calc(Math.hypot(inp.velocity.x, inp.velocity.y), ctx.time);
    this.bob.apply(this.origin, this.angles);
    inst.place(this.origin, this.angles);
    this.probe.update(ctx, inst.uniforms, inp.eyeOrigin, 0);
    inst.animate(ctx.dt);
    inst.applyPose();
    inst.updateMatrices();
  }

  /** Draws the view model over the world (call after the world is rendered). */
  render(renderer: WebGLRenderer, cam: SourceCamera): void {
    if (!this.visible || !this.inst) return;
    const c = this.camera;
    c.position.copy(cam.camera.position);
    c.quaternion.copy(cam.camera.quaternion);
    c.aspect = cam.camera.aspect;
    const vfov = sourceFovToVertical(this.fov);
    if (c.fov !== vfov) c.fov = vfov;
    c.updateProjectionMatrix();
    c.updateMatrixWorld(true);
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, c);
    renderer.autoClear = autoClear;
  }

  /** Whether the model is loaded and drawn this frame. */
  get shown(): boolean {
    return this.visible && !!this.inst;
  }

  dispose(): void {
    this.inst?.dispose();
    this.inst = null;
    this.scene.clear();
  }
}
