/**
 * The animation controller for one skinned character: turns "how fast is it going, is it in the air, is it dead,
 * did it just fire" into weights on a three.js AnimationMixer's actions. No React and no renderer, so it is unit-tested
 * in node against a model built in code.
 *
 * Layers, from the bottom (every layer is a smoothed 0..1 envelope, so nothing ever pops, and a state flipped
 * mid-blend turns around from where it is, with no overshoot):
 *
 *   locomotion  idle / walk / run weights from `locomotionBlend(speed)`; walk and run are phase-locked and played at
 *               a rate that follows the ground speed, so the feet match the ground instead of skating
 *   air         jump and fall replace locomotion while the avatar is off the ground
 *   one-shots   shoot / reload / hurt / interact play once on top and fade out; a new one interrupts the last
 *   death       plays once and holds its last frame
 *
 * The final weights always sum to 1 (a full blend, never additive), and a clip a model lacks is replaced through the
 * fallback chain in model-manifest.ts (run→walk→idle, shoot/reload/interact/hurt→idle, death→hurt→idle, jump/fall→idle).
 */

import {
  AnimationAction,
  AnimationMixer,
  LoopOnce,
  LoopRepeat,
  type AnimationClip,
  type Object3D,
} from 'three';
import { locomotionBlend } from '../avatar/controller';
import {
  CLIP_SLOTS,
  resolveClip,
  type ClipSlot,
  type OneShotSlot,
} from './model-manifest';
import { clamp01 } from '@/lib/core/math';

export type AirState = 'ground' | 'jump' | 'fall';

/** What the owner of a figure tells it every frame, plus a queue of one-shots to play. Mutated in place, never re-created. */
export interface FigureDrive {
  /** Ground speed, tiles/s. */
  speed: number;
  air: AirState;
  dead: boolean;
  /** Working at something: keeps replaying `interact` for as long as it is true. */
  busy: boolean;
  /** One-shots waiting to play; the animator drains this. */
  triggers: OneShotSlot[];
}

export const newDrive = (): FigureDrive => ({ speed: 0, air: 'ground', dead: false, busy: false, triggers: [] });

/** Queue a one-shot; a figure nobody is updating (frozen, far away) cannot grow the queue without bound. */
export function pushTrigger(drive: FigureDrive, slot: OneShotSlot): void {
  if (drive.triggers.length >= 4) drive.triggers.shift();
  drive.triggers.push(slot);
}

/** Walk-cycle repeats per second per tile/s of ground speed: the game's strides, tuned so the feet keep up with a 4 m tile. */
export const CYCLES_PER_SPEED = 0.75;

/** Cycles per second of the shared locomotion phase at this ground speed. */
export const strideCadence = (speed: number): number => (Number.isFinite(speed) && speed > 0 ? speed * CYCLES_PER_SPEED : 0);

/** Playback rate of a looping locomotion clip of this length (s) at this speed: cycles/s × clip length. */
export const locomotionRate = (clipDuration: number, speed: number): number => strideCadence(speed) * clipDuration;

/** Per-second rates of the exponential approach for each envelope (higher = snappier; all are monotone, so no overshoot). */
export const RATES = { loco: 16, air: 14, deathIn: 9, deathOut: 12, shotIn: 18, shotOut: 14, hurtIn: 24 } as const;

/** One-shots begin fading this long before their clip ends, so they hand the body back softly. */
const FADE_OUT_S = 0.25;
/** Interact repeats this often while `busy`. */
const BUSY_GAP_S = 0.15;
/** Weights at or below this are not worth blending: that action is switched off. */
const MIN_WEIGHT = 0.002;

/** Frame-rate-independent step of `cur` toward `target`. */
export const approach = (cur: number, target: number, dt: number, rate: number): number =>
  cur + (target - cur) * (1 - Math.exp(-rate * dt));

