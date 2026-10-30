/**
 * A dead player's body (TF2 and CS:GO): the death animation the game plays for that kind of death,
 * if any, then a ragdoll (ragdoll.ts) from the pose it ends in, carrying the animation's motion and
 * the killing blow's push; it lies for `lifetime` seconds and fades. When the player respawns the
 * body fades in RESPAWN_FADE so nobody mistakes it for them.
 *
 * A model without ragdoll data or hitboxes tips over on a hinge at its feet instead.
 */
import { Matrix4, Quaternion, Vector3 } from 'three';
import { SOURCE_UNIT } from '../coords';
import type { SequenceDesc } from './animator';
import type { LightProbe, RenderContext } from './common';
import type { ModelInstance } from './model-instance';
import { Ragdoll, ragdollDescFor } from './ragdoll';

/** Seconds a body fades over when its player respawns. */
export const RESPAWN_FADE = 0.3;

interface V3 {
  x: number;
  y: number;
  z: number;
}

export interface CorpseOptions {
  origin: V3;
  yaw: number;
  /** The player's velocity when they died (Source units/s). */
  velocity: V3;
  /** Seconds before the fade, and the fade's length. */
  lifetime: number;
  fade: number;
  /** Instances that go with the body (its weapon, cosmetics), disposed with it. */
  extras?: ModelInstance[];
}

const tmpV = new Vector3();
const tmpQ = new Quaternion();
const tmpM = new Matrix4();

export class Corpse {
  age = 0;
  ragdoll: Ragdoll | null = null;
  private fadeAt: number;
  private fadeLen: number;
  /** Age at which the death animation hands over to physics (−1: none playing). */
  private animUntil = -1;
  private ragdollFailed = false;
  /** Tip-over fallback progress. */
  private fall = 0;
  private push: { force: V3; at: V3 | null; bone?: string } | null = null;
  /** The solids' positions last frame (three world), for the animation's velocity at the handover. */
  private readonly prev = new Map<string, Vector3>();
  private prevDt = 0;
  private readonly centre = { x: 0, y: 0, z: 0 };
  private readonly extras: ModelInstance[];

  constructor(
    readonly inst: ModelInstance,
    private readonly opts: CorpseOptions,
  ) {
    this.fadeAt = opts.lifetime;
    this.fadeLen = opts.fade;
    this.extras = opts.extras ?? [];
  }

  /**
   * Plays a death sequence first; physics takes over when it ends (or after `maxTime`). `layer`: lay it
   * over the pose the body died in, in that gesture slot, with the pose held (CS:GO's death poses weight
   * only some bones); else it replaces the main sequence (TF2's full-body death animations).
   */
  playDeath(seq: SequenceDesc, maxTime = Infinity, fade = false, layer?: number): void {
    const a = this.inst.animator;
    if (!a) return;
    if (layer !== undefined) {
      if (a.main) a.main.rate = 0;
      a.restartGesture(layer, seq, seq.name, false);
    } else a.setSequence(seq, { restart: true, fade });
    const duration = Math.max(0.1, (seq.frames - 1) / (seq.fps || 30));
    this.animUntil = this.age + Math.min(duration, maxTime);
  }

  /** Whether a death sequence is still playing. */
  get animating(): boolean {
    return this.animUntil >= 0 && !this.ragdoll;
  }

  /**
   * The killing blow's push (the sim's ragdoll effect: Source units/s, and the Source point it landed
   * at, or the bone it hit). Applied when physics takes over, or now when it already has.
   */
  setPush(force: V3, at: V3 | null, bone?: string): void {
    if (this.ragdoll) {
      if (this.age < 0.5) this.ragdoll.push(force, at, bone);
      return;
    }
    this.push = { force, at, bone };
  }

  /** The player respawned: fade now, quickly. */
  fadeSoon(): void {
    if (this.age + RESPAWN_FADE < this.fadeAt + this.fadeLen) {
      this.fadeAt = Math.min(this.fadeAt, this.age);
      this.fadeLen = RESPAWN_FADE;
    }
  }

