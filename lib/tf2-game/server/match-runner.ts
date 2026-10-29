/**
 * `MatchRunner` — hosts one or more matches on one thread and steps them all
 * on a drift-corrected fixed 66.67 Hz clock.
 *
 * It is the body of the match worker (`./match-worker.server.ts`) and of the
 * pool's in-process dev fallback; it imports nothing from Node or the DOM so
 * the same loop can later run a browser listen server.
 *
 * ## The clock
 *
 * Elapsed wall time is accumulated from a monotonic clock (`hrtime` in the
 * worker) and converted into whole 15 ms ticks, so timer jitter never becomes
 * drift: a wakeup that lands 3 ms late runs its tick 3 ms late, and the next
 * one is still due on the original grid. A wakeup that finds several ticks due
 * runs them back to back — at most `maxCatchUp` (5) — and DROPS any backlog
 * beyond that, counting it, rather than spiralling: a host that cannot keep up
 * at 66 Hz will not keep up at 132 Hz either.
 *
 * Between ticks the thread sleeps on `setTimeout`. Node timers have 1 ms
 * resolution and fire up to ~1 ms EARLY against the high-resolution clock, so
 * a tick may run up to `earlyMs` (1 ms) before its slot: it is still counted
 * against that slot (the accumulator dips below zero), so the grid and the
 * long-run rate are unchanged — and the thread never spins on `setImmediate`
 * waiting out a sub-millisecond remainder (measured: ~300 wakeups per tick
 * when it did). With no running match the loop stops entirely.
 *
 * ## Ordering
 *
 * Messages are applied as they arrive, between ticks (one thread). A match's
 * messages that arrive while its factory is still loading the map are queued
 * and replayed in order once it resolves. Each tick posts ONE `frames` message
 * carrying every match's packets, with their buffers transferred.
 *
 * ## Isolation
 *
 * A host that throws is closed (`server-error`) and disposed; the other
 * matches on the thread carry on. A factory that rejects closes its match with
 * `map-failed`.
 */

import { TICK_INTERVAL } from '../core/constants';
import type { MatchFactory, MatchHost, MatchOptions, OutgoingPacket } from './match-host';
import type { CloseReason, FromWorker, MatchFrame, ToWorker, WirePacket } from './worker-protocol';

export const TICK_INTERVAL_MS = TICK_INTERVAL * 1000;
export const MAX_CATCH_UP_TICKS = 5;

type TimerHandle = unknown;

export interface MatchRunnerOptions {
  factory: MatchFactory;
  /** Delivers a message to the pool; `transfer` lists buffers it may move. */
  post: (message: FromWorker, transfer: ArrayBuffer[]) => void;
  /** Monotonic milliseconds. Default `performance.now()`. */
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => TimerHandle;
  clearTimer?: (handle: TimerHandle) => void;
  /** Run `fn` on the next turn of the event loop. Default `setImmediate` (or a 0 ms timeout). */
  defer?: (fn: () => void) => void;
  /** `false` → the loop is only advanced by `pump()` (tests with a fake clock). */
  autoRun?: boolean;
  tickIntervalMs?: number;
  /** How early (ms) a due tick may run to absorb timer granularity. Default 1. */
  earlyMs?: number;
  maxCatchUp?: number;
  /** How often summaries go out (sooner after a join/leave/command). */
  summaryIntervalMs?: number;
  /** A match with no humans for this long is closed (`empty`). */
  emptyGraceMs?: number;
  heartbeatMs?: number;
}

interface HostedMatch {
  id: string;
  opts: MatchOptions;
  host: MatchHost | null;
  /** Messages received while the factory was loading. */
  queue: ToWorker[];
  tick: number;
  emptySince: number | null;
  closed: boolean;
}

export interface RunnerStats {
  ticks: number;
  droppedTicks: number;
  wakeups: number;
  /** Exponential moving average of one tick across every match, ms. */
  tickCostMs: number;
}

function unref(handle: TimerHandle): TimerHandle {
  const h = handle as { unref?: () => void } | null;
  if (h && typeof h.unref === 'function') h.unref();
  return handle;
}

export class MatchRunner {
  readonly stats: RunnerStats = { ticks: 0, droppedTicks: 0, wakeups: 0, tickCostMs: 0 };

  private readonly matches = new Map<string, HostedMatch>();
  private readonly factory: MatchFactory;
  private readonly post: MatchRunnerOptions['post'];
  private readonly now: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => TimerHandle;
  private readonly clearTimer: (handle: TimerHandle) => void;
  private readonly defer: (fn: () => void) => void;
  private readonly autoRun: boolean;
  private readonly interval: number;
  private readonly earlyMs: number;
  private readonly maxCatchUp: number;
  private readonly summaryIntervalMs: number;
  private readonly emptyGraceMs: number;
  private readonly heartbeatMs: number;

  private running = false;
  private last = 0;
  private acc = 0;
  private timer: TimerHandle | null = null;
  private deferred = false;
  private heartbeat: TimerHandle | null = null;
  private lastSummaryAt = -Infinity;
  private summaryDirty = false;
  private shutDown = false;

