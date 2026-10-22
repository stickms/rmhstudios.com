import { describe, expect, it } from 'vitest';
import type { PerfOverview } from '../../perf/admin-types';
import type { ProcessSnapshot } from '../../perf/process-metrics';
import { oncallClient, signOncall } from '../client.server';
import {
  Debouncer,
  REFRESH_MS,
  evaluate,
  newMemory,
  type CheckInputs,
  type Condition,
} from '../rules';

// What pages on-call from the app's own telemetry. A wrong threshold here is
// either a missed outage or a 3am false page, so each rule's edge is pinned.

const NOW = 1_800_000_000_000;
const MIN = 60_000;

function snap(over: Partial<ProcessSnapshot> & { service: string; pid: number }): ProcessSnapshot {
  return {
    hostname: 'h',
    memory: { heapUsed: 100, heapLimit: 1000 },
    eventLoop: { current: { p99: 10 } },
    counters: {},
    routes: [],
    ...over,
  } as unknown as ProcessSnapshot;
}

function overview(
  o: {
    processes?: ProcessSnapshot[];
    gauges?: Record<string, number>;
  } = {},
): PerfOverview {
  return {
    processes: o.processes ?? [snap({ service: 'web', pid: 1 })],
    hubs: [{ service: 'socket', error: 'unreachable' }],
    cluster: { timeseries: [], gauges: o.gauges ?? {} },
  } as unknown as PerfOverview;
}

const input = (over: Partial<CheckInputs> = {}): CheckInputs => ({
  now: NOW,
  overview: overview(),
  db: null,
  queues: null,
  outboxOldestPendingMs: null,
  ...over,
});

const find = (cs: Condition[], id: string, instance?: string) =>
  cs.find((c) => c.id === id && c.instance === instance);

describe('client signing', () => {
  // Same vector as go-services/pkg/oncall, the Worker's gates.test.ts and
  // deploy/oncall-send.sh: all signers must agree or the app can't page anyone.
  it('matches the cross-language vector', () => {
    expect(
      signOncall('x'.repeat(40), '1800000000', 'abcdefabcdef0123', 'POST', '/v1/alert', '{"x":1}'),
    ).toBe('v1=6028d8faef5cfa9d35313a8bc95430f32c6b7e3ded899c195d927522592095f2');
  });

  it('is disabled without a URL or a long enough secret', () => {
    expect(oncallClient({})).toBeNull();
    expect(
      oncallClient({ ONCALL_URL: 'https://w.test', ONCALL_SIGNING_SECRET: 'short' }),
    ).toBeNull();
    expect(
      oncallClient({ ONCALL_URL: 'https://w.test', ONCALL_SIGNING_SECRET: 'x'.repeat(32) }),
    ).not.toBeNull();
  });
});

describe('process error counters', () => {
  it('pages on the increase of cumulative counters, not their absolute value', () => {
    const mem = newMemory();
    const at = (n: number) =>
      input({
        overview: overview({
          processes: [
            snap({ service: 'web', pid: 1, counters: { 'process.uncaught_exception': n } }),
          ],
        }),
      });
    expect(find(evaluate(at(7), mem), 'B14')?.active).toBe(false); // first sighting = baseline
    expect(find(evaluate(at(7), mem), 'B14')?.active).toBe(false);
    expect(find(evaluate(at(8), mem), 'B14')?.active).toBe(true);
  });
});

describe('A15 / B13 queues', () => {
  it('any new failure on an economy queue pages; other queues need 5', () => {
    const mem = newMemory();
    const q = (economy: number, other: number) =>
      input({
        overview: null,
        queues: [
          { name: 'economy.scheduled-gifts', failedCount: economy, readyCount: 0 },
          { name: 'email.weekly-digest', failedCount: other, readyCount: 0 },
        ],
      });
    evaluate(q(10, 10), mem); // baseline
    const cs = evaluate(q(11, 12), mem);
    expect(find(cs, 'A15', 'economy.scheduled-gifts')).toMatchObject({ active: true, sev: 2 });
    expect(find(cs, 'B13', 'email.weekly-digest')).toMatchObject({ active: false, sev: 3 });
  });
});

describe('A06 / A17 / outbox', () => {
  it('Postgres connections over 85%', () => {
    const cs = evaluate(
      input({ overview: null, db: { backends: 180, maxConnections: 200 } }),
      newMemory(),
    );
    expect(find(cs, 'A06', 'connections')?.active).toBe(true);
  });

  it('Stripe webhook: more than 3 failures in 15 minutes', () => {
    const mem = newMemory();
    const at = (errs: number) =>
      input({
        overview: overview({
          processes: [
            snap({
              service: 'web',
              pid: 1,
              routes: [
                { route: '/api/auth/stripe/webhook', errors4xx: errs, errors5xx: 0 },
              ] as never,
            }),
          ],
        }),
      });
    evaluate(at(0), mem);
    expect(find(evaluate(at(3), mem), 'A17')?.active).toBe(false);
    expect(find(evaluate(at(4), mem), 'A17')?.active).toBe(true);
  });

  it('outbox stuck over 10 minutes', () => {
    expect(
      find(
        evaluate(input({ overview: null, outboxOldestPendingMs: 11 * MIN }), newMemory()),
        'A15',
        'outbox',
      )?.active,
    ).toBe(true);
  });
});

describe('Debouncer', () => {
  const cond = (active: boolean): Condition => ({
    id: 'X',
    sev: 3,
    title: 't',
    active,
    detail: '',
    forChecks: 2,
    clearChecks: 2,
  });

  it('fires after forChecks, refreshes every 10m, resolves after clearChecks', () => {
    const d = new Debouncer();
    expect(d.step([cond(true)], 0)).toEqual([]);
    expect(d.step([cond(true)], MIN)).toMatchObject([{ state: 'firing' }]);
    expect(d.step([cond(true)], 2 * MIN)).toEqual([]);
    expect(d.step([cond(true)], MIN + REFRESH_MS)).toMatchObject([{ state: 'firing' }]);
    expect(d.step([cond(false)], MIN + REFRESH_MS + MIN)).toEqual([]);
    expect(d.step([cond(false)], MIN + REFRESH_MS + 2 * MIN)).toMatchObject([
      { state: 'resolved' },
    ]);
  });

  it('retries a transition that failed to deliver', () => {
    const d = new Debouncer();
    d.step([cond(true)], 0);
    const [tr] = d.step([cond(true)], MIN);
    d.undo(tr!);
    expect(d.step([cond(true)], 2 * MIN)).toMatchObject([{ state: 'firing' }]);
  });
});
