// What the watchdog checks from outside the VPS, once a minute.
//
// Probes: HTTP checks against the public site. Heartbeats: check-ins the VPS
// (status service, nightly backup) POSTs to /v1/heartbeat/<name>; silence past
// maxAgeMs is the alarm. Both use hysteresis so one dropped packet never pages.

import type { AlarmInput, Engine } from './engine';
import type { DurableObjectStorageLike } from './env';

export interface ProbeResult {
  ok: boolean;
  detail: string;
}

export interface ProbeDef {
  alarm: Omit<AlarmInput, 'detail'>;
  run(env: { SITE_URL: string; STATUS_URL: string }, fetchImpl: typeof fetch, now: number): Promise<ProbeResult>;
}

/** Consecutive failures before firing / successes before resolving. */
export const FAIL_THRESHOLD = 2;
export const RECOVER_THRESHOLD = 2;
const TIMEOUT_MS = 10_000;
const STATUS_STALE_MS = 2 * 60 * 1000;

async function get(url: string, fetchImpl: typeof fetch): Promise<{ status: number; body: string; ms: number }> {
  const started = Date.now();
  const res = await fetchImpl(url, {
    headers: { 'user-agent': 'rmh-oncall-watchdog/1', 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: 'manual',
  });
  const body = (await res.text()).slice(0, 200_000);
  return { status: res.status, body, ms: Date.now() - started };
}

const failure = (err: unknown): ProbeResult => ({
  ok: false,
  detail: err instanceof Error && err.name === 'TimeoutError' ? `timed out after ${TIMEOUT_MS / 1000}s` : `request failed: ${String(err)}`,
});

export const PROBES: ProbeDef[] = [
  {
    alarm: { id: 'A01', sev: 2, title: 'Site down (external check)', source: 'oncall-watchdog' },
    async run(env, f, now) {
      try {
        // A unique query string per minute so the edge's anonymous-HTML cache
        // can't answer for a dead origin.
        const r = await get(`${env.SITE_URL}/?oncall_probe=${Math.floor(now / 60_000)}`, f);
        if (r.status !== 200) return { ok: false, detail: `GET / → HTTP ${r.status} (${r.ms}ms)` };
        if (!r.body.includes('id="main-content"')) return { ok: false, detail: `GET / → 200 but page shell missing (${r.ms}ms)` };
        return { ok: true, detail: `HTTP 200 (${r.ms}ms)` };
      } catch (err) {
        return failure(err);
      }
    },
  },
  {
    alarm: { id: 'A02', sev: 2, title: 'Readiness failing (/api/ready)', source: 'oncall-watchdog' },
    async run(env, f) {
      try {
        const r = await get(`${env.SITE_URL}/api/ready`, f);
        if (r.status !== 200 || !r.body.includes('"status":"ok"')) {
          return { ok: false, detail: `GET /api/ready → HTTP ${r.status} (${r.ms}ms): ${r.body.slice(0, 300)}` };
        }
        return { ok: true, detail: `HTTP 200 (${r.ms}ms)` };
      } catch (err) {
        return failure(err);
      }
    },
  },
  {
    alarm: { id: 'A03', sev: 2, title: 'Status service stale or unreachable', source: 'oncall-watchdog' },
    async run(env, f, now) {
      try {
        const r = await get(`${env.STATUS_URL}/api/status`, f);
        // 503 is a valid answer here ("something is Down"); the status service's
        // own alerts cover that. This probe is about the prober being alive.
        if (r.status !== 200 && r.status !== 503) return { ok: false, detail: `GET /api/status → HTTP ${r.status}` };
        const checkedAt = Date.parse((JSON.parse(r.body) as { checkedAt?: string }).checkedAt ?? '');
        if (!Number.isFinite(checkedAt)) return { ok: false, detail: 'no checkedAt in /api/status' };
        const age = now - checkedAt;
        if (age > STATUS_STALE_MS) return { ok: false, detail: `last probe cycle ${Math.round(age / 1000)}s ago (prober stalled)` };
        return { ok: true, detail: `fresh (${Math.round(age / 1000)}s)` };
      } catch (err) {
        return failure(err);
      }
    },
  },
];

export interface HeartbeatDef {
  maxAgeMs: number;
  alarm: Omit<AlarmInput, 'detail'>;
}

/**
 * Known check-ins. A heartbeat only arms after its FIRST check-in, so this can
 * ship before the VPS side sends anything without paging for silence.
 */
export const HEARTBEATS: Record<string, HeartbeatDef> = {
  status: {
    maxAgeMs: 3 * 60 * 1000,
    alarm: { id: 'A03', instance: 'heartbeat', sev: 2, title: 'VPS heartbeat lost (status service silent)', source: 'oncall-watchdog' },
  },
  'pg-backup': {
    maxAgeMs: 26 * 60 * 60 * 1000,
    alarm: { id: 'A04', sev: 2, title: 'Nightly database backup missed', source: 'oncall-watchdog' },
  },
};

interface Counter {
  fails: number;
  oks: number;
}

/** Run every probe and fire/resolve its alarm through the hysteresis counters. */
export async function runProbes(
  engine: Engine,
  storage: DurableObjectStorageLike,
  env: { SITE_URL: string; STATUS_URL: string },
  fetchImpl: typeof fetch,
  now: number,
): Promise<void> {
  const results = await Promise.all(PROBES.map((p) => p.run(env, fetchImpl, now).catch(failure)));
  for (const [i, probe] of PROBES.entries()) {
    const result = results[i]!;
    const key = `probe:${probe.alarm.id}`;
    const prev = (await storage.get<Counter>(key)) ?? { fails: 0, oks: 0 };
    const next: Counter = result.ok ? { fails: 0, oks: prev.oks + 1 } : { fails: prev.fails + 1, oks: 0 };
    const firing = (await engine.get(probe.alarm.id))?.state === 'firing';

    if (!result.ok && next.fails >= FAIL_THRESHOLD) {
      await engine.fire({ ...probe.alarm, detail: `${result.detail}\nFailing for ${next.fails} consecutive checks (1/min).` }, now);
    } else if (result.ok && firing && next.oks >= RECOVER_THRESHOLD) {
      await engine.resolve(probe.alarm.id, now, result.detail);
    }
    // Only write when the counter moved off the healthy steady state: an idle,
    // healthy watchdog does no storage writes at all.
    if (prev.fails !== 0 || next.fails !== 0 || firing) await storage.put(key, next);
  }
}

export async function recordHeartbeat(storage: DurableObjectStorageLike, engine: Engine, name: string, now: number): Promise<boolean> {
  const def = HEARTBEATS[name];
  if (!def) return false;
  await storage.put(`hb:${name}`, now);
  const key = def.alarm.instance ? `${def.alarm.id}:${def.alarm.instance}` : def.alarm.id;
  if ((await engine.get(key))?.state === 'firing') await engine.resolve(key, now, 'heartbeat received');
  return true;
}

export async function checkHeartbeats(storage: DurableObjectStorageLike, engine: Engine, now: number): Promise<void> {
  for (const [name, def] of Object.entries(HEARTBEATS)) {
    const last = await storage.get<number>(`hb:${name}`);
    if (last === undefined) continue; // not armed yet
    const age = now - last;
    if (age > def.maxAgeMs) {
      await engine.fire(
        { ...def.alarm, detail: `No \`${name}\` check-in for ${Math.round(age / 60_000)}m (expected every ≤ ${Math.round(def.maxAgeMs / 60_000)}m).` },
        now,
      );
    }
  }
}
