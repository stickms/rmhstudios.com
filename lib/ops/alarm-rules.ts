// Metric alarms, as code. Every threshold alarm over the one-minute history
// (ops_metric_minute, see metrics-rollup.ts) is declared here; /admin/alarms
// can override a rule's threshold or mute it (ops_alarm_override), and
// "Reset to code" drops the override so this file is the default again.
//
// A rule looks at its metric over the last `forMinutes` minutes. Latency-style
// rows are combined weighted by request count; gauge rows are averaged. It is
// active when that window value is above the threshold and (for traffic-based
// metrics) at least `minCount` samples were seen — so a quiet minute never pages.
//
// `dim: '*'` makes one alarm per dimension seen (each LLM provider, each
// service). Pure and client-safe: the page shows these definitions too.

export type Stat = 'p50' | 'p95' | 'p99' | 'value';

export interface MetricAlarmRule {
  /** Alarm id (docs/runbooks/oncall/<id>.md). */
  id: string;
  title: string;
  metric: string;
  /** A specific dimension, '' for none, or '*' for one alarm per dimension. */
  dim: string;
  /**
   * Alarm instance (the watchdog key is `id:instance`). Defaults to the
   * dimension; set it when two rules share an id and dimension (fast vs
   * sustained), so they never resolve each other. For `dim: '*'` it is a
   * prefix: `<instance>:<dim>`.
   */
  instance?: string;
  stat: Stat;
  threshold: number;
  unit: 'ms' | '%' | 'count';
  forMinutes: number;
  /** Minimum samples in the window before it can fire (traffic metrics). */
  minCount?: number;
  sev: 2 | 3 | 4;
}

export const METRIC_ALARMS: MetricAlarmRule[] = [
  // Web — server side
  {
    id: 'A08',
    instance: 'ssr-burst',
    title: 'Page 5xx error rate spiking',
    metric: 'http.5xx_pct',
    dim: 'ssr',
    stat: 'value',
    threshold: 5,
    unit: '%',
    forMinutes: 3,
    minCount: 50,
    sev: 2,
  },
  {
    id: 'A08',
    instance: 'ssr',
    title: 'Page 5xx error rate high',
    metric: 'http.5xx_pct',
    dim: 'ssr',
    stat: 'value',
    threshold: 2,
    unit: '%',
    forMinutes: 10,
    minCount: 200,
    sev: 2,
  },
  {
    id: 'A08',
    instance: 'api-burst',
    title: 'API 5xx error rate spiking',
    metric: 'http.5xx_pct',
    dim: 'api',
    stat: 'value',
    threshold: 5,
    unit: '%',
    forMinutes: 3,
    minCount: 50,
    sev: 2,
  },
  {
    id: 'A08',
    instance: 'api',
    title: 'API 5xx error rate high',
    metric: 'http.5xx_pct',
    dim: 'api',
    stat: 'value',
    threshold: 2,
    unit: '%',
    forMinutes: 10,
    minCount: 200,
    sev: 2,
  },
  {
    id: 'A09',
    title: 'Page response time high (p95)',
    metric: 'http.latency',
    dim: 'ssr',
    stat: 'p95',
    threshold: 2500,
    unit: 'ms',
    forMinutes: 10,
    minCount: 100,
    sev: 2,
  },
  {
    id: 'M01',
    title: 'API response time high (p95)',
    metric: 'http.latency',
    dim: 'api',
    stat: 'p95',
    threshold: 1500,
    unit: 'ms',
    forMinutes: 10,
    minCount: 100,
    sev: 3,
  },
  {
    id: 'M01',
    title: 'Developer API response time high (p95)',
    metric: 'http.latency',
    dim: 'v1',
    stat: 'p95',
    threshold: 1500,
    unit: 'ms',
    forMinutes: 10,
    minCount: 50,
    sev: 3,
  },
  // Real users — page loads (web-vitals beacons)
  {
    id: 'M02',
    instance: 'lcp-core',
    title: 'Real-user page load slow (LCP p95)',
    metric: 'rum.lcp',
    dim: 'core',
    stat: 'p95',
    threshold: 4000,
    unit: 'ms',
    forMinutes: 15,
    minCount: 30,
    sev: 3,
  },
  {
    id: 'M02',
    instance: 'ttfb-core',
    title: 'Real-user time to first byte slow (p95)',
    metric: 'rum.ttfb',
    dim: 'core',
    stat: 'p95',
    threshold: 1800,
    unit: 'ms',
    forMinutes: 15,
    minCount: 30,
    sev: 3,
  },
  // LLM providers
  {
    id: 'M03',
    instance: 'latency',
    title: 'LLM response time high (p95)',
    metric: 'llm.latency',
    dim: '*',
    stat: 'p95',
    threshold: 30000,
    unit: 'ms',
    forMinutes: 10,
    minCount: 5,
    sev: 3,
  },
  {
    id: 'M03',
    instance: 'errors',
    title: 'LLM error rate high',
    metric: 'llm.error_pct',
    dim: '*',
    stat: 'value',
    threshold: 20,
    unit: '%',
    forMinutes: 10,
    minCount: 5,
    sev: 3,
  },
  // Process health (per service)
  {
    id: 'B02',
    title: 'Heap pressure',
    metric: 'process.heap_pct',
    dim: '*',
    stat: 'value',
    threshold: 85,
    unit: '%',
    forMinutes: 10,
    sev: 3,
  },
  {
    id: 'B03',
    title: 'Event loop lag (p99)',
    metric: 'process.event_loop_p99',
    dim: '*',
    stat: 'value',
    threshold: 500,
    unit: 'ms',
    forMinutes: 5,
    sev: 3,
  },
];

