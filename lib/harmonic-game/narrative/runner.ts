/**
 * The dialogue runner (H3.1): a queue of scripts, one line at a time. Pure and clock-driven: it
 * reads time from the `clock` it is given (the sim's `world.curtime`, which stops while paused, so
 * a paused game makes no progress) and advances in `tick()`.
 *
 *   const r = new DialogueRunner(() => world.curtime);
 *   r.on((e) => …);                 // 'line' | 'finished' | 'cancelled'
 *   r.start(script, { source });    // queued behind a playing script; { interrupt: true } replaces it
 *   r.tick();                       // every sim tick
 *   r.current();                    // the line on screen, or null (between lines / idle)
 *   r.skip(); r.cancel(match?);
 *
 * `once` scripts are remembered in `played` (a death reload calls `reset()`).
 */
import { LINE_GAP_S, LINE_MIN_MS, LINE_MS_PER_CHAR, LINE_PAD_MS } from './constants';
import type { DialogueLine, DialogueScript } from './types';

/** Default on-screen time for a line, from the length of its English text. */
export const defaultLineMs = (text: string): number =>
  Math.max(LINE_MIN_MS, Math.round(text.length * LINE_MS_PER_CHAR + LINE_PAD_MS));

export const lineMs = (line: DialogueLine): number =>
  line.durationMs !== undefined && line.durationMs > 0
    ? line.durationMs
    : defaultLineMs(line.defaultValue);

export interface ActiveLine {
  script: DialogueScript;
  /** Zero-based. */
  index: number;
  line: DialogueLine;
  source: unknown;
  startedAt: number;
  endsAt: number;
}

export type DialogueEvent =
  | { type: 'line'; script: DialogueScript; index: number; line: DialogueLine; source: unknown }
  | { type: 'finished'; script: DialogueScript; source: unknown }
  | { type: 'cancelled'; script: DialogueScript; source: unknown };

export type DialogueListener = (e: DialogueEvent) => void;

export interface StartOptions {
  /** Whatever started it (the entity); events carry it back, and `cancel(source)` matches it. */
  source?: unknown;
  /** Cancel what is playing and start now (the queue is kept). */
  interrupt?: boolean;
}

interface Queued {
  script: DialogueScript;
  source: unknown;
}

interface Running extends Queued {
  index: number;
  /** In the gap after a line (no subtitle). */
  gapUntil: number;
  line: ActiveLine | null;
}

export class DialogueRunner {
  private readonly listeners = new Set<DialogueListener>();
  private readonly queue: Queued[] = [];
  private running: Running | null = null;
  private readonly played = new Set<string>();

  constructor(private readonly clock: () => number) {}

  on(fn: DialogueListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Whether a `once` script has already started. */
  hasPlayed(id: string): boolean {
    return this.played.has(id);
  }

  /** Whether anything is playing or waiting. */
  get busy(): boolean {
    return this.running !== null || this.queue.length > 0;
  }

  /** The id of the playing script, or null. */
  get playingId(): string | null {
    return this.running?.script.id ?? null;
  }

  /** The line on screen now (null between lines and when idle). */
  current(): ActiveLine | null {
    return this.running?.line ?? null;
  }

  /** Starts (or queues) a script. False when a `once` script already played. */
  start(script: DialogueScript, opts: StartOptions = {}): boolean {
    if (script.once) {
      if (this.played.has(script.id)) return false;
      this.played.add(script.id);
    }
    const item: Queued = { script, source: opts.source ?? null };
    if (opts.interrupt && this.running) {
      this.cancelRunning();
      this.queue.unshift(item);
    } else {
      this.queue.push(item);
    }
    this.tick();
    return true;
  }

  /** Ends the line on screen now and moves on. */
  skip(): boolean {
    const r = this.running;
    if (!r?.line) return false;
    r.line.endsAt = this.clock();
    this.tick();
    return true;
  }

  /**
   * Cancels by script id, by source, or everything (no argument). The playing script emits
   * `cancelled`; queued ones are dropped silently. Returns how many were removed.
   */
  cancel(match?: string | object): number {
    const hit = (q: Queued) =>
      match === undefined ||
      (typeof match === 'string' ? q.script.id === match : q.source === match);
    let n = 0;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (hit(this.queue[i])) {
        this.queue.splice(i, 1);
        n++;
      }
    }
    if (this.running && hit(this.running)) {
      this.cancelRunning();
      n++;
    }
    this.tick();
    return n;
  }

  /** Level-start state: nothing playing or queued, `once` memory cleared. No events. */
  reset(): void {
    this.running = null;
    this.queue.length = 0;
    this.played.clear();
  }

  /** Advances to the clock's now. Safe to call as often as you like. */
  tick(): void {
    const now = this.clock();
    for (let guard = 0; guard < 1000; guard++) {
      let r = this.running;
      if (!r) {
        const next = this.queue.shift();
        if (!next) return;
        r = this.running = { ...next, index: -1, gapUntil: now, line: null };
        this.advance(r, now);
        continue;
      }
      if (r.line) {
        if (now < r.line.endsAt) return;
        const ended = r.line.endsAt;
        r.line = null;
        if (r.index + 1 >= r.script.lines.length) {
          this.running = null;
          this.emit({ type: 'finished', script: r.script, source: r.source });
        } else {
          r.gapUntil = ended + LINE_GAP_S;
        }
        continue;
      }
      if (now < r.gapUntil) return;
      this.advance(r, Math.max(r.gapUntil, 0));
    }
  }

  private advance(r: Running, at: number): void {
    r.index++;
    const line = r.script.lines[r.index];
    if (!line) {
      this.running = null;
      this.emit({ type: 'finished', script: r.script, source: r.source });
      return;
    }
    r.line = {
      script: r.script,
      index: r.index,
      line,
      source: r.source,
      startedAt: at,
      endsAt: at + lineMs(line) / 1000,
    };
    this.emit({ type: 'line', script: r.script, index: r.index, line, source: r.source });
  }

  private cancelRunning(): void {
    const r = this.running;
    if (!r) return;
    this.running = null;
    this.emit({ type: 'cancelled', script: r.script, source: r.source });
  }

  private emit(e: DialogueEvent): void {
    for (const fn of [...this.listeners]) fn(e);
  }
}
