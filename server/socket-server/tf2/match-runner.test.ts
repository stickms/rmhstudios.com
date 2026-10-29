/**
 * The match runner's clock and isolation — the loop every TF2 match runs on,
 * in the hub's worker thread and in the dev/test in-process fallback alike.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { MatchRunner, MAX_CATCH_UP_TICKS, TICK_INTERVAL_MS } from '@/lib/tf2-game/server/match-runner';
import { EchoMatchHost, createEchoMatch } from '@/lib/tf2-game/server/echo-host';
import type { MatchFactory, MatchHost, MatchOptions } from '@/lib/tf2-game/server/match-host';
import type { FromWorker } from '@/lib/tf2-game/server/worker-protocol';
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

interface Posted {
  message: FromWorker;
  transfer: ArrayBuffer[];
}

const runners: MatchRunner[] = [];
afterEach(() => {
  for (const r of runners.splice(0)) r.shutdown();
});

function fakeClockRunner(factory: MatchFactory = createEchoMatch, extra: Partial<ConstructorParameters<typeof MatchRunner>[0]> = {}) {
  let t = 1_000;
  const posted: Posted[] = [];
  const runner = new MatchRunner({
    factory,
    post: (message, transfer) => posted.push({ message, transfer }),
    now: () => t,
    autoRun: false,
    ...extra,
  });
  runners.push(runner);
  return {
    runner,
    posted,
    advance: (ms: number) => {
      t += ms;
    },
    of: <K extends FromWorker['t']>(kind: K) =>
      posted.map((p) => p.message).filter((m): m is Extract<FromWorker, { t: K }> => m.t === kind),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('the fixed-step clock', () => {
  it('runs one tick per 15 ms of accumulated time', async () => {
    const { runner, advance, of } = fakeClockRunner();
    runner.handle({ t: 'create', matchId: 'A', opts: opts('A') });
    await settle();
    expect(of('created')).toHaveLength(1);

    expect(runner.pump()).toBe(0); // starts the clock
    advance(TICK_INTERVAL_MS);
    expect(runner.pump()).toBe(1);
    advance(TICK_INTERVAL_MS * 3);
    expect(runner.pump()).toBe(3);
    advance(7);
    expect(runner.pump()).toBe(0);
    advance(8);
    expect(runner.pump()).toBe(1);
  });

  it('host_timescale paces the ticks (clamped 0.1–10), keeping the slot it was in', async () => {
    const { runner, advance } = fakeClockRunner();
    runner.handle({ t: 'create', matchId: 'A', opts: opts('A') });
    await settle();
    runner.pump();
    runner.setTimescale(2);
    advance(TICK_INTERVAL_MS * 2);
    expect(runner.pump()).toBe(4);
    runner.setTimescale(0.5);
    advance(TICK_INTERVAL_MS * 2);
    expect(runner.pump()).toBe(1);
    advance(TICK_INTERVAL_MS * 2);
    expect(runner.pump()).toBe(1);
    runner.setTimescale(100);
    expect(runner.timescale).toBe(10);
    runner.setTimescale(0);
    expect(runner.timescale).toBe(0.1);
  });

  it('caps catch-up at five ticks and drops the rest of the backlog', async () => {
    const { runner, advance } = fakeClockRunner();
    runner.handle({ t: 'create', matchId: 'A', opts: opts('A') });
    await settle();
    runner.pump();
    advance(200); // 13.3 ticks due
    expect(runner.pump()).toBe(MAX_CATCH_UP_TICKS);
    expect(runner.stats.droppedTicks).toBe(13 - MAX_CATCH_UP_TICKS);
    // The fractional remainder (5 ms) is kept, so the grid does not shift.
    advance(10);
    expect(runner.pump()).toBe(1);
  });

  it('does not drift under jittery wakeups', async () => {
    const { runner, advance } = fakeClockRunner();
    runner.handle({ t: 'create', matchId: 'A', opts: opts('A') });
    // A player, or the match closes as empty after a minute and the clock restarts.
    runner.handle({ t: 'add', matchId: 'A', playerId: 1, info: { name: 'p' } });
    await settle();
    runner.pump();
    let elapsed = 0;
    let ticks = 0;
    let seed = 7;
    for (let i = 0; i < 5_000; i += 1) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const step = 1 + (seed % 29); // 1–29 ms: never more than the catch-up cap
      advance(step);
      elapsed += step;
      ticks += runner.pump();
    }
    // Exact to the grid, give or take the one tick `earlyMs` may run ahead.
    expect(ticks).toBeGreaterThanOrEqual(Math.floor(elapsed / TICK_INTERVAL_MS));
    expect(ticks).toBeLessThanOrEqual(Math.floor((elapsed + 1) / TICK_INTERVAL_MS));
    expect(runner.stats.droppedTicks).toBe(0);
  });

  it('holds 66.67 Hz on the real clock without spinning', async () => {
    const posted: FromWorker[] = [];
    const runner = new MatchRunner({ factory: createEchoMatch, post: (m) => posted.push(m) });
    runners.push(runner);
    runner.handle({ t: 'create', matchId: 'A', opts: opts('A') });
    runner.handle({ t: 'add', matchId: 'A', playerId: 1, info: { name: 'p' } });
    await until(() => posted.some((m) => m.t === 'created'), 1_000, 'created');

    const startTicks = runner.stats.ticks;
    const startWakeups = runner.stats.wakeups;
    const started = performance.now();
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const seconds = (performance.now() - started) / 1_000;
    const rate = (runner.stats.ticks - startTicks) / seconds;
    expect(rate).toBeGreaterThan(62);
    expect(rate).toBeLessThan(70);
    // Sleeping between ticks, not polling: a handful of wakeups per tick at most.
    expect(runner.stats.wakeups - startWakeups).toBeLessThan((runner.stats.ticks - startTicks) * 2 + 5);

    // One `frames` message per tick, each carrying the snapshot.
    const frames = posted.filter((m): m is Extract<FromWorker, { t: 'frames' }> => m.t === 'frames');
    expect(frames.length).toBeGreaterThan(50);
    expect(frames.every((f) => f.frames.length === 1 && f.frames[0].packets.length === 1)).toBe(true);
  });

  it('stops the loop when the last match goes', async () => {
    const posted: FromWorker[] = [];
    const runner = new MatchRunner({ factory: createEchoMatch, post: (m) => posted.push(m) });
    runners.push(runner);
    runner.handle({ t: 'create', matchId: 'A', opts: opts('A') });
    await until(() => posted.some((m) => m.t === 'created'), 1_000, 'created');
    await new Promise((resolve) => setTimeout(resolve, 50));
    runner.handle({ t: 'dispose', matchId: 'A' });
    const ticks = runner.stats.ticks;
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(runner.stats.ticks).toBe(ticks);
    expect(runner.matchCount).toBe(0);
  });
});

describe('messages and output', () => {
  it('queues messages for a match that is still loading and replays them in order', async () => {
    let release: (host: MatchHost) => void = () => {};
    const host = new EchoMatchHost(opts('A'));
    const factory: MatchFactory = () => new Promise((resolve) => (release = resolve));
    const { runner, advance, of } = fakeClockRunner(factory);

    runner.handle({ t: 'create', matchId: 'A', opts: opts('A') });
    runner.handle({ t: 'add', matchId: 'A', playerId: 1, info: { name: 'p' } });
    runner.handle({ t: 'command', matchId: 'A', playerId: 1, cmd: { kind: 'team', team: 'blue' } });
    runner.handle({ t: 'input', matchId: 'A', playerId: 1, data: new Uint8Array([5]).buffer });
    await settle();
    expect(of('created')).toHaveLength(0);

    release(host);
    await settle();
    expect(of('created')).toHaveLength(1);
    expect(host.commands).toEqual([{ id: 1, cmd: { kind: 'team', team: 'blue' } }]);

    runner.pump();
    advance(TICK_INTERVAL_MS);
    runner.pump();
    const [frame] = of('frames');
    const reliable = frame.frames[0].packets.find((p) => p.reliable)!;
    expect([...new Uint8Array(reliable.data)]).toEqual([0xec, 5]);
  });

  it('posts every match in one message per tick and transfers each buffer once', async () => {
    const shared = new Uint8Array(4);
    const factory: MatchFactory = async (o) => {
      const host = new EchoMatchHost(o);
      const drain = host.drainOutgoing.bind(host);
      // Two packets that share one buffer, and a view into a larger one.
      host.drainOutgoing = () => [
        ...drain(),
        { to: 'all', reliable: true, data: shared },
        { to: 'all', reliable: true, data: shared },
        { to: 1, reliable: false, data: new Uint8Array(16).subarray(4, 8) },
      ];
      return host;
    };
    const { runner, advance, posted } = fakeClockRunner(factory);
    runner.handle({ t: 'create', matchId: 'A', opts: opts('A') });
    runner.handle({ t: 'create', matchId: 'B', opts: opts('B') });
    await settle();
    runner.pump();
    advance(TICK_INTERVAL_MS);
    runner.pump();

    const frames = posted.filter((p) => p.message.t === 'frames');
    expect(frames).toHaveLength(1);
    const message = frames[0].message as Extract<FromWorker, { t: 'frames' }>;
    expect(message.frames.map((f) => f.matchId).sort()).toEqual(['A', 'B']);
    const transfer = frames[0].transfer;
    expect(new Set(transfer).size).toBe(transfer.length);
    for (const f of message.frames) {
      for (const p of f.packets) expect(transfer).toContain(p.data);
      expect(f.packets[2].data.byteLength).toBe(4);
    }
  });

  it('closes a host that throws and keeps the others running', async () => {
    const factory: MatchFactory = async (o) => {
      const host = new EchoMatchHost(o);
      if (o.matchId === 'BAD') {
        host.tick = () => {
          throw new Error('boom');
        };
      }
      return host;
    };
    const { runner, advance, of } = fakeClockRunner(factory);
    runner.handle({ t: 'create', matchId: 'GOOD', opts: opts('GOOD') });
    runner.handle({ t: 'create', matchId: 'BAD', opts: opts('BAD') });
    runner.handle({ t: 'add', matchId: 'GOOD', playerId: 1, info: { name: 'p' } });
    await settle();
    runner.pump();
    advance(TICK_INTERVAL_MS * 2);
    expect(runner.pump()).toBe(2);
    expect(of('closed')).toEqual([{ t: 'closed', matchId: 'BAD', reason: 'server-error', message: 'boom' }]);
    expect(runner.matchCount).toBe(1);
    expect(of('frames').every((f) => f.frames.every((x) => x.matchId === 'GOOD'))).toBe(true);
    expect(of('frames')).toHaveLength(2);
  });

  it('reports a factory that rejects as map-failed', async () => {
    const { runner, of } = fakeClockRunner(async () => {
      throw new Error('404 maps/ctf_2fort.pkg');
    });
    runner.handle({ t: 'create', matchId: 'A', opts: opts('A') });
    await settle();
    expect(of('closed')).toEqual([
      { t: 'closed', matchId: 'A', reason: 'map-failed', message: '404 maps/ctf_2fort.pkg' },
    ]);
    expect(runner.matchCount).toBe(0);
  });

  it('closes a match that stays empty past the grace', async () => {
    const { runner, advance, of } = fakeClockRunner(createEchoMatch, { emptyGraceMs: 100 });
    runner.handle({ t: 'create', matchId: 'A', opts: opts('A') });
    await settle();
    runner.pump();
    for (let i = 0; i < 10; i += 1) {
      advance(TICK_INTERVAL_MS);
      runner.pump();
    }
    expect(of('closed')).toEqual([{ t: 'closed', matchId: 'A', reason: 'empty', message: undefined }]);
  });

  it('sends summaries on a cadence, sooner after a change', async () => {
    const { runner, advance, of } = fakeClockRunner(createEchoMatch, { summaryIntervalMs: 1_000 });
    runner.handle({ t: 'create', matchId: 'A', opts: opts('A') });
    await settle();
    runner.pump();
    expect(of('summaries')).toHaveLength(1);
    advance(300);
    runner.pump();
    expect(of('summaries')).toHaveLength(1);
    runner.handle({ t: 'add', matchId: 'A', playerId: 3, info: { name: 'Scout' } });
    advance(15);
    runner.pump();
    const latest = of('summaries').at(-1)!;
    expect(of('summaries')).toHaveLength(2);
    expect(latest.items[0].summary.players.map((p) => p.name)).toEqual(['Scout']);
  });
});
