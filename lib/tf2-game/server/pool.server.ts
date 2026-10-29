/**
 * The TF2 match pool — lives in the games hub process and runs every match on
 * a `worker_threads` worker (`./match-worker.server.ts`), never on the hub's
 * event loop (the rule in server/socket-server/handlers/bums-rush.ts).
 *
 * - Up to `TF2_MAX_WORKERS` threads (default 1 — the `socket` container has one
 *   CPU), spawned on demand; a match goes to the least-loaded thread, and a new
 *   thread is spawned only while every existing one is busy.
 * - At most `TF2_MAX_MATCHES` matches in total (default 4); the hub caps humans
 *   per match at 24.
 * - Each thread has its own heap ceiling (`TF2_WORKER_HEAP_MB`, default 256) so
 *   a leaking match kills its thread, not the hub.
 * - A thread that exits unexpectedly, or stops heartbeating (a host stuck in a
 *   loop), is terminated and its matches are closed with `server-error` for the
 *   hub to tell their players; a replacement is spawned after a backoff.
 *
 * ## Where the worker comes from
 *
 * In production the worker is its own esbuild bundle,
 * `dist-server/lib/tf2-game/server/match-worker.server.cjs` (package.json
 * `build` and the Dockerfile `server-builder` stage both build and the latter
 * asserts it). `resolveWorkerPath` finds it from the hub bundle's `__dirname`
 * the way `lib/slice-it/beatmap/spectrum.parallel.server.ts` finds its STFT
 * worker. If it is missing from a bundled hub, TF2 is UNAVAILABLE — the pool
 * refuses matches and logs why — rather than quietly simulating on the hub.
 *
 * Running from source (`tsx` dev, Vitest) there is no compiled worker to trust
 * (a `dist-server` left over from an old build would run old code), so the pool
 * runs matches in-process on a `MatchRunner` instead, unless `TF2_WORKER_PATH`
 * names a worker bundle explicitly.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';

import { createTf2Match } from './create-match';
import type { MatchCommand, MatchFactory, MatchOptions, PlayerInfo, RoomSummary } from './match-host';
import { MatchRunner } from './match-runner';
import type { FromWorker, ToWorker, WirePacket } from './worker-protocol';
import type { Catalog } from '../../tf2-loadout/catalog-types';

export const TF2_MAX_PLAYERS_PER_MATCH = 24;
const WORKER_BUNDLE = 'lib/tf2-game/server/match-worker.server.cjs';

export type PoolCloseReason = 'map-failed' | 'server-error' | 'empty';

/** What the hub hears about one match. Calls never throw into the pool. */
export interface MatchListener {
  /** The map loaded and the match is ticking. */
  onReady(info: { tick: number; tickInterval: number }): void;
  /** The match's packets for one tick. */
  onFrame(tick: number, packets: WirePacket[]): void;
  onSummary(summary: RoomSummary): void;
  /** The match is gone (it was not disposed by the hub). */
  onClosed(reason: PoolCloseReason, message?: string): void;
}

export interface MatchHandle {
  readonly matchId: string;
  addPlayer(playerId: number, info: PlayerInfo): void;
  removePlayer(playerId: number): void;
  /** Copied before it crosses threads — socket.io's Buffer is a pooled view. */
  input(playerId: number, bytes: Uint8Array): void;
  command(playerId: number, cmd: MatchCommand): void;
  /** Close the match from the hub's side. The listener is not called. */
  dispose(): void;
}

export type CreateMatchResult =
  | { ok: true; handle: MatchHandle }
  | { ok: false; error: 'capacity' | 'unavailable' };

export type PoolMode = 'threads' | 'in-process' | 'unavailable';

export interface PoolLogger {
  info(entry: { event: string; [key: string]: unknown }): void;
  warn(entry: { event: string; [key: string]: unknown }): void;
  error(entry: { event: string; [key: string]: unknown }): void;
}

