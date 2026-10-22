// The post-deploy guard's decision (deploy/post-deploy-guard.sh asks for it once
// a minute for 15 minutes after a deploy): should this release be rolled back?
//
// Only the page/API 5xx and latency alarms (A08, A09) decide, and only over
// minutes AFTER the deploy — so a spike that started before it can't roll back
// a release that didn't cause it. Overrides and mutes from /admin/alarms apply.
// Pure: the server wrapper loads rows + overrides.

import {
  effectiveRules,
  evaluateRules,
  formatValue,
  type RuleOverride,
  type SeriesRow,
} from './alarm-rules';

export const GUARDED_ALARMS = new Set(['A08', 'A09']);

export interface GuardVerdict {
  rollback: boolean;
  reasons: string[];
}

export function guardVerdict(
  overrides: RuleOverride[],
  rows: SeriesRow[],
  since: number,
  now: number,
): GuardVerdict {
  const rules = effectiveRules(overrides).filter((r) => GUARDED_ALARMS.has(r.id));
  const afterDeploy = rows.filter((r) => new Date(r.at).getTime() >= since);
  const firing = evaluateRules(rules, afterDeploy, now).filter((e) => e.active);
  return {
    rollback: firing.length > 0,
    reasons: firing.map(
      (e) =>
        `${e.rule.id} ${e.rule.title}${e.dim ? ` (${e.dim})` : ''}: ${formatValue(e.current, e.rule.unit)} > ${formatValue(e.rule.threshold, e.rule.unit)}`,
    ),
  };
}
