/**
 * A real `worker_threads` round trip: the worker entry is bundled with esbuild
 * exactly as the production build bundles it (CJS, node target), spawned by the
 * pool, and driven through create → join → input → echo → snapshots at 66 Hz →
 * dispose. Then the thread is killed to check crash recovery against a real exit.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { buildSync } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MatchPool, type MatchListener } from '@/lib/tf2-game/server/pool.server';
import { ECHO_TAG_INPUT, ECHO_TAG_SNAPSHOT } from '@/lib/tf2-game/server/echo-host';
import type { RoomSummary } from '@/lib/tf2-game/server/match-host';
import type { WirePacket } from '@/lib/tf2-game/server/worker-protocol';
import { until } from './helpers';

let dir = '';
let workerPath = '';

beforeAll(() => {
  // The transport double: these tests have no map packages (create-match.ts).
  process.env.TF2_MATCH_HOST = 'echo';
  dir = mkdtempSync(path.join(tmpdir(), 'tf2-worker-'));
  workerPath = path.join(dir, 'match-worker.server.cjs');
  buildSync({
    entryPoints: [path.resolve(__dirname, '../../../lib/tf2-game/server/match-worker.server.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: workerPath,
    packages: 'external',
    logLevel: 'silent',
  });
});

afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function recorder() {
  const rec = {
    ready: null as { tick: number; tickInterval: number } | null,
    frames: [] as Array<{ tick: number; packets: WirePacket[]; at: number }>,
    summaries: [] as RoomSummary[],
    closed: [] as string[],
  };
  const listener: MatchListener = {
    onReady: (info) => {
      rec.ready = info;
    },
    onFrame: (tick, packets) => rec.frames.push({ tick, packets, at: performance.now() }),
    onSummary: (s) => rec.summaries.push(s),
    onClosed: (reason) => rec.closed.push(reason),
  };
  return { rec, listener };
}

const opts = (matchId: string) => ({
  matchId,
  map: 'koth_viaduct',
  mode: 'koth' as const,
  maxPlayers: 12,
  botCount: 0,
  botDifficulty: 'easy' as const,
  name: 'thread',
  seed: 3,
});

describe('the match worker on a real thread', () => {
  it('round-trips input and streams snapshots at 66.67 Hz', async () => {
    const pool = new MatchPool({ workerPath, maxWorkers: 1, maxMatches: 2 });
    try {
      expect(pool.mode).toBe('threads');
      const { rec, listener } = recorder();
      const result = pool.createMatch(opts('T1'), listener);
      if (!result.ok) throw new Error(result.error);
      const { handle } = result;
      handle.addPlayer(1, { name: 'Engineer', userId: 'u1' });

      await until(() => rec.ready !== null, 5_000, 'ready');
      expect(rec.ready).toEqual({ tick: 0, tickInterval: 0.015 });

      handle.input(1, Buffer.from([4, 2]));
      await until(
        () => rec.frames.some((f) => f.packets.some((p) => p.reliable)),
        2_000,
        'echo',
      );
      const echo = rec.frames.flatMap((f) => f.packets).find((p) => p.reliable)!;
      expect(echo.to).toBe(1);
      expect([...new Uint8Array(echo.data)]).toEqual([ECHO_TAG_INPUT, 4, 2]);

      // Measure the tick rate from the ticks the worker stamped on its frames.
      const from = rec.frames.length;
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      const window = rec.frames.slice(from);
      const ticks = window.at(-1)!.tick - window[0].tick;
      const seconds = (window.at(-1)!.at - window[0].at) / 1_000;
      expect(ticks / seconds).toBeGreaterThan(60);
      expect(ticks / seconds).toBeLessThan(72);
      const snap = new Uint8Array(window.at(-1)!.packets.find((p) => !p.reliable)!.data);
      expect(snap[0]).toBe(ECHO_TAG_SNAPSHOT);

      await until(() => rec.summaries.length > 0, 2_000, 'summary');
      expect(rec.summaries.at(-1)!.players.map((p) => p.name)).toEqual(['Engineer']);

      handle.dispose();
      expect(pool.matchCount).toBe(0);
      expect(rec.closed).toEqual([]);
    } finally {
      pool.shutdown();
    }
  });

  it('closes the matches of a thread that dies and replaces it', async () => {
    const pool = new MatchPool({ workerPath, maxWorkers: 1, maxMatches: 2, respawnDelayMs: () => 10 });
    try {
      const { rec, listener } = recorder();
      const result = pool.createMatch(opts('T2'), listener);
      if (!result.ok) throw new Error(result.error);
      await until(() => rec.ready !== null, 5_000, 'ready');

      // Kill the thread from the outside, as the OOM limit or a fatal error would.
      const slots = (pool as unknown as { slots: Array<{ worker: { terminate(): void } }> }).slots;
      slots[0].worker.terminate();
      await until(() => rec.closed.length > 0, 5_000, 'closed');
      expect(rec.closed).toEqual(['server-error']);
      await until(() => pool.workerCount === 1, 5_000, 'respawn');

      const again = recorder();
      const next = pool.createMatch(opts('T3'), again.listener);
      if (!next.ok) throw new Error(next.error);
      await until(() => again.rec.ready !== null, 5_000, 'ready after respawn');
    } finally {
      pool.shutdown();
    }
  });
});
