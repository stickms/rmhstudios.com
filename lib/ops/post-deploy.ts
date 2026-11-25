// The post-deploy guard's decision (deploy/post-deploy-guard.sh asks for it once
// a minute for 15 minutes after a deploy): should this release be rolled back?
//
// Only the page/API 5xx and latency alarms (A08, A09) decide, and only over
// minutes AFTER the deploy — so a spike that started before it can't roll back
// a release that didn't cause it. Overrides and mutes from /admin/alarms apply.
// Two things keep lag from rolling back a healthy release. The first minutes
// after a deploy are cold (empty caches, cold pool, JIT): they are skipped
// (WARMUP_MINUTES), and a rule is judged only once it has seen enough
// post-warm-up data (min(its own window, MAX_COVERAGE_MINUTES)) — otherwise a
// 10-minute p95 rule would fire on three cold minutes. A release that is truly
// broken is caught earlier by the deploy's own smoke gate and bake.
// Pure: the server wrapper loads rows + overrides.

import { effectiveRules, evaluateRules, formatValue, type RuleOverride, type SeriesRow } from './alarm-rules';

export const GUARDED_ALARMS = new Set(['A08', 'A09']);

/** Minutes after the deploy whose data is ignored: cold caches, not the release. */
export const WARMUP_MINUTES = 3;
/** A rule needs this many post-warm-up minutes at most before it may fire. */
export const MAX_COVERAGE_MINUTES = 5;

export interface GuardVerdict {
  rollback: boolean;
  reasons: string[];
}

export function guardVerdict(overrides: RuleOverride[], rows: SeriesRow[], since: number, now: number): GuardVerdict {
  const warmEnd = since + WARMUP_MINUTES * 60_000;
  const covered = (now - warmEnd) / 60_000;
  const rules = effectiveRules(overrides).filter(
    (r) => GUARDED_ALARMS.has(r.id) && covered >= Math.min(r.forMinutes, MAX_COVERAGE_MINUTES),
  );
  const afterDeploy = rows.filter((r) => new Date(r.at).getTime() >= warmEnd);
  const firing = evaluateRules(rules, afterDeploy, now).filter((e) => e.active);
  return {
    rollback: firing.length > 0,
    reasons: firing.map(
      (e) =>
        `${e.rule.id} ${e.rule.title}${e.dim ? ` (${e.dim})` : ''}: ${formatValue(e.current, e.rule.unit)} > ${formatValue(e.rule.threshold, e.rule.unit)}`,
    ),
  };
}
