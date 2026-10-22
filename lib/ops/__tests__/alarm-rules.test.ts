import { describe, expect, it } from 'vitest';
import {
  METRIC_ALARMS,
  alarmInstance,
  effectiveRules,
  evaluateRules,
  formatValue,
  ruleKey,
  type SeriesRow,
} from '../alarm-rules';

// Metric alarms are configured in code and overridden from /admin/alarms.
// These pin the contract: unique keys, override precedence, and when a rule
// with real traffic (and only then) goes active.

const NOW = 1_800_000_000_000;
const MIN = 60_000;

function rows(metric: string, dim: string, minutes: number, per: Partial<SeriesRow>): SeriesRow[] {
  return Array.from({ length: minutes }, (_, i) => ({
    at: new Date(NOW - (i + 1) * MIN + 1),
    metric,
    dim,
    count: 0,
    p50: null,
    p95: null,
    p99: null,
    value: null,
    ...per,
  }));
}

const rule = (metric: string, dim: string, stat = 'p95') =>
  effectiveRules([]).find((r) => r.metric === metric && r.dim === dim && r.stat === stat)!;

describe('the rule table', () => {
  it('has unique override keys and unique watchdog instances', () => {
    const keys = METRIC_ALARMS.map(ruleKey);
    expect(new Set(keys).size).toBe(keys.length);
    const instances = METRIC_ALARMS.map(
      (r) => `${r.id}:${alarmInstance(r, r.dim === '*' ? 'x' : r.dim)}`,
    );
    expect(new Set(instances).size).toBe(instances.length);
    expect(METRIC_ALARMS.every((r) => r.sev >= 2)).toBe(true); // Sev1 is human-only
  });
});

describe('effectiveRules', () => {
  it('an override replaces the threshold and can mute; the code value stays visible', () => {
    const key = ruleKey(METRIC_ALARMS[0]!);
    const [r] = effectiveRules([
      { key, threshold: 9, muted: true, updatedBy: 'u', updatedAt: new Date() },
    ]);
    expect(r).toMatchObject({
      threshold: 9,
      codeThreshold: METRIC_ALARMS[0]!.threshold,
      muted: true,
      overridden: true,
    });
  });
});

describe('evaluateRules', () => {
  const page = rule('http.latency', 'ssr');

  it('fires on a request-weighted p95 over the threshold with enough traffic', () => {
    const r = rows('http.latency', 'ssr', 10, { count: 20, p95: 3000 });
    expect(evaluateRules([page], r, NOW)[0]).toMatchObject({
      active: true,
      current: 3000,
      samples: 200,
    });
  });

  it('stays quiet under the minimum traffic, under the threshold, or when muted', () => {
    expect(
      evaluateRules([page], rows('http.latency', 'ssr', 10, { count: 5, p95: 9000 }), NOW)[0]!
        .active,
    ).toBe(false);
    expect(
      evaluateRules([page], rows('http.latency', 'ssr', 10, { count: 20, p95: 900 }), NOW)[0]!
        .active,
    ).toBe(false);
    const muted = { ...page, muted: true };
    expect(
      evaluateRules([muted], rows('http.latency', 'ssr', 10, { count: 20, p95: 9000 }), NOW)[0]!
        .active,
    ).toBe(false);
  });

  it('ignores minutes outside the window', () => {
    const old = rows('http.latency', 'ssr', 10, { count: 20, p95: 9000 }).map((x) => ({
      ...x,
      at: new Date(NOW - 60 * MIN),
    }));
    expect(evaluateRules([page], old, NOW)[0]).toMatchObject({ current: null, active: false });
  });

  it("dim '*' yields one evaluation per dimension (each LLM provider)", () => {
    const llm = rule('llm.latency', '*');
    const evals = evaluateRules(
      [llm],
      [
        ...rows('llm.latency', 'deepseek:chat', 10, { count: 2, p95: 45_000 }),
        ...rows('llm.latency', 'xai:image', 10, { count: 2, p95: 5_000 }),
      ],
      NOW,
    );
    expect(evals.map((e) => [e.dim, e.active])).toEqual([
      ['deepseek:chat', true],
      ['xai:image', false],
    ]);
    expect(alarmInstance(llm, 'deepseek:chat')).toBe('latency:deepseek:chat');
  });

  it('gauges (no sample count) are averaged', () => {
    const heap = rule('process.heap_pct', '*', 'value');
    const evals = evaluateRules([heap], rows('process.heap_pct', 'web', 10, { value: 90 }), NOW);
    expect(evals[0]).toMatchObject({ dim: 'web', current: 90, active: true });
  });
});

describe('formatValue', () => {
  it('formats by unit', () => {
    expect(formatValue(2500, 'ms')).toBe('2.5 s');
    expect(formatValue(320, 'ms')).toBe('320 ms');
    expect(formatValue(4.25, '%')).toBe('4.3%');
    expect(formatValue(null, 'ms')).toBe('—');
  });
});