  constructor(options: MatchRunnerOptions) {
    this.factory = options.factory;
    this.post = options.post;
    this.now = options.now ?? (() => performance.now());
    this.setTimer = options.setTimer ?? ((fn, ms) => unref(setTimeout(fn, ms)));
    this.clearTimer =
      options.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    // NOT unref'd: Node's poll phase ignores an unref'd immediate and blocks
    // until the next ref'd timer, which stalled the loop for whole timer periods.
    const immediate = (globalThis as { setImmediate?: (fn: () => void) => unknown }).setImmediate;
    this.defer = options.defer ?? (immediate ? (fn) => void immediate(fn) : (fn) => void setTimeout(fn, 0));
    this.autoRun = options.autoRun ?? true;
    this.interval = options.tickIntervalMs ?? TICK_INTERVAL_MS;
    this.earlyMs = options.earlyMs ?? 1;
    this.maxCatchUp = options.maxCatchUp ?? MAX_CATCH_UP_TICKS;
    this.summaryIntervalMs = options.summaryIntervalMs ?? 1_000;
    this.emptyGraceMs = options.emptyGraceMs ?? 60_000;
    this.heartbeatMs = options.heartbeatMs ?? 2_000;
  }

  get matchCount(): number {
    return this.matches.size;
  }

  /** Apply one message from the pool. */
  handle(message: ToWorker): void {
    if (this.shutDown) return;
    if (message.t === 'shutdown') {
      this.shutdown();
      return;
    }
    if (message.t === 'create') {
      this.create(message.matchId, message.opts);
      return;
    }
    const match = this.matches.get(message.matchId);
    if (!match) return;
    if (message.t === 'dispose') {
      this.drop(match);
      return;
    }
    if (!match.host) {
      match.queue.push(message);
      return;
    }
    this.apply(match, message);
  }

  /**
   * Run every tick that is due now (capped), then post summaries if it is time.
   * Returns the number of ticks run. The automatic loop calls this; with
   * `autoRun: false` a test calls it after moving its fake clock.
   */
  pump(): number {
    this.stats.wakeups += 1;
    const now = this.now();
    if (!this.running) {
      this.running = true;
      this.last = now;
      this.acc = 0;
    }
    this.acc += now - this.last;
    this.last = now;

    let due = Math.floor((this.acc + this.earlyMs) / this.interval);
    if (due > this.maxCatchUp) {
      const dropped = due - this.maxCatchUp;
      this.stats.droppedTicks += dropped;
      this.acc -= dropped * this.interval;
      due = this.maxCatchUp;
    }
    for (let i = 0; i < due; i += 1) {
      const started = this.now();
      this.runTick(started);
      this.acc -= this.interval;
      const cost = this.now() - started;
      this.stats.tickCostMs = this.stats.tickCostMs * 0.95 + cost * 0.05;
    }

    const sinceSummary = now - this.lastSummaryAt;
    if (
      sinceSummary >= this.summaryIntervalMs ||
      (this.summaryDirty && sinceSummary >= Math.min(200, this.summaryIntervalMs))
    ) {
      this.postSummaries(now);
    }
    return due;
  }

  shutdown(): void {
    this.shutDown = true;
    for (const match of [...this.matches.values()]) this.drop(match);
    this.stopLoop();
  }

  // ── Match lifecycle ──────────────────────────────────────────────────────

  private create(matchId: string, opts: MatchOptions): void {
    if (this.matches.has(matchId)) return;
    const match: HostedMatch = {
      id: matchId,
      opts,
      host: null,
      queue: [],
      tick: 0,
      emptySince: null,
      closed: false,
    };
    this.matches.set(matchId, match);
    this.ensureHeartbeat();

    Promise.resolve()
      .then(() => this.factory(opts))
      .then(
        (host) => {
          if (match.closed || this.shutDown) {
            host.dispose();
            return;
          }
          match.host = host;
          const queued = match.queue;
          match.queue = [];
          for (const message of queued) {
            if (match.closed) break;
            this.apply(match, message);
          }
          if (match.closed) return;
          this.post({ t: 'created', matchId, tick: match.tick, tickInterval: this.interval / 1000 }, []);
          this.summaryDirty = true;
          this.ensureLoop();
        },
        (error: unknown) => {
          if (match.closed) return;
          this.close(match, 'map-failed', error);
        },
      );
  }

  private apply(match: HostedMatch, message: ToWorker): void {
    const host = match.host;
    if (!host) return;
    try {
      switch (message.t) {
        case 'add':
          host.addPlayer(message.playerId, message.info);
          match.emptySince = null;
          this.summaryDirty = true;
          break;
        case 'remove':
          host.removePlayer(message.playerId);
          this.summaryDirty = true;
          break;
        case 'input':
          host.onInput(message.playerId, new Uint8Array(message.data));
          break;
        case 'command':
          host.onCommand(message.playerId, message.cmd);
          this.summaryDirty = true;
          break;
        default:
          break;
      }
    } catch (error) {
      this.close(match, 'server-error', error);
    }
  }

