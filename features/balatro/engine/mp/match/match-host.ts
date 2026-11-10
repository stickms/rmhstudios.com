/**
 * The host's referee driver (§3.f rules, REF-14/19): feeds WS4's pure
 * `refStep` with the host's own loopback events and the members' `game`
 * events, presence changes and ticks, and turns each step into
 *
 * - outcomes numbered with the host sequence `hs` (monotonic across a host
 *   migration: a new host starts above every `hs` it has seen), routed to
 *   `'*'` or one player id (speedrun, a rejoin resync, a result_request);
 * - checkpoints, coalesced to at most one every 250 ms (`flush()` forces
 *   one, e.g. before a deliberate host leave);
 * - a `tick` at the step's `wakeAt` (win re-sends at +3 s / +8 s, vote expiry);
 * - `reseed` → the new seed for the lobby's StartedMatch (WS4 hand-off).
 *
 * Takeover: `refStep(refCreate(match), {t:'restore', checkpoint, present})`
 * with the newest checkpoint this peer holds, or one rebuilt from its own
 * cache (`refRebuild`) when it has none for this run (migration.ts).
 */

import { refCreate, refStep, type RefState } from '../referee/referee';
import type { GameEvent, Id, RefCheckpoint, RefInput, RefMsg, RefStep, StartedMatch } from '../types';
import type { Scheduler } from '../transport/types';

export const CHECKPOINT_COALESCE_MS = 250;

export type PresenceStatus = Extract<RefInput, { t: 'presence' }>['status'];

export interface RefereeDriverOptions {
  sched: Scheduler;
  match: StartedMatch;
  /** One numbered outcome to deliver (`to` = '*' or a player id). */
  emit(to: '*' | Id, msg: RefMsg, hs: number): void;
  /** A (coalesced) checkpoint to broadcast. */
  checkpoint(cp: RefCheckpoint): void;
  /** The match ended (first time only). */
  onOver?(msg: RefMsg): void;
  /** A unanimous seed vote changed the seed. */
  onReseed?(seed: string): void;
  /** First `hs` to use (a successor passes its highest seen + a margin). */
  firstHs?: number;
  log?(msg: string): void;
}

export class RefereeDriver {
  state: RefState | null = null;
  hs: number;
  latest: RefCheckpoint | null = null;
  over: RefMsg | null = null;
  private cancelTick: (() => void) | null = null;
  private cancelCp: (() => void) | null = null;
  private cpDirty = false;
  private lastCpAt = -Infinity;
  private stopped = false;

  constructor(private readonly o: RefereeDriverOptions) {
    this.hs = o.firstHs ?? 0;
  }

  get match(): StartedMatch {
    return this.state?.match ?? this.o.match;
  }

  /** A new match (FL-01): `rngSeed` from the host CSPRNG. */
  reset(rngSeed: number): void {
    this.run(null, { t: 'reset', at: this.o.sched.now(), match: this.o.match, rngSeed });
  }

  /** Takeover from a checkpoint (REF-19); `present` = who is connected right now. */
  restore(checkpoint: RefCheckpoint, present: Id[]): void {
    this.run(refCreate(this.o.match), { t: 'restore', at: this.o.sched.now(), checkpoint, present });
  }

  event(from: Id, e: GameEvent): void {
    if (!this.state) return;
    this.run(this.state, { t: 'event', at: this.o.sched.now(), from, e });
  }

  presence(id: Id, status: PresenceStatus): void {
    if (!this.state) return;
    this.run(this.state, { t: 'presence', at: this.o.sched.now(), id, status });
  }

  /**
   * Steps are serialised: an outcome handled on loopback may produce another
   * input (the host's own MatchClient) while a step's outputs are still being
   * delivered; that input waits for the current step to finish.
   */
  private running = false;
  private readonly queue: (() => void)[] = [];

  private run(state: RefState | null, input: RefInput): void {
    if (this.stopped) return;
    if (this.running) {
      // Re-read the state when it runs: the step in progress replaces it.
      this.queue.push(() => this.step(input.t === 'reset' || input.t === 'restore' ? state : this.state, input));
      return;
    }
    this.running = true;
    try {
      this.step(state, input);
      while (this.queue.length > 0 && !this.stopped) (this.queue.shift() as () => void)();
    } finally {
      this.running = false;
      this.queue.length = 0;
    }
  }

  private step(state: RefState | null, input: RefInput): void {
    if (this.stopped) return;
    if (!state && input.t !== 'reset') return;
    let step: RefStep<RefState>;
    try {
      step = refStep(state, input);
    } catch (err) {
      this.o.log?.(`referee step ${input.t} failed: ${String(err)}`);
      return;
    }
    this.state = step.state;
    for (const out of step.out) {
      this.hs += 1;
      if (out.msg.t === 'reseed') this.o.onReseed?.(out.msg.seed);
      this.o.emit(out.to, out.msg, this.hs);
    }
    if (step.checkpoint) {
      this.latest = step.checkpoint;
      this.scheduleCheckpoint();
    }
    if (step.over && !this.over) {
      this.over = step.over;
      this.o.onOver?.(step.over);
    }
    this.scheduleTick(step.wakeAt);
  }

  private scheduleTick(wakeAt: number | null): void {
    this.cancelTick?.();
    this.cancelTick = null;
    if (wakeAt === null || this.stopped) return;
    const delay = Math.max(0, wakeAt - this.o.sched.now());
    this.cancelTick = this.o.sched.after(delay, () => {
      this.cancelTick = null;
      if (this.state) this.run(this.state, { t: 'tick', at: Math.max(wakeAt, this.o.sched.now()) });
    });
  }

  private scheduleCheckpoint(): void {
    this.cpDirty = true;
    if (this.cancelCp) return;
    const wait = Math.max(0, this.lastCpAt + CHECKPOINT_COALESCE_MS - this.o.sched.mono());
    if (wait === 0) {
      this.flush();
      return;
    }
    this.cancelCp = this.o.sched.after(wait, () => {
      this.cancelCp = null;
      this.flush();
    });
  }

  /** Broadcast the pending checkpoint now. */
  flush(): void {
    this.cancelCp?.();
    this.cancelCp = null;
    if (!this.cpDirty || !this.latest) return;
    this.cpDirty = false;
    this.lastCpAt = this.o.sched.mono();
    this.o.checkpoint(this.latest);
  }

  /** Lives per player from the referee's state (welcome, presence). */
  lives(): Record<Id, number> {
    const out: Record<Id, number> = {};
    for (const [id, p] of Object.entries(this.state?.cp.players ?? {})) out[id] = p.lives;
    return out;
  }

  /** The highest ante any player reported (hub directory summary). */
  ante(): number | null {
    const ps = Object.values(this.state?.cp.players ?? {});
    return ps.length ? Math.max(...ps.map((p) => p.ante)) : null;
  }

  stop(): void {
    this.stopped = true;
    this.cancelTick?.();
    this.cancelCp?.();
    this.cancelTick = this.cancelCp = null;
  }
}
