/**
 * Offline pause (the pause menu / in-game HUD editor over a listen-server
 * match): the runner runs no ticks while paused, owes none for the paused
 * time, and resumes ticking on release.
 */
import { describe, expect, it } from 'vitest';
import { MatchRunner } from './match-runner';
import type { MatchHost } from './match-host';
import { matchOptions } from './match.test-support';

function fakeHost(counter: { ticks: number }): MatchHost {
  return {
    addPlayer() {},
    removePlayer() {},
    onInput() {},
    onCommand() {},
    tick() {
      counter.ticks++;
    },
    drainOutgoing: () => [],
    isEmpty: () => false,
    summary: () => ({}) as ReturnType<MatchHost['summary']>,
    dispose() {},
  };
}

describe('MatchRunner.setPaused', () => {
  it('holds the match still and owes no ticks for the pause', async () => {
    let now = 0;
    const timers: Array<{ at: number; fn: () => void }> = [];
    const counter = { ticks: 0 };
    const runner = new MatchRunner({
      factory: async () => fakeHost(counter),
      post: () => {},
      now: () => now,
      setTimer: (fn, ms) => {
        const t = { at: now + ms, fn };
        timers.push(t);
        return t;
      },
      clearTimer: (h) => {
        const i = timers.indexOf(h as (typeof timers)[number]);
        if (i >= 0) timers.splice(i, 1);
      },
      defer: (fn) => {
        timers.push({ at: now, fn });
      },
      heartbeatMs: 1e9,
    });
    const advance = (ms: number) => {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const next = timers[0];
        if (!next || next.at > end) break;
        timers.shift();
        now = Math.max(now, next.at);
        next.fn();
      }
      now = end;
    };
    runner.handle({ t: 'create', matchId: 'M', opts: matchOptions({ matchId: 'M' }) });
    await new Promise((r) => setTimeout(r, 0));
    advance(1000);
    const running = counter.ticks;
    expect(running).toBeGreaterThan(50);

    runner.setPaused(true);
    advance(5000);
    expect(counter.ticks).toBe(running);

    runner.setPaused(false);
    advance(150);
    // About ten ticks for 150 ms — not the 5 s of ticks the pause would otherwise owe.
    expect(counter.ticks - running).toBeGreaterThan(0);
    expect(counter.ticks - running).toBeLessThan(15);
    runner.shutdown();
  });
});