interface Overlay {
  slot: OneShotSlot;
  animation: string;
  action: AnimationAction;
  env: number;
  age: number;
  duration: number;
  /** True while it is still meant to play; false once it is fading out. */
  live: boolean;
}

export interface AnimatorOptions {
  /** Seeds the idle phase and a small rate variation so a crowd does not breathe in unison. */
  seed?: number;
}

export class CharacterAnimator {
  readonly mixer: AnimationMixer;
  disposed = false;

  private readonly root: Object3D;
  private readonly clips: ReadonlyMap<string, AnimationClip>;
  private readonly anim: Record<ClipSlot, string>;
  /** Whether each slot is played by a clip of its own rather than a fallback. */
  private readonly own: Record<ClipSlot, boolean>;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly overlays: Overlay[] = [];
  /** Shared locomotion phase in cycles (0..1). */
  private phase: number;
  private readonly idleVariation: number;
  private primed = false;

  private jumpW = 0;
  private fallW = 0;
  private deathW = 0;
  private wasDead = false;
  private prevAir: AirState = 'ground';
  private busyTimer = 0;
  private locoW = { idle: 1, walk: 0, run: 0 };

  /** Final weight per animation name, as applied on the last update (for tests and debugging). */
  readonly applied = new Map<string, number>();

  constructor(root: Object3D, clips: ReadonlyMap<string, AnimationClip>, entry: { clips: Partial<Record<ClipSlot, string>> }, opts: AnimatorOptions = {}) {
    this.root = root;
    this.clips = clips;
    this.mixer = new AnimationMixer(root);
    const available = new Set(clips.keys());
    this.anim = {} as Record<ClipSlot, string>;
    this.own = {} as Record<ClipSlot, boolean>;
    for (const slot of CLIP_SLOTS) {
      const resolved = resolveClip(entry, slot, available);
      this.anim[slot] = resolved.animation;
      this.own[slot] = resolved.slot === slot;
    }
    const seed = opts.seed ?? Math.random();
    this.phase = frac(seed * 7.13);
    this.idleVariation = 0.94 + frac(seed * 3.77) * 0.12;

    // Several slots can share one animation (run→walk, jump→idle): the first role to claim it configures it.
    const claimed = new Set<string>();
    const configure = (name: string, loop: typeof LoopOnce | typeof LoopRepeat, timeScale = 1) => {
      if (claimed.has(name)) return;
      claimed.add(name);
      const a = this.action(name);
      if (loop === LoopOnce) {
        a.setLoop(LoopOnce, 1);
        a.clampWhenFinished = true;
      } else {
        a.setLoop(LoopRepeat, Infinity);
      }
      a.timeScale = timeScale;
      return a;
    };
    // Idle runs on the mixer's clock, offset per instance; walk and run are driven by the shared stride phase.
    const idle = configure(this.anim.idle, LoopRepeat, this.idleVariation);
    if (idle) idle.time = frac(seed * 11.1) * idle.getClip().duration;
    configure(this.anim.walk, LoopRepeat, 0);
    configure(this.anim.run, LoopRepeat, 0);
    configure(this.anim.fall, LoopRepeat);
    configure(this.anim.jump, LoopOnce);
    configure(this.anim.death, LoopOnce);
    for (const a of this.actions.values()) {
      a.enabled = false;
      a.play();
    }
  }

  private action(name: string): AnimationAction {
    let a = this.actions.get(name);
    if (!a) {
      const clip = this.clips.get(name);
      if (!clip) throw new Error(`animator: no clip "${name}"`);
      a = this.mixer.clipAction(clip, this.root);
      this.actions.set(name, a);
    }
    return a;
  }

  /**
   * True when the model has a clip of its own for this slot. A fallback (death played by hurt, run by walk) does not
   * count, so a figure with only a flinch to die with still topples over instead of holding that flinch standing.
   */
  hasOwnClip(slot: ClipSlot): boolean {
    return this.own[slot];
  }

