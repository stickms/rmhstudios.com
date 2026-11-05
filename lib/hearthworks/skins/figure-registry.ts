/**
 * The one place that decides which figures are animated models this frame. Every drawn person registers here (model
 * or procedural alike, because a procedural one may be promoted when it comes close), and ONE per-frame call updates
 * every animator that is due, so there is a single frame loop for the whole crowd and no per-figure requestAnimationFrame.
 * Node-testable: it holds three.js objects but touches no renderer.
 */

import { Frustum, Matrix4, Sphere, Vector3, type Camera, type Object3D } from 'three';
import type { CharacterAnimator, FigureDrive } from './animator';
import { DEFAULT_BUDGET, SLOW_STEP_S, planBudget, type BudgetEntry, type BudgetOptions, type Tier } from './figure-budget';

export interface FigureHandle {
  readonly id: number;
  readonly pinned: boolean;
  readonly drive: FigureDrive;
  /** The group the figure is drawn in (its world position ranks it). Set once mounted. */
  object: Object3D | null;
  /** Set while a model is mounted. */
  animator: CharacterAnimator | null;
  tier: Tier;
  /** Time banked toward the next `slow` update. */
  acc: number;
}

/** Replan this often (seconds): nobody crosses the cut-off fast enough to need every frame. */
const REPLAN_S = 0.25;

const tmpPos = new Vector3();
const tmpMat = new Matrix4();
const tmpSphere = new Sphere();

export class FigureRegistry {
  private readonly handles = new Map<number, FigureHandle>();
  private readonly listeners = new Map<number, Set<() => void>>();
  private readonly frustum = new Frustum();
  private nextId = 1;
  private sinceReplan = 0;
  private dirty = true;
  private off = false;

  constructor(readonly budget: BudgetOptions = DEFAULT_BUDGET) {}

  get size(): number {
    return this.handles.size;
  }

  register(init: { pinned: boolean; drive: FigureDrive }): FigureHandle {
    let models = 0;
    for (const h of this.handles.values()) if (h.tier !== 'proc') models++;
    const handle: FigureHandle = {
      id: this.nextId++,
      pinned: init.pinned,
      drive: init.drive,
      object: null,
      animator: null,
      // Models while there is room; the first replan sorts out who really deserves them.
      tier: init.pinned || models < this.budget.models ? 'full' : 'proc',
      acc: 0,
    };
    this.handles.set(handle.id, handle);
    this.dirty = true;
    return handle;
  }

  unregister(id: number): void {
    this.handles.delete(id);
    this.listeners.delete(id);
    this.dirty = true;
  }

  /** Whether this figure should currently be drawn as a model. */
  wantsModel(id: number): boolean {
    const h = this.handles.get(id);
    return !this.off && !!h && h.tier !== 'proc';
  }

  subscribe(id: number, fn: () => void): () => void {
    let set = this.listeners.get(id);
    if (!set) this.listeners.set(id, (set = new Set()));
    set.add(fn);
    return () => void set.delete(fn);
  }

  /** Everyone falls back to procedural (a lost WebGL context, memory pressure) or comes back. */
  setDisabled(off: boolean): void {
    if (this.off === off) return;
    this.off = off;
    for (const id of this.handles.keys()) this.notify(id);
  }

  tierOf(id: number): Tier | undefined {
    return this.handles.get(id)?.tier;
  }

  /** Models currently drawn (anything not procedural). */
  modelCount(): number {
    let n = 0;
    for (const h of this.handles.values()) if (h.tier !== 'proc') n++;
    return n;
  }

  /**
   * One frame for every figure. `focus` is where the camera looks (tiles); `camera` lets off-screen figures freeze.
   * Returns how many animators were updated (for tests and the perf readout).
   */
  frame(dt: number, focus: { x: number; z: number }, camera?: Camera): number {
    this.sinceReplan += dt;
    if (this.dirty || this.sinceReplan >= REPLAN_S) {
      this.replan(focus, camera);
      this.sinceReplan = 0;
      this.dirty = false;
    }
    let updated = 0;
    for (const h of this.handles.values()) {
      const a = h.animator;
      if (!a || a.disposed) continue;
      if (h.tier === 'full') {
        a.update(dt, h.drive);
        h.acc = 0;
        updated++;
      } else if (h.tier === 'slow') {
        h.acc += dt;
        if (h.acc >= SLOW_STEP_S) {
          a.update(h.acc, h.drive);
          h.acc = 0;
          updated++;
        }
      }
    }
    return updated;
  }

  private replan(focus: { x: number; z: number }, camera?: Camera): void {
    if (camera) {
      camera.updateMatrixWorld();
      this.frustum.setFromProjectionMatrix(tmpMat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    }
    const entries: BudgetEntry[] = [];
    const prev = new Map<number, Tier>();
    for (const h of this.handles.values()) {
      prev.set(h.id, h.tier);
      let distSq = 0;
      let visible = true;
      if (h.object) {
        const e = h.object.matrixWorld.elements;
        tmpPos.set(e[12], e[13], e[14]);
        distSq = (tmpPos.x - focus.x) ** 2 + (tmpPos.z - focus.z) ** 2;
        if (camera) {
          tmpSphere.center.set(tmpPos.x, tmpPos.y + 0.2, tmpPos.z);
          tmpSphere.radius = 0.7;
          visible = this.frustum.intersectsSphere(tmpSphere);
        }
      }
      entries.push({ id: h.id, distSq, pinned: h.pinned, visible });
    }
    const plan = planBudget(entries, prev, this.budget);
    for (const h of this.handles.values()) {
      const next = plan.get(h.id) ?? h.tier;
      const wasModel = h.tier !== 'proc';
      h.tier = next;
      if (wasModel !== (next !== 'proc')) this.notify(h.id);
    }
  }

  private notify(id: number): void {
    for (const fn of [...(this.listeners.get(id) ?? [])]) fn();
  }
}
