// ============================================================
// Which animation plays when — and how it gets there smoothly.
//
// Both fighter renderers (the Y-Bot's Mixamo clips and the Source models' authored ones) drive their
// AnimationMixer through this. It fixes the things that read as animation that "cuts and stops/starts":
//   * a one-shot is positioned by the sim's progress, which advances in 60 Hz steps — the clip time follows
//     it through a short smoothing instead of stair-stepping;
//   * the same punch thrown twice in a row (jab, jab) never changed the clip key, so the clip never restarted
//     and the pose snapped back — a drop in progress now restarts it;
//   * blends OUT of a one-shot are long (0.22 s) and into one short (0.06–0.1 s), instead of one tiny fade for
//     both;
//   * idle ↔ walk flicker (one stray frame of the other state) is debounced;
//   * `dt` is time-scaled by the caller, so a hit-stop freezes the pose here too.
// ============================================================
import { LoopOnce, type AnimationAction, type AnimationMixer } from 'three';
import { CLIPS, type ClipKey } from './clips';

const oneShot = (k: ClipKey) => !CLIPS[k].loop;

/** Seconds to blend from `from` into `to`. */
export function blendTime(from: ClipKey | null, to: ClipKey): number {
    if (from === null) return 0.1;
    if (oneShot(to)) return to === 'ko' ? 0.12 : oneShot(from) ? 0.09 : Math.max(0.06, CLIPS[to].fade);
    return oneShot(from) ? Math.max(0.22, CLIPS[to].fade) : Math.max(0.2, CLIPS[to].fade); // into a loop: slow and soft
}

export interface DriveInput {
    /** The clip the sim state asks for (after any local override such as the dance emote). */
    want: ClipKey;
    /** 0..1 through the current one-shot (punch/hit/KO). */
    actionProgress: number;
    punchFrame: number;
    state: string;
    /** Playback speed of a walk / strafe loop (negative = backward); see locomotion.ts. Ignored for other clips. */
    locoScale?: number;
}

/** Rate (1/s) at which a one-shot's clip time chases the sim's progress: ~2 frames, enough to hide the 60 Hz steps. */
const PROGRESS_LAMBDA = 40;
/** How long a different LOOP must be asked for, in a row, before the fighter switches to it (s). */
const LOOP_DEBOUNCE = 0.07;
/** A drop in progress bigger than this is a new action, not a slow one. */
const RESTART_DROP = 0.3;

export class ClipDriver {
    current: ClipKey | null = null;
    private pending: ClipKey | null = null;
    private pendingFor = 0;
    private time = 0;
    private lastProgress = 0;
    private lastPunchFrame = 0;

    /** Forget everything (the mixer was rebuilt). */
    reset(): void {
        this.current = null; this.pending = null; this.pendingFor = 0; this.time = 0; this.lastProgress = 0; this.lastPunchFrame = 0;
    }

    /** One step. `dt` in seconds, already scaled by hit-stop / slow motion. */
    update(
        mixer: AnimationMixer,
        actions: Partial<Record<ClipKey, AnimationAction>>,
        input: DriveInput,
        dt: number,
    ): void {
        const want = input.want;
        let target = this.current;
        if (want !== this.current) {
            if (this.current === null || oneShot(want) || oneShot(this.current)) {
                target = want; // entering a one-shot, leaving one, or the first clip: immediately
                this.pending = null; this.pendingFor = 0;
            } else {
                // loop → loop (idle ↔ walk): wait until the request has held for a moment
                if (this.pending !== want) { this.pending = want; this.pendingFor = 0; }
                this.pendingFor += Math.max(0, dt);
                if (this.pendingFor >= LOOP_DEBOUNCE) { target = want; this.pending = null; this.pendingFor = 0; }
            }
        } else { this.pending = null; this.pendingFor = 0; }

        const next = target ? actions[target] : undefined;
        if (target && next && target !== this.current) {
            const prev = this.current ? actions[this.current] : undefined;
            if (oneShot(target)) {
                next.reset();
                next.setLoop(LoopOnce, 1);
                next.clampWhenFinished = true;
                this.time = 0;
            }
            next.enabled = true;
            next.play();
            if (prev && prev !== next) next.crossFadeFrom(prev, blendTime(this.current, target), false);
            else next.setEffectiveWeight(1);
            this.current = target;
            this.lastProgress = 0;
            this.lastPunchFrame = input.punchFrame;
        } else if (target && next && target === this.current && oneShot(target)) {
            // The same one-shot again (jab → jab): a drop in progress or in the punch's frame counter restarts it.
            const dropped = input.actionProgress < this.lastProgress - RESTART_DROP;
            const refired = input.state === 'punching' && input.punchFrame < this.lastPunchFrame - 1;
            if (dropped || refired) { next.reset(); next.enabled = true; next.play(); next.setEffectiveWeight(1); this.time = 0; }
        }

        const active = this.current ? actions[this.current] : undefined;
        if (active && this.current) {
            // A walk or strafe plays at the speed (and direction) the fighter is actually moving; everything else at 1.
            active.timeScale = (this.current === 'walk' || this.current === 'strafe') && input.locoScale ? input.locoScale : 1;
        }
        if (this.current && active && oneShot(this.current)) {
            const goal = Math.min(1, Math.max(0, input.actionProgress));
            if (goal >= this.time) this.time += (goal - this.time) * (dt > 0 ? 1 - Math.exp(-PROGRESS_LAMBDA * dt) : 0);
            else this.time = goal;
            active.paused = true; // positioned by us, not advanced by the mixer
            active.time = this.time * active.getClip().duration;
        } else if (active) {
            active.paused = false;
        }
        this.lastProgress = input.actionProgress;
        this.lastPunchFrame = input.punchFrame;
        mixer.update(Math.max(0, dt));
    }
}
