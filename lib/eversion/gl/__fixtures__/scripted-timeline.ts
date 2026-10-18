/**
 * A small scripted stand-in for the real `Timeline` (T10), for the core's unit
 * tests. It is NOT a model of the effect: it exists so a test can say "the
 * run reaches `evert` at 100 ms and `uncover` at 400 ms" and then watch the
 * core turn that into messages. It honours the one surface rule the core relies
 * on — a clock advanced by `min(now − last, MAX_DT_MS)` — and the real
 * ordering `uncover → reveal → done`, where `reveal` is what starts the
 * fade onto the live page that ends the run.
 */

import { MAX_DT_MS } from '../../constants';
import { createSnapshot } from '../../snapshot';
import type { ChannelId, StageId, TimelineApi, TimelineEvent, TimelineSnapshot } from '../../types';

export interface ScriptedTimelineOptions {
  /** Absolute ms (timeline clock) at which each stage up to `uncover` is reached. */
  stages?: readonly [StageId, number][];
  /** Ms from `reveal` to `done`. */
  revealMs?: number;
}

const DEFAULT_STAGES: readonly [StageId, number][] = [
  ['wrap', 0],
  ['evert', 100],
  ['gate-open', 200],
  ['unwrap', 300],
  ['uncover', 400],
];

export class ScriptedTimeline implements TimelineApi {
  readonly calls: string[] = [];
  private readonly snapshot: TimelineSnapshot = createSnapshot();
  private readonly stages: readonly [StageId, number][];
  private readonly revealMs: number;
  private pending: TimelineEvent[] = [];
  private next = 0;
  private clock = 0;
  private last = 0;
  private started = false;
  private revealAt: number | null = null;
  private revealed = false;
  private done = false;

  constructor(options: ScriptedTimelineOptions = {}) {
    this.stages = options.stages ?? DEFAULT_STAGES;
    this.revealMs = options.revealMs ?? 50;
  }

  get finished(): boolean {
    return this.done;
  }

  private advance(now: number) {
    this.clock += Math.min(Math.max(0, now - this.last), MAX_DT_MS);
    this.last = now;
  }

  start(t0: number): void {
    this.calls.push(`start ${t0}`);
    this.started = true;
    this.last = t0;
    this.clock = 0;
  }

  tick(now: number): Readonly<TimelineSnapshot> {
    this.advance(now);
    const s = this.snapshot;
    s.t = this.clock;
    while (this.next < this.stages.length && this.stages[this.next]![1] <= this.clock) {
      const [stage, t] = this.stages[this.next++]!;
      this.pending.push({ stage, t });
      s.stage = stage;
    }
    if (this.revealAt !== null && !this.revealed && this.next >= this.stages.length) {
      this.revealed = true;
      this.pending.push({ stage: 'reveal', t: this.clock });
      s.stage = 'reveal';
      s.bgAlpha = 0;
    }
    if (this.revealed && !this.done && this.clock >= this.revealAt! + this.revealMs) {
      this.done = true;
      this.pending.push({ stage: 'done', t: this.clock });
      s.stage = 'done';
    }
    s.evert = Math.min(1, this.clock / 300);
    return s;
  }

  fastForward(now: number): void {
    this.advance(now);
    this.calls.push('fast-forward');
  }
  afterReady(now: number): void {
    this.advance(now);
    this.calls.push('after-ready');
  }
  afterFailed(now: number): void {
    this.advance(now);
    this.calls.push('after-failed');
  }
  abort(now: number): void {
    this.advance(now);
    this.calls.push('abort');
    // Like the real one: abort hurries to completion.
    this.revealAt = this.clock;
    this.next = this.stages.length;
  }
  resize(now: number): void {
    this.advance(now);
    this.calls.push('resize');
  }
  reveal(now: number): void {
    this.advance(now);
    this.calls.push('reveal');
    this.revealAt ??= this.clock;
  }
  events(): TimelineEvent[] {
    const out = this.pending;
    this.pending = [];
    return out;
  }
  afterDeadline(now: number): number {
    return this.started ? now + 2500 : Infinity;
  }
  sample(_id: ChannelId, _now: number, out: Float64Array, offset = 0): void {
    out[offset] = 0;
    out[offset + 1] = 0;
    out[offset + 2] = 0;
  }
}