/** The thread (or in-process stand-in) the pool talks to. */
export interface WorkerLike {
  postMessage(message: ToWorker, transfer?: ArrayBuffer[]): void;
  terminate(): void;
}

export interface WorkerEvents {
  onMessage(message: FromWorker): void;
  /** Exactly once, however the worker ended. */
  onExit(code: number, error?: unknown): void;
}

export interface MatchPoolOptions {
  maxWorkers?: number;
  maxMatches?: number;
  /**
   * The compiled worker. `undefined` → resolve it (see the file comment);
   * `null` → none (in-process when allowed, else unavailable).
   */
  workerPath?: string | null;
  /** Default: only when running from source (tsx / Vitest). */
  allowInProcess?: boolean;
  /** The game the in-process fallback runs. Threads always run `createTf2Match`. */
  factory?: MatchFactory;
  heapMb?: number;
  /** A thread hosting matches that is silent this long is terminated. */
  watchdogMs?: number;
  /** Delay before replacing a crashed thread, by consecutive-crash count (1, 2, …). */
  respawnDelayMs?: (crashes: number) => number;
  logger?: PoolLogger;
  /** Test seam: how a worker is started. */
  spawn?: (events: WorkerEvents) => WorkerLike;
}

interface Slot {
  id: number;
  worker: WorkerLike;
  matches: Set<string>;
  spawnedAt: number;
  lastSeen: number;
  /** Set when the pool itself is ending the thread (shutdown). */
  retiring: boolean;
  exited: boolean;
  droppedTicks: number;
}

interface Entry {
  matchId: string;
  slot: Slot;
  listener: MatchListener;
}

const SILENT: PoolLogger = { info: () => {}, warn: () => {}, error: () => {} };

function envCount(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return fallback;
  const value = Number(raw);
  return value >= min && value <= max ? value : fallback;
}

/** True under `tsx` (ESM: no `__filename`) or Vitest (a `.ts` `__filename`); false in the esbuild bundle. */
export function runningFromSource(): boolean {
  return typeof __filename !== 'string' || /\.[cm]?tsx?$/.test(__filename);
}

/**
 * Where esbuild put the worker. The hub bundle is
 * `dist-server/server/socket-server/index.cjs` and the build uses
 * `--outbase=.`, so the worker is two directories up and across.
 */