/** Stable key for a rule (and for its override row). */
export const ruleKey = (
  r: Pick<MetricAlarmRule, 'id' | 'metric' | 'dim' | 'stat' | 'forMinutes'>,
) => `${r.id}|${r.metric}|${r.dim}|${r.stat}|${r.forMinutes}m`;

/** The watchdog instance for one evaluated dimension of a rule. */
export const alarmInstance = (
  r: Pick<MetricAlarmRule, 'instance' | 'dim' | 'metric'>,
  dim: string,
) =>
  r.dim === '*'
    ? `${r.instance ? `${r.instance}:` : ''}${dim || r.metric}`
    : (r.instance ?? (dim || r.metric));

export interface RuleOverride {
  key: string;
  threshold: number | null;
  muted: boolean;
  updatedBy: string | null;
  updatedAt: string | Date;
}

export interface EffectiveRule extends MetricAlarmRule {
  key: string;
  /** The value in this file, shown next to an override. */
  codeThreshold: number;
  overridden: boolean;
  muted: boolean;
}

export function effectiveRules(overrides: RuleOverride[]): EffectiveRule[] {
  const byKey = new Map(overrides.map((o) => [o.key, o]));
  return METRIC_ALARMS.map((r) => {
    const key = ruleKey(r);
    const o = byKey.get(key);
    const threshold = o?.threshold ?? r.threshold;
    return {
      ...r,
      key,
      threshold,
      codeThreshold: r.threshold,
      overridden: !!o && (o.threshold !== null || o.muted),
      muted: !!o?.muted,
    };
  });
}

/** One minute of a series, as stored. */
export interface SeriesRow {
  at: Date | string;
  metric: string;
  dim: string;
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  value: number | null;
}

export interface RuleEvaluation {
  rule: EffectiveRule;
  dim: string;
  /** The window value compared against the threshold (null = no data). */
  current: number | null;
  samples: number;
  active: boolean;
}

/** Evaluate every rule against rows covering at least the longest window. */
export function evaluateRules(
  rules: EffectiveRule[],
  rows: SeriesRow[],
  now: number,
): RuleEvaluation[] {
  const out: RuleEvaluation[] = [];
  for (const rule of rules) {
    const since = now - rule.forMinutes * 60_000;
    const inWindow = rows.filter(
      (r) =>
        r.metric === rule.metric &&
        new Date(r.at).getTime() >= since &&
        (rule.dim === '*' || r.dim === rule.dim),
    );
    const dims = rule.dim === '*' ? [...new Set(inWindow.map((r) => r.dim))] : [rule.dim];
    for (const dim of dims) {
      const rs = inWindow.filter((r) => r.dim === dim && r[rule.stat] !== null);
      const samples = rs.reduce((n, r) => n + r.count, 0);
      let current: number | null = null;
      if (rs.length) {
        const weighted = samples > 0;
        current = weighted
          ? rs.reduce((sum, r) => sum + (r[rule.stat] as number) * r.count, 0) / samples
          : rs.reduce((sum, r) => sum + (r[rule.stat] as number), 0) / rs.length;
        current = Math.round(current * 100) / 100;
      }
      const enough = rule.minCount === undefined || samples >= rule.minCount;
      out.push({
        rule,
        dim,
        current,
        samples,
        active: !rule.muted && enough && current !== null && current > rule.threshold,
      });
    }
  }
  return out;
}

export function formatValue(v: number | null, unit: MetricAlarmRule['unit']): string {
  if (v === null) return '—';
  if (unit === 'ms')
    return v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)} s` : `${Math.round(v)} ms`;
  if (unit === '%') return `${Math.round(v * 10) / 10}%`;
  return String(Math.round(v));
}