  /** Runs the body one frame; false once it has faded (the caller disposes it). */
  update(ctx: RenderContext, probe: LightProbe | null): boolean {
    this.age += ctx.dt;
    if (this.age >= this.fadeAt + this.fadeLen) return false;
    const inst = this.inst;
    if (!inst.root.parent) ctx.scene.add(inst.root);
    inst.uniforms.uAlpha.value =
      this.age > this.fadeAt ? 1 - (this.age - this.fadeAt) / this.fadeLen : 1;
    if (this.ragdoll) {
      this.ragdoll.update(ctx.dt);
      probe?.update(ctx, inst.uniforms, this.ragdoll.centre(this.centre), 8);
      return true;
    }
    if (this.animUntil >= 0 && this.age < this.animUntil) {
      this.track(ctx.dt);
      inst.place(this.opts.origin, { x: 0, y: this.opts.yaw, z: 0 });
      inst.animate(ctx.dt);
      inst.applyPose();
      inst.updateMatrices();
      probe?.update(ctx, inst.uniforms, this.opts.origin, 16);
      return true;
    }
    if (!this.ragdollFailed) {
      inst.place(this.opts.origin, { x: 0, y: this.opts.yaw, z: 0 });
      inst.updateMatrices();
      this.startRagdoll(ctx);
      if (this.ragdoll) return true;
    }
    this.tipOver(ctx, probe);
    return true;
  }

  private startRagdoll(ctx: RenderContext): void {
    const fromAnim = this.animUntil >= 0 && this.prevDt > 0;
    const dt = this.prevDt;
    const now = new Vector3();
    this.ragdoll = Ragdoll.create(this.inst, {
      trace: ctx.ragdollTrace ?? null,
      gravity: ctx.gravity ?? 800,
      // A death animation carries its own motion; an instant ragdoll keeps the player's.
      velocity: fromAnim ? undefined : this.opts.velocity,
      boneVelocity: fromAnim
        ? (bone) => {
            const b = this.inst.bone(bone);
            const p = this.prev.get(bone);
            if (!b || !p) return null;
            now
              .setFromMatrixPosition(b.matrixWorld)
              .sub(p)
              .divideScalar(dt * SOURCE_UNIT);
            // three (x, y, z) is Source (y, z, x).
            return { x: now.z, y: now.x, z: now.y };
          }
        : undefined,
    });
    if (!this.ragdoll) {
      this.ragdollFailed = true;
      return;
    }
    const p = this.push;
    if (p) this.ragdoll.push(p.force, p.at, p.bone);
    this.push = null;
  }

  /** The solids' world positions before this frame's pose (velocity at the handover). */
  private track(dt: number): void {
    const desc = this.prev.size ? null : ragdollDescFor(this.inst);
    if (desc) for (const s of desc.solids) this.prev.set(s.bone, new Vector3());
    for (const [name, v] of this.prev) {
      const b = this.inst.bone(name);
      if (b) v.setFromMatrixPosition(b.matrixWorld);
    }
    this.prevDt = dt;
  }

  /** No ragdoll: tip over and settle (gravity on a hinge at the feet). */
  private tipOver(ctx: RenderContext, probe: LightProbe | null): void {
    const inst = this.inst;
    this.fall = Math.min(1, this.fall + ctx.dt * (0.6 + this.fall * 3));
    inst.place(this.opts.origin, { x: 0, y: this.opts.yaw, z: 0 });
    tmpQ.setFromAxisAngle(tmpV.set(1, 0, 0), (-Math.PI / 2) * this.fall * this.fall);
    inst.root.matrix.multiply(tmpM.makeRotationFromQuaternion(tmpQ));
    inst.updateMatrices();
    probe?.update(ctx, inst.uniforms, this.opts.origin, 16);
  }

  dispose(): void {
    this.ragdoll?.dispose();
    this.ragdoll = null;
    for (const e of this.extras) e.dispose();
    this.inst.dispose();
  }
}