  /** The animation (not a fallback) a one-shot plays, or null when this model has none and the body just carries on. */
  oneShotFor(slot: OneShotSlot): string | null {
    const name = this.anim[slot];
    return name === this.anim.idle ? null : name;
  }

  /** Play a one-shot now, interrupting any other. Returns false (and does nothing) when the model has no such clip. */
  trigger(slot: OneShotSlot): boolean {
    if (this.disposed) return false;
    const animation = this.oneShotFor(slot);
    if (!animation) return false;
    // Same one again: restart it in place; its envelope is already up, so the pose just replays.
    const existing = this.overlays.find((o) => o.animation === animation);
    const action = this.action(animation);
    if (existing) {
      existing.live = true;
      existing.age = 0;
      existing.slot = slot;
      action.reset();
      action.setLoop(LoopOnce, 1);
      action.clampWhenFinished = true;
      action.enabled = true;
      action.play();
      return true;
    }
    action.reset();
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.enabled = true;
    action.play();
    // Earlier ones give way: only the newest stays live (the others fade out under it).
    for (const o of this.overlays) o.live = false;
    this.overlays.push({ slot, animation, action, env: 0, age: 0, duration: action.getClip().duration, live: true });
    return true;
  }

  /** Advance by `dt` seconds with the drive's current state. Safe to call at any rate, including very rarely. */
  update(dt: number, drive: FigureDrive): void {
    if (this.disposed) return;
    const step = Number.isFinite(dt) ? Math.min(Math.max(dt, 0), 0.25) : 0;
    const speed = Number.isFinite(drive.speed) ? Math.max(0, drive.speed) : 0;
    const snap = !this.primed;
    this.primed = true;

    while (drive.triggers.length > 0) this.trigger(drive.triggers.shift()!);

    // Working: keep replaying interact whenever the last one has finished.
    this.busyTimer = Math.max(0, this.busyTimer - step);
    if (drive.busy && this.busyTimer === 0 && !this.overlays.some((o) => o.live && o.slot === 'interact')) {
      if (this.trigger('interact')) this.busyTimer = BUSY_GAP_S;
    }

    // --- envelopes
    const want = locomotionBlend(speed);
    const lk = snap ? 1 : 1 - Math.exp(-RATES.loco * step);
    const lw = this.locoW;
    lw.idle += (want.idle - lw.idle) * lk;
    lw.walk += (want.walk - lw.walk) * lk;
    lw.run += (want.run - lw.run) * lk;
    const lsum = lw.idle + lw.walk + lw.run || 1;
    lw.idle /= lsum;
    lw.walk /= lsum;
    lw.run /= lsum;
    const loco = lw;
    const jumpT = drive.air === 'jump' ? 1 : 0;
    const fallT = drive.air === 'fall' ? 1 : 0;
    if (drive.air !== this.prevAir) {
      // Entering the air starts that clip from its first frame, from zero weight.
      if (drive.air === 'jump') this.restart(this.anim.jump);
      else if (drive.air === 'fall') this.restart(this.anim.fall);
      this.prevAir = drive.air;
    }
    const deadT = drive.dead ? 1 : 0;
    if (drive.dead && !this.wasDead) this.restart(this.anim.death);
    this.wasDead = drive.dead;
    if (snap) {
      this.jumpW = jumpT;
      this.fallW = fallT;
      this.deathW = deadT;
    } else {
      this.jumpW = approach(this.jumpW, jumpT, step, RATES.air);
      this.fallW = approach(this.fallW, fallT, step, RATES.air);
      this.deathW = approach(this.deathW, deadT, step, deadT > this.deathW ? RATES.deathIn : RATES.deathOut);
    }
    if (this.deathW > 0.9995 && deadT === 1) this.deathW = 1;
    for (let i = this.overlays.length - 1; i >= 0; i--) {
      const o = this.overlays[i];
      o.age += step;
      if (o.live && o.age >= Math.max(o.duration * 0.5, o.duration - FADE_OUT_S)) o.live = false;
      const rate = o.live ? (o.slot === 'hurt' ? RATES.hurtIn : RATES.shotIn) : RATES.shotOut;
      o.env = snap && o.live ? 1 : approach(o.env, o.live ? 1 : 0, step, rate);
      if (!o.live && (o.env < 0.004 || o.age >= o.duration + 0.2)) {
        o.action.enabled = false;
        o.action.stop();
        this.overlays.splice(i, 1);
      }
    }

    // --- weights: death first, then one-shots (newest wins), then air, then locomotion gets the rest
    const w = new Map<string, number>();
    const add = (name: string, v: number) => {
      if (v > 0) w.set(name, (w.get(name) ?? 0) + v);
    };
    let rest = 1;
    const death = this.deathW * rest;
    add(this.anim.death, death);
    rest -= death;
    const moving = 1 - loco.idle;
    for (let i = this.overlays.length - 1; i >= 0; i--) {
      const o = this.overlays[i];
      // A shot while running keeps some of the gait under it.
      const cap = o.slot === 'shoot' || o.slot === 'reload' ? 1 - 0.3 * moving : 1;
      const v = clamp01(o.env) * cap * rest;
      add(o.animation, v);
      rest -= v;
    }
    const jumpV = clamp01(this.jumpW) * rest;
    const fallV = clamp01(this.fallW) * Math.max(0, rest - jumpV);
    add(this.anim.jump, jumpV);
    add(this.anim.fall, fallV);
    rest = Math.max(0, rest - jumpV - fallV);
    add(this.anim.idle, loco.idle * rest);
    add(this.anim.walk, loco.walk * rest);
    add(this.anim.run, loco.run * rest);

    // --- locomotion time: one shared phase, so walk and run feet land together while they blend
    this.phase = frac(this.phase + strideCadence(speed) * step);
    for (const slot of ['walk', 'run'] as const) {
      const a = this.actions.get(this.anim[slot])!;
      a.time = this.phase * a.getClip().duration;
    }

    // Drop weights too small to see (their actions are switched off) and share them out, so the rest still sum to 1.
    let kept = 0;
    for (const v of w.values()) if (v > MIN_WEIGHT) kept += v;
    const norm = kept > 0 ? 1 / kept : 1;
    this.applied.clear();
    for (const [name, a] of this.actions) {
      const raw = w.get(name) ?? 0;
      const on = raw > MIN_WEIGHT;
      const v = on ? raw * norm : 0;
      this.applied.set(name, v);
      if (on !== a.enabled) a.enabled = on;
      if (on) a.setEffectiveWeight(v);
    }
    this.mixer.update(step);
  }

  /** Weight currently applied to an animation (0 when unused). */
  weightOf(animation: string): number {
    return this.applied.get(animation) ?? 0;
  }

  /** The smoothed locomotion blend (idle/walk/run weights before air/one-shots/death are taken out). */
  get locomotion(): { idle: number; walk: number; run: number } {
    return this.locoW;
  }

  /** Playback rate the walk clip is effectively running at right now (1 = authored speed). */
  rateOf(slot: 'walk' | 'run', speed: number): number {
    const a = this.actions.get(this.anim[slot]);
    return a ? locomotionRate(a.getClip().duration, speed) : 0;
  }

  private restart(name: string) {
    const a = this.actions.get(name);
    if (!a) return;
    a.reset();
    // A shared animation (death→hurt) may have been left unclamped by a one-shot.
    if (a.loop === LoopOnce) a.clampWhenFinished = true;
    a.enabled = false;
    a.play();
  }

  /** Release the mixer's caches. The shared clips, geometry and materials belong to the loaded model and stay. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.overlays.length = 0;
    this.applied.clear();
  }
}

function frac(v: number): number {
  const f = v - Math.floor(v);
  return Number.isFinite(f) ? f : 0;
}

