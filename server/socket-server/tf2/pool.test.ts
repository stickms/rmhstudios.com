/**
 * The match pool's policy: caps, placement across threads, crash and hang
 * recovery, and refusing to simulate on the hub when no worker exists.
 * Threads are faked through the `spawn` seam; worker-thread.test.ts runs a real one.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MatchPool,
  type MatchListener,
  type WorkerEvents,
  type WorkerLike,
} from '@/lib/tf2-game/server/pool.server';
import type { MatchOptions } from '@/lib/tf2-game/server/match-host';
import type { ToWorker } from '@/lib/tf2-game/server/worker-protocol';
import { until } from './helpers';

const opts = (matchId: string): MatchOptions => ({
  matchId,
  map: 'ctf_2fort',
  mode: 'ctf',
  maxPlayers: 24,
  botCount: 0,
  botDifficulty: 'normal',
  name: 'test',
  seed: 1,
});

function listener(): MatchListener & { closed: string[]; ready: number } {
  const l = {
    closed: [] as string[],
    ready: 0,
    onReady: () => {
      l.ready += 1;
    },
    onFrame: () => {},
    onSummary: () => {},
    onClosed: (reason: string) => {
      l.closed.push(reason);
    },
  };
  return l;
}

interface FakeWorker extends WorkerLike {
  id: number;
  inbox: Array<{ message: ToWorker; transfer?: ArrayBuffer[] }>;
  events: WorkerEvents;
  terminated: boolean;
}

function fakeThreads() {
  const workers: FakeWorker[] = [];
  const spawn = (events: WorkerEvents): WorkerLike => {
    const worker: FakeWorker = {
      id: workers.length + 1,
      inbox: [],
      events,
      terminated: false,
      postMessage: (message, transfer) => worker.inbox.push({ message, transfer }),
      terminate: () => {
        if (worker.terminated) return;
        worker.terminated = true;
        setTimeout(() => events.onExit(1), 0);
      },
    };
    workers.push(worker);
    return worker;
  };
  return { workers, spawn };
}

const pools: MatchPool[] = [];
afterEach(() => {
  for (const p of pools.splice(0)) p.shutdown();
  vi.useRealTimers();
});
function track(pool: MatchPool): MatchPool {
  pools.push(pool);
  return pool;
}

describe('capacity', () => {
  it('caps total matches and frees a slot when one is disposed', () => {
    const { spawn } = fakeThreads();
    const pool = track(new MatchPool({ spawn, maxMatches: 2, maxWorkers: 1 }));
    const a = pool.createMatch(opts('A'), listener());
    const b = pool.createMatch(opts('B'), listener());
    expect(a.ok && b.ok).toBe(true);
    expect(pool.createMatch(opts('C'), listener())).toEqual({ ok: false, error: 'capacity' });
    if (a.ok) a.handle.dispose();
    expect(pool.createMatch(opts('C'), listener()).ok).toBe(true);
  });

  it('reads TF2_MAX_MATCHES and TF2_MAX_WORKERS from the environment', () => {
    vi.stubEnv('TF2_MAX_MATCHES', '1');
    vi.stubEnv('TF2_MAX_WORKERS', 'lots');
    try {
      const { spawn, workers } = fakeThreads();
      const pool = track(new MatchPool({ spawn }));
      expect(pool.capacity).toBe(1);
      pool.createMatch(opts('A'), listener());
      expect(pool.createMatch(opts('B'), listener())).toEqual({ ok: false, error: 'capacity' });
      expect(workers).toHaveLength(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('refuses a duplicate match id', () => {
    const { spawn } = fakeThreads();
    const pool = track(new MatchPool({ spawn, maxMatches: 4 }));
    pool.createMatch(opts('A'), listener());
    expect(pool.createMatch(opts('A'), listener()).ok).toBe(false);
  });

  it('is unavailable — never in-process — when a bundled hub has no worker', () => {
    const pool = track(new MatchPool({ workerPath: null, allowInProcess: false }));
    expect(pool.mode).toBe('unavailable');
    expect(pool.capacity).toBe(0);
    expect(pool.createMatch(opts('A'), listener())).toEqual({ ok: false, error: 'unavailable' });
  });

  it('runs in-process from source (tests / tsx) when no worker path is given', () => {
    const pool = track(new MatchPool({ workerPath: null }));
    expect(pool.mode).toBe('in-process');
  });
});

describe('placement', () => {
  it('spawns threads on demand and fills the least-loaded one', () => {
    const { spawn, workers } = fakeThreads();
    const pool = track(new MatchPool({ spawn, maxWorkers: 2, maxMatches: 8 }));
    expect(workers).toHaveLength(0);
    pool.createMatch(opts('A'), listener());
    pool.createMatch(opts('B'), listener());
    pool.createMatch(opts('C'), listener());
    pool.createMatch(opts('D'), listener());
    expect(workers).toHaveLength(2);
    const created = (w: FakeWorker) =>
      w.inbox.filter((m) => m.message.t === 'create').map((m) => (m.message as { matchId: string }).matchId);
    expect(created(workers[0])).toEqual(['A', 'C']);
    expect(created(workers[1])).toEqual(['B', 'D']);
  });

  it('routes a match’s messages to its own thread and copies input before transferring it', () => {
    const { spawn, workers } = fakeThreads();
    const pool = track(new MatchPool({ spawn, maxWorkers: 2, maxMatches: 8 }));
    pool.createMatch(opts('A'), listener());
    const b = pool.createMatch(opts('B'), listener());
    if (!b.ok) throw new Error('no match');

    const pooled = Buffer.alloc(64);
    const view = pooled.subarray(10, 13);
    view.set([7, 8, 9]);
    b.handle.input(4, view);
    const posted = workers[1].inbox.at(-1)!;
    expect(posted.message).toMatchObject({ t: 'input', matchId: 'B', playerId: 4 });
    const data = (posted.message as { data: ArrayBuffer }).data;
    expect(data.byteLength).toBe(3);
    expect(data).not.toBe(pooled.buffer);
    expect([...new Uint8Array(data)]).toEqual([7, 8, 9]);
    expect(posted.transfer).toEqual([data]);
    expect(workers[0].inbox.some((m) => m.message.t === 'input')).toBe(false);
  });

  it('delivers worker messages to the right listener only', () => {
    const { spawn, workers } = fakeThreads();
    const pool = track(new MatchPool({ spawn, maxMatches: 4 }));
    const la = listener();
    const lb = listener();
    pool.createMatch(opts('A'), la);
    pool.createMatch(opts('B'), lb);
    workers[0].events.onMessage({ t: 'created', matchId: 'B', tick: 0, tickInterval: 0.015 });
    expect([la.ready, lb.ready]).toEqual([0, 1]);
    workers[0].events.onMessage({ t: 'closed', matchId: 'A', reason: 'map-failed' });
    expect(la.closed).toEqual(['map-failed']);
    expect(pool.matchCount).toBe(1);
  });
});

describe('recovery', () => {
  it('closes a crashed thread’s matches and spawns a replacement', async () => {
    const { spawn, workers } = fakeThreads();
    const pool = track(new MatchPool({ spawn, maxMatches: 4, respawnDelayMs: () => 10 }));
    const la = listener();
    const lb = listener();
    pool.createMatch(opts('A'), la);
    pool.createMatch(opts('B'), lb);
    expect(pool.workerCount).toBe(1);

    workers[0].events.onExit(1, new Error('ERR_WORKER_OUT_OF_MEMORY'));
    expect(la.closed).toEqual(['server-error']);
    expect(lb.closed).toEqual(['server-error']);
    expect(pool.matchCount).toBe(0);
    expect(pool.workerCount).toBe(0);

    await until(() => pool.workerCount === 1, 1_000, 'respawn');
    expect(workers).toHaveLength(2);
    // The replacement takes new matches.
    pool.createMatch(opts('C'), listener());
    expect(workers[1].inbox.at(-1)?.message).toMatchObject({ t: 'create', matchId: 'C' });
  });

  it('terminates a thread that stops heartbeating', async () => {
    const { spawn, workers } = fakeThreads();
    const pool = track(
      new MatchPool({ spawn, maxMatches: 4, watchdogMs: 300, respawnDelayMs: () => 60_000 }),
    );
    const l = listener();
    pool.createMatch(opts('A'), l);
    await until(() => workers[0].terminated, 2_000, 'watchdog');
    await until(() => l.closed.length > 0, 1_000, 'closed');
    expect(l.closed).toEqual(['server-error']);
  });

  it('leaves a heartbeating thread alone', async () => {
    const { spawn, workers } = fakeThreads();
    const pool = track(new MatchPool({ spawn, maxMatches: 4, watchdogMs: 300 }));
    pool.createMatch(opts('A'), listener());
    const beat = setInterval(
      () => workers[0].events.onMessage({ t: 'heartbeat', matches: 1, droppedTicks: 0, tickCostMs: 0.1 }),
      50,
    );
    await new Promise((resolve) => setTimeout(resolve, 800));
    clearInterval(beat);
    expect(workers[0].terminated).toBe(false);
  });

  it('does not treat its own shutdown as a crash', async () => {
    const { spawn, workers } = fakeThreads();
    const pool = new MatchPool({ spawn, maxMatches: 4, respawnDelayMs: () => 1 });
    const l = listener();
    pool.createMatch(opts('A'), l);
    pool.shutdown();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(workers[0].inbox.at(-1)?.message).toEqual({ t: 'shutdown' });
    expect(l.closed).toEqual([]);
    expect(workers).toHaveLength(1);
    expect(pool.createMatch(opts('B'), listener())).toEqual({ ok: false, error: 'unavailable' });
  });
});
