/**
 * Redesign D4 "one scheduler": background application work is a pg-boss job in the `jobs` worker
 * (or, for the ladder pipeline and the homes scraper, a pg-boss queue consumed by their own
 * process). There is no `node-cron` left, and a server-side `setInterval` is only legitimate as
 * per-process housekeeping.
 *
 * This is a one-directional allowlist. Every server-side `setInterval(` below is a timer that must
 * live and die with ONE process (a connection's heartbeat, an in-memory cache's GC, a buffer flush,
 * a game tick, a worker's own liveness probe). If you need a periodic DB sweep, digest, refresh or
 * cleanup, register a pg-boss cron instead (see `server/jobs/index.ts` REGISTRATIONS and
 * `lib/streak-reminders.server.ts` for the pattern) and do not add a row here.
 *
 * Entries only come OUT: when a timer is removed or ported, delete its row. A row whose file no
 * longer contains that many timers fails the test so the list cannot go stale.
 *
 * Scope: `server/**`, `app/routes/api/**`, every `lib/**\/*.server.ts`, and the two non-`.server`
 * lib modules the server tier loads (`EXTRA_FILES`). Browser-only modules and `.tsx` components are
 * out of scope: their timers (countdowns, animation, polling) are not background work.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(__dirname, '..', '..');

const HEARTBEAT = 'SSE keepalive/heartbeat bound to one open connection';
const GAME_TICK = 'per-room / per-match game clock in the hub process (state is in-memory)';
const HUB_HOUSEKEEPING = 'hub-local timer over in-memory room/lobby/connection state';

/** file -> { count of `setInterval(` call sites, why it must stay in-process }. */
const ALLOWED: Readonly<Record<string, { count: number; reason: string }>> = {
  // ── Web tier: connection-scoped SSE timers ──────────────────────────────
  'app/routes/api/canvas/stream.ts': { count: 1, reason: HEARTBEAT },
  'app/routes/api/elections/chat/stream.ts': { count: 1, reason: HEARTBEAT },
  'app/routes/api/elections/events/stream.ts': {
    count: 2,
    reason: `${HEARTBEAT}; plus a 20 s snapshot nudge that exists only while a viewer is connected`,
  },
  'app/routes/api/feed/stream.ts': { count: 1, reason: HEARTBEAT },
  'app/routes/api/group-chats/$id/stream.ts': { count: 1, reason: HEARTBEAT },
  'app/routes/api/kaikai-debt/stream.ts': { count: 1, reason: HEARTBEAT },
  'app/routes/api/messages/stream.ts': { count: 1, reason: HEARTBEAT },
  'app/routes/api/sohumtracker/stream.ts': { count: 1, reason: HEARTBEAT },
  // ── Web tier: per-process memory housekeeping ───────────────────────────
  'app/routes/api/discord/embed.ts': {
    count: 1,
    reason: 'GC of a module-level in-memory Map (per-process state, nothing in the DB)',
  },
  'app/routes/api/discord/race.ts': {
    count: 1,
    reason: 'GC of the in-memory lobby Map (per-process state, nothing in the DB)',
  },
  'lib/cached.server.ts': { count: 1, reason: 'L1 cache expiry sweep over the in-process LRU' },
  'lib/rate-limit.ts': {
    count: 1,
    reason: 'sweep of the per-process in-memory rate-limit windows',
  },
  'server/shared/rate-limit.ts': { count: 1, reason: 'sweep of the hub rate-limiter windows' },
  'server/shared/session-auth.ts': {
    count: 1,
    reason: 'expiry sweep of the hub-local 60 s session positive cache',
  },
  'lib/hot-counters.server.ts': {
    count: 2,
    reason:
      'flushes counters buffered in THIS process (Redis drain + local fallback); the buffer cannot be flushed from another process',
  },
  'lib/ops/error-inbox.server.ts': {
    count: 1,
    reason: 'flushes the client-error batch buffered in this web process',
  },
  'lib/ops/route-views.server.ts': {
    count: 1,
    reason: 'flushes the route-view counters buffered in this web process',
  },
  'lib/sohumtracker/stream.server.ts': {
    count: 1,
    reason:
      'shared watcher behind the SSE stream: starts with the first subscriber, stops with the last, unref()ed',
  },
  // ── Telemetry of the process itself ─────────────────────────────────────
  'lib/perf/process-metrics.ts': { count: 1, reason: 'samples this process (event loop, heap)' },
  'lib/perf/publish.server.ts': {
    count: 1,
    reason: 'publishes this process snapshot to Redis every 10 s',
  },
  // ── The jobs worker's own liveness / process-local rollup state ─────────
  'lib/oncall/checks.server.ts': {
    count: 1,
    reason:
      'the jobs worker heartbeat: the page fires when THIS process goes silent, and the debouncer state is process-local',
  },
  'lib/ops/metrics-store.server.ts': {
    count: 1,
    reason:
      'one-minute telemetry rollup whose counter-delta memory lives in this process (a missed tick must not be replayed)',
  },
  // ── Worker shutdown / lease plumbing ────────────────────────────────────
  'server/ladder-worker/index.ts': {
    count: 2,
    reason: 'DB lease heartbeat for the run in flight, and the shutdown drain poll',
  },
  'server/homes-worker/index.ts': { count: 1, reason: 'shutdown drain poll' },
  // ── Discord bot (in the jobs worker, D3) ────────────────────────────────
  'server/discord-bot/chat.ts': {
    count: 1,
    reason:
      'keeps the "Alex is typing…" indicator alive (every 8 s) for ONE in-flight reply and is cleared when it is sent; the Go bot ran the same per-reply ticker',
  },
  // ── Realtime hubs ───────────────────────────────────────────────────────
  'server/socket-server/matchmaking.ts': {
    count: 1,
    reason: 'matchmaking queue tick over in-memory queues',
  },
  'features/altair/server/handlers.ts': { count: 2, reason: GAME_TICK },
  'features/balatro/server/queue.ts': { count: 1, reason: HUB_HOUSEKEEPING },
  'server/socket-server/handlers/controller.ts': { count: 1, reason: HUB_HOUSEKEEPING },
  'features/dream-rift/server/handlers.ts': { count: 1, reason: GAME_TICK },
  'features/gabriels-horn/server/handlers.ts': { count: 2, reason: GAME_TICK },
  'server/socket-server/handlers/globeset.ts': { count: 2, reason: GAME_TICK },
  'server/socket-server/handlers/group-call.ts': { count: 1, reason: HUB_HOUSEKEEPING },
  'features/laundry-sort/server/handlers.ts': { count: 3, reason: GAME_TICK },
  'server/socket-server/handlers/lights-out.ts': { count: 1, reason: GAME_TICK },
  'server/socket-server/handlers/rmhstudy.ts': { count: 1, reason: HUB_HOUSEKEEPING },
  'server/socket-server/handlers/rmhtype.ts': { count: 3, reason: GAME_TICK },
  'features/slice-it/server/handlers.ts': { count: 2, reason: GAME_TICK },
  'server/rmhbox/lobby-manager.ts': { count: 1, reason: HUB_HOUSEKEEPING },
  'server/rmhbox/minigames/base-minigame.ts': { count: 3, reason: GAME_TICK },
  'server/rmhbox/minigames/fact-or-friction/handler.ts': { count: 1, reason: GAME_TICK },
  'server/rmhbox/state-sync.ts': { count: 2, reason: 'lobby state-machine timers' },
  'server/rmhtube/party-handler.ts': { count: 1, reason: HUB_HOUSEKEEPING },
  'server/rmhtube/room-manager.ts': { count: 1, reason: HUB_HOUSEKEEPING },
  'server/rmhtube/sync-engine.ts': {
    count: 1,
    reason: 'leader-authoritative 2 s sync heartbeat per room',
  },
};