export function resolveWorkerPath(): string | null {
  const explicit = process.env.TF2_WORKER_PATH?.trim();
  if (explicit) return existsSync(explicit) ? path.resolve(explicit) : null;
  if (runningFromSource()) return null;

  const candidates: string[] = [];
  if (typeof __dirname === 'string') {
    candidates.push(path.resolve(__dirname, '../..', WORKER_BUNDLE));
    candidates.push(path.resolve(__dirname, path.basename(WORKER_BUNDLE)));
  }
  candidates.push(path.resolve(process.cwd(), 'dist-server', WORKER_BUNDLE));
  for (const candidate of candidates) {
    try {
      if (existsSync(candidate)) return candidate;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** A real thread. */
function spawnThread(workerPath: string, heapMb: number, events: WorkerEvents): WorkerLike {
  const worker = new Worker(workerPath, {
    name: 'tf2-match',
    resourceLimits: { maxOldGenerationSizeMb: heapMb },
  });
  let lastError: unknown;
  let exited = false;
  worker.on('message', (message: FromWorker) => events.onMessage(message));
  worker.on('error', (error) => {
    lastError = error;
  });
  worker.on('exit', (code) => {
    if (exited) return;
    exited = true;
    events.onExit(code, lastError);
  });
  return {
    postMessage: (message, transfer) => worker.postMessage(message, transfer ?? []),
    terminate: () => void worker.terminate(),
  };
}

/**
 * The dev/test stand-in: a `MatchRunner` on this thread, with asynchronous
 * delivery both ways so callers see the same ordering they would with a thread.
 */
export function spawnInProcess(factory: MatchFactory, events: WorkerEvents): WorkerLike {
  let alive = true;
  const runner = new MatchRunner({
    factory,
    post: (message) => {
      setImmediate(() => {
        if (alive) events.onMessage(message);
      });
    },
  });
  setImmediate(() => {
    if (alive) events.onMessage({ t: 'ready' });
  });
  return {
    postMessage: (message) => {
      queueMicrotask(() => {
        if (alive) runner.handle(message);
      });
    },
    terminate: () => {
      if (!alive) return;
      alive = false;
      runner.shutdown();
      setImmediate(() => events.onExit(0));
    },
  };
}

export class MatchPool {
  readonly mode: PoolMode;
  private readonly maxWorkers: number;
  private readonly maxMatches: number;
  private readonly heapMb: number;
  private readonly watchdogMs: number;
  private readonly respawnDelayMs: (crashes: number) => number;
  private readonly log: PoolLogger;
  private readonly spawnWorker: ((events: WorkerEvents) => WorkerLike) | null;

  private readonly slots: Slot[] = [];
  private readonly entries = new Map<string, Entry>();
  private nextSlotId = 1;
  private crashes = 0;
  private respawnTimer: ReturnType<typeof setTimeout> | null = null;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  /** The item schema every worker gets (sim/items; `setItemCatalog`). */
  private itemCatalog: Catalog | null = null;

  constructor(options: MatchPoolOptions = {}) {
    this.maxWorkers = options.maxWorkers ?? envCount('TF2_MAX_WORKERS', 1, 1, 16);
    this.maxMatches = options.maxMatches ?? envCount('TF2_MAX_MATCHES', 4, 0, 256);
    this.heapMb = options.heapMb ?? envCount('TF2_WORKER_HEAP_MB', 256, 32, 4096);
    this.watchdogMs = options.watchdogMs ?? 10_000;
    this.respawnDelayMs = options.respawnDelayMs ?? ((n) => Math.min(30_000, 1_000 * 2 ** (n - 1)));
    this.log = options.logger ?? SILENT;

    if (options.spawn) {
      this.mode = 'threads';
      this.spawnWorker = options.spawn;
      return;
    }
    const workerPath = options.workerPath === undefined ? resolveWorkerPath() : options.workerPath;
    const allowInProcess = options.allowInProcess ?? runningFromSource();
    if (workerPath) {
      this.mode = 'threads';
      this.spawnWorker = (events) => spawnThread(workerPath, this.heapMb, events);
      this.log.info({ event: 'tf2_pool_threads', workerPath, maxWorkers: this.maxWorkers });
    } else if (allowInProcess) {
      const factory = options.factory ?? createTf2Match;
      this.mode = 'in-process';
      this.spawnWorker = (events) => spawnInProcess(factory, events);
      this.log.warn({
        event: 'tf2_pool_in_process',
        message: 'TF2 matches run on the hub thread (dev/test only — no compiled match worker)',
      });
    } else {
      this.mode = 'unavailable';
      this.spawnWorker = null;
      this.log.error({
        event: 'tf2_pool_unavailable',
        message: `match worker bundle not found (${WORKER_BUNDLE}); TF2 matches are disabled`,
      });
    }
  }

  get matchCount(): number {
    return this.entries.size;
  }

  get workerCount(): number {
    return this.slots.length;
  }

  get capacity(): number {
    return this.mode === 'unavailable' ? 0 : this.maxMatches;
  }

  createMatch(opts: MatchOptions, listener: MatchListener): CreateMatchResult {
    if (this.closed || !this.spawnWorker) return { ok: false, error: 'unavailable' };
    if (this.entries.size >= this.maxMatches) return { ok: false, error: 'capacity' };
    if (this.entries.has(opts.matchId)) return { ok: false, error: 'capacity' };

    const slot = this.pickSlot();
    const entry: Entry = { matchId: opts.matchId, slot, listener };
    this.entries.set(opts.matchId, entry);
    slot.matches.add(opts.matchId);
    slot.worker.postMessage({ t: 'create', matchId: opts.matchId, opts });
    this.ensureWatchdog();

    const send = (message: ToWorker, transfer?: ArrayBuffer[]) => {
      if (this.entries.get(opts.matchId) !== entry) return;
      entry.slot.worker.postMessage(message, transfer);
    };
    const matchId = opts.matchId;
    return {
      ok: true,
      handle: {
        matchId,
        addPlayer: (playerId, info) => send({ t: 'add', matchId, playerId, info }),
        removePlayer: (playerId) => send({ t: 'remove', matchId, playerId }),
        input: (playerId, bytes) => {
          // `new Uint8Array(view)` copies; `Buffer#slice` would NOT (it is a view
          // into socket.io's pooled allocation, which would then be transferred).
          const data = new Uint8Array(bytes).buffer as ArrayBuffer;
          send({ t: 'input', matchId, playerId, data }, [data]);
        },
        command: (playerId, cmd) => send({ t: 'command', matchId, playerId, cmd }),
        dispose: () => {
          if (this.entries.get(matchId) !== entry) return;
          send({ t: 'dispose', matchId });
          this.forget(entry);
        },
      },
    };
  }

  /**
   * The item schema (the loadout builder's catalog) for every match: sent to each worker now and
   * to every worker spawned later, so a crash-replaced thread has it too.
   */
  setItemCatalog(catalog: Catalog | null): void {
    this.itemCatalog = catalog;
    for (const slot of this.slots) {
      try {
        slot.worker.postMessage({ t: 'items', catalog });
      } catch {
        /* a worker going away gets it again when it is replaced */
      }
    }
  }

  /** Stop everything. Matches are dropped without listener calls (the hub is going away). */
  shutdown(): void {
    this.closed = true;
    if (this.respawnTimer) clearTimeout(this.respawnTimer);
    if (this.watchdog) clearInterval(this.watchdog);
    this.respawnTimer = null;
    this.watchdog = null;
    this.entries.clear();
    for (const slot of this.slots.splice(0)) {
      slot.retiring = true;
      try {
        slot.worker.postMessage({ t: 'shutdown' });
      } catch {
        /* already gone */
      }
      slot.worker.terminate();
    }
  }

  // ── Slots ─────────────────────────────────────────────────────────────────

  private pickSlot(): Slot {
    let best: Slot | null = null;
    for (const slot of this.slots) {
      if (!best || slot.matches.size < best.matches.size) best = slot;
    }
    if (!best || (best.matches.size > 0 && this.slots.length < this.maxWorkers)) {
      return this.spawnSlot();
    }
    return best;
  }

  private spawnSlot(): Slot {
    const now = Date.now();
    const slot: Slot = {
      id: this.nextSlotId++,
      worker: { postMessage: () => {}, terminate: () => {} },
      matches: new Set(),
      spawnedAt: now,
      lastSeen: now,
      retiring: false,
      exited: false,
      droppedTicks: 0,
    };
    slot.worker = this.spawnWorker!({
      onMessage: (message) => this.onWorkerMessage(slot, message),
      onExit: (code, error) => this.onWorkerExit(slot, code, error),
    });
    if (this.itemCatalog) slot.worker.postMessage({ t: 'items', catalog: this.itemCatalog });
    this.slots.push(slot);
    return slot;
  }

  private onWorkerMessage(slot: Slot, message: FromWorker): void {
    slot.lastSeen = Date.now();
    switch (message.t) {
      case 'ready':
        return;
      case 'heartbeat':
        if (message.droppedTicks > slot.droppedTicks) {
          this.log.warn({
            event: 'tf2_worker_behind',
            worker: slot.id,
            droppedTicks: message.droppedTicks - slot.droppedTicks,
            tickCostMs: Math.round(message.tickCostMs * 100) / 100,
            matches: message.matches,
          });
          slot.droppedTicks = message.droppedTicks;
        }
        return;
      case 'created': {
        const entry = this.entryOn(slot, message.matchId);
        if (entry) safely(() => entry.listener.onReady({ tick: message.tick, tickInterval: message.tickInterval }));
        return;
      }
      case 'frames':
        for (const frame of message.frames) {
          const entry = this.entryOn(slot, frame.matchId);
          if (entry) safely(() => entry.listener.onFrame(frame.tick, frame.packets));
        }
        return;
      case 'summaries':
        for (const item of message.items) {
          const entry = this.entryOn(slot, item.matchId);
          if (entry) safely(() => entry.listener.onSummary(item.summary));
        }
        return;
      case 'closed': {
        const entry = this.entryOn(slot, message.matchId);
        if (!entry) return;
        this.forget(entry);
        if (message.reason !== 'empty') {
          this.log.warn({
            event: 'tf2_match_closed',
            matchId: message.matchId,
            reason: message.reason,
            message: message.message,
          });
        }
        safely(() => entry.listener.onClosed(message.reason, message.message));
        return;
      }
      default:
        return;
    }
  }

  private onWorkerExit(slot: Slot, code: number, error?: unknown): void {
    if (slot.exited) return;
    slot.exited = true;
    const index = this.slots.indexOf(slot);
    if (index !== -1) this.slots.splice(index, 1);
    if (slot.retiring || this.closed) return;

    const lived = Date.now() - slot.spawnedAt;
    this.crashes = lived > 60_000 ? 1 : this.crashes + 1;
    const orphaned = [...slot.matches]
      .map((id) => this.entries.get(id))
      .filter((e): e is Entry => !!e && e.slot === slot);
    this.log.error({
      event: 'tf2_worker_crashed',
      worker: slot.id,
      code,
      error: error instanceof Error ? error.message : error === undefined ? undefined : String(error),
      matches: orphaned.length,
    });
    for (const entry of orphaned) {
      this.forget(entry);
      safely(() => entry.listener.onClosed('server-error', 'match worker crashed'));
    }
    this.scheduleRespawn();
  }

  /** Replace a crashed thread so the next match does not pay the startup. */
  private scheduleRespawn(): void {
    if (this.respawnTimer || this.closed) return;
    const delay = this.respawnDelayMs(this.crashes);
    this.respawnTimer = setTimeout(() => {
      this.respawnTimer = null;
      if (this.closed || this.slots.length >= this.maxWorkers) return;
      this.spawnSlot();
      this.log.info({ event: 'tf2_worker_respawned', crashes: this.crashes });
    }, delay);
    this.respawnTimer.unref?.();
  }

  private ensureWatchdog(): void {
    if (this.watchdog || this.mode === 'in-process') return;
    this.watchdog = setInterval(() => {
      const now = Date.now();
      for (const slot of [...this.slots]) {
        if (slot.matches.size === 0 || now - slot.lastSeen < this.watchdogMs) continue;
        this.log.error({ event: 'tf2_worker_unresponsive', worker: slot.id, silentMs: now - slot.lastSeen });
        // Its exit closes the matches and schedules the replacement.
        slot.worker.terminate();
      }
    }, Math.max(250, Math.floor(this.watchdogMs / 2)));
    this.watchdog.unref?.();
  }

  private entryOn(slot: Slot, matchId: string): Entry | null {
    const entry = this.entries.get(matchId);
    return entry && entry.slot === slot ? entry : null;
  }

  private forget(entry: Entry): void {
    if (this.entries.get(entry.matchId) === entry) this.entries.delete(entry.matchId);
    entry.slot.matches.delete(entry.matchId);
  }
}

function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    /* a listener bug must not take the pool down */
  }
}

// ─── The hub's pool ─────────────────────────────────────────────────────────

let shared: MatchPool | null = null;

/** The hub's pool, created on first use with the `TF2_*` env settings. */
export function getMatchPool(logger?: PoolLogger): MatchPool {
  shared ??= new MatchPool({ logger });
  return shared;
}

/** Test seam: replace (or clear) the hub's pool. */
export function setMatchPool(pool: MatchPool | null): void {
  shared = pool;
}