  /** Closed by the worker: tell the pool, then forget it. */
  private close(match: HostedMatch, reason: CloseReason, error?: unknown): void {
    const message = error === undefined ? undefined : error instanceof Error ? error.message : String(error);
    this.drop(match);
    this.post({ t: 'closed', matchId: match.id, reason, message }, []);
  }

  /** Forget a match without telling the pool (it asked, or `close` will). */
  private drop(match: HostedMatch): void {
    if (match.closed) return;
    match.closed = true;
    this.matches.delete(match.id);
    try {
      match.host?.dispose();
    } catch {
      /* a host that cannot even dispose is gone either way */
    }
    match.host = null;
    match.queue = [];
    if (this.matches.size === 0) this.stopLoop();
  }

  // ── The tick ─────────────────────────────────────────────────────────────

  private runTick(now: number): void {
    this.stats.ticks += 1;
    const frames: MatchFrame[] = [];
    const transfer: ArrayBuffer[] = [];
    const seen = new Set<ArrayBuffer>();

    for (const match of [...this.matches.values()]) {
      const host = match.host;
      if (!host || match.closed) continue;
      let outgoing: OutgoingPacket[];
      try {
        host.tick();
        match.tick += 1;
        outgoing = host.drainOutgoing();
        if (host.isEmpty()) {
          match.emptySince ??= now;
          if (now - match.emptySince >= this.emptyGraceMs) {
            this.close(match, 'empty');
            continue;
          }
        } else {
          match.emptySince = null;
        }
      } catch (error) {
        this.close(match, 'server-error', error);
        continue;
      }
      if (outgoing.length === 0) continue;

      const packets: WirePacket[] = [];
      for (const packet of outgoing) {
        const data = ownedBuffer(packet.data, seen);
        transfer.push(data);
        packets.push({ to: packet.to, reliable: packet.reliable, data });
      }
      frames.push({ matchId: match.id, tick: match.tick, packets });
    }

    if (frames.length > 0) this.post({ t: 'frames', frames }, transfer);
  }

  private postSummaries(now: number): void {
    this.lastSummaryAt = now;
    this.summaryDirty = false;
    const items: Array<{ matchId: string; summary: ReturnType<MatchHost['summary']> }> = [];
    for (const match of [...this.matches.values()]) {
      if (!match.host) continue;
      try {
        items.push({ matchId: match.id, summary: match.host.summary() });
      } catch (error) {
        this.close(match, 'server-error', error);
      }
    }
    if (items.length > 0) this.post({ t: 'summaries', items }, []);
  }

  // ── The loop ─────────────────────────────────────────────────────────────

  private hasRunningMatch(): boolean {
    for (const match of this.matches.values()) if (match.host) return true;
    return false;
  }

  private ensureLoop(): void {
    if (!this.autoRun || this.shutDown) return;
    if (this.timer !== null || this.deferred) return;
    if (!this.running) {
      this.running = true;
      this.last = this.now();
      this.acc = 0;
    }
    this.scheduleNext();
  }

  private scheduleNext(): void {
    const wait = this.interval - this.earlyMs - this.acc - (this.now() - this.last);
    if (wait > 0) {
      this.timer = this.setTimer(() => {
        this.timer = null;
        this.wake();
      }, Math.max(1, Math.ceil(wait)));
    } else {
      this.deferred = true;
      this.defer(() => {
        this.deferred = false;
        this.wake();
      });
    }
  }

  private wake(): void {
    if (this.shutDown || !this.running) return;
    this.pump();
    if (this.hasRunningMatch()) this.scheduleNext();
    else this.stopLoop();
  }

  private stopLoop(): void {
    this.running = false;
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
    if (this.matches.size === 0 && this.heartbeat !== null) {
      this.clearTimer(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private ensureHeartbeat(): void {
    if (this.heartbeat !== null || !this.autoRun) return;
    const beat = () => {
      this.heartbeat = null;
      if (this.shutDown || this.matches.size === 0) return;
      this.post(
        {
          t: 'heartbeat',
          matches: this.matches.size,
          droppedTicks: this.stats.droppedTicks,
          tickCostMs: this.stats.tickCostMs,
        },
        [],
      );
      this.heartbeat = this.setTimer(beat, this.heartbeatMs);
    };
    this.heartbeat = this.setTimer(beat, this.heartbeatMs);
  }
}

/**
 * A buffer the runner may transfer: the packet's own buffer when the view
 * covers all of it and nothing else in this frame uses it, otherwise a copy.
 */
function ownedBuffer(view: Uint8Array, seen: Set<ArrayBuffer>): ArrayBuffer {
  const buffer = view.buffer;
  if (
    buffer instanceof ArrayBuffer &&
    view.byteOffset === 0 &&
    view.byteLength === buffer.byteLength &&
    !seen.has(buffer)
  ) {
    seen.add(buffer);
    return buffer;
  }
  // A copy with its own buffer (`Buffer#slice` would return a view).
  const copy = new Uint8Array(view).buffer as ArrayBuffer;
  seen.add(copy);
  return copy;
}