/** Non-`.server` lib modules that only the server tier loads, so they are scanned too. */
const EXTRA_FILES = ['lib/rate-limit.ts', 'lib/perf/process-metrics.ts'];

const SKIP_DIRS = new Set(['node_modules', '__tests__', '.output', 'dist-server', 'generated']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function isSource(file: string): boolean {
  return /\.(ts|mts|cts|js|mjs|cjs)$/.test(file) && !/\.(test|spec)\./.test(file);
}

function rel(file: string): string {
  return relative(ROOT, file).split('\\').join('/');
}

function inScope(path: string): boolean {
  if (path.startsWith('server/')) return true;
  if (path.startsWith('app/routes/api/')) return true;
  // A feature's socket handlers (features/<id>/server/) are hub code like server/socket-server/handlers/.
  if (/^features\/[^/]+\/server\//.test(path)) return true;
  // A feature's registered API endpoints (features/<id>/api/, served by app/routes/api/$.ts)
  // are request handlers like the route files they were.
  if (/^features\/[^/]+\/api\//.test(path)) return true;
  if (path.startsWith('lib/') && /\.server\.(ts|mts|cts|js|mjs|cjs)$/.test(path)) return true;
  return EXTRA_FILES.includes(path);
}

/** Lines that are code, not comments (good enough for a call-site count). */
function codeLines(source: string): string[] {
  return source.split('\n').filter((line) => {
    const t = line.trim();
    return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*'));
  });
}

function countIntervals(file: string): number {
  return codeLines(readFileSync(file, 'utf8')).filter((l) => /\bsetInterval\(/.test(l)).length;
}

const files = ['server', 'app/routes/api', 'lib', 'features']
  .flatMap((d) => walk(join(ROOT, d)))
  .filter(isSource)
  .map((f) => ({ file: f, path: rel(f) }))
  .filter(({ path }) => inScope(path));

describe('D4: one scheduler', () => {
  it('has no new server-side setInterval outside the allowlist', () => {
    const offenders: string[] = [];
    for (const { file, path } of files) {
      const found = countIntervals(file);
      if (found === 0) continue;
      const allowed = ALLOWED[path]?.count ?? 0;
      if (found > allowed) {
        offenders.push(`${path}: ${found} setInterval call(s), ${allowed} allowed`);
      }
    }
    expect(
      offenders,
      'Background work belongs in a pg-boss cron in the jobs worker (server/jobs/index.ts). ' +
        'Only per-process housekeeping may use setInterval, and then it needs a row in ALLOWED with its reason.',
    ).toEqual([]);
  });

  it('keeps the allowlist honest: every row still has its timers (entries only come out)', () => {
    const stale: string[] = [];
    for (const [path, { count, reason }] of Object.entries(ALLOWED)) {
      expect(reason.length, `${path} needs a reason`).toBeGreaterThan(10);
      let found: number;
      try {
        found = countIntervals(join(ROOT, path));
      } catch {
        stale.push(`${path}: file no longer exists, delete its row`);
        continue;
      }
      if (found !== count) {
        stale.push(`${path}: lists ${count} but has ${found}, update or delete the row`);
      }
    }
    expect(stale).toEqual([]);
  });

  it('uses node-cron nowhere: no import, no dependency', () => {
    const importers = ['server', 'app', 'lib', 'scripts', 'cli']
      .flatMap((d) => {
        try {
          return walk(join(ROOT, d));
        } catch {
          return [];
        }
      })
      .filter(isSource)
      .filter((f) => rel(f) !== rel(__filename))
      .filter((f) =>
        /from ['"]node-cron['"]|require\(['"]node-cron['"]\)/.test(readFileSync(f, 'utf8')),
      )
      .map(rel);
    expect(importers).toEqual([]);

    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect({ ...pkg.dependencies, ...pkg.devDependencies }).not.toHaveProperty('node-cron');
  });
});
