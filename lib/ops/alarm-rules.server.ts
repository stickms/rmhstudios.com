// Server side of the metric alarm rules (alarm-rules.ts): load overrides,
// evaluate against the one-minute history, and change overrides from the
// admin page (audited).

import { logAdminAction } from '../admin-audit.server';
import { prisma } from '../prisma.server';
import {
  METRIC_ALARMS,
  effectiveRules,
  evaluateRules,
  ruleKey,
  type RuleEvaluation,
  type RuleOverride,
} from './alarm-rules';

const LONGEST_WINDOW_MS = Math.max(...METRIC_ALARMS.map((r) => r.forMinutes)) * 60_000;

export async function loadOverrides(): Promise<RuleOverride[]> {
  return prisma.opsAlarmOverride.findMany();
}

/** Every rule (with overrides applied) evaluated against the latest minutes. */
export async function evaluateMetricAlarms(now = Date.now()): Promise<RuleEvaluation[]> {
  const metrics = [...new Set(METRIC_ALARMS.map((r) => r.metric))];
  const [overrides, rows] = await Promise.all([
    loadOverrides(),
    prisma.opsMetricMinute.findMany({
      where: { metric: { in: metrics }, at: { gte: new Date(now - LONGEST_WINDOW_MS) } },
      select: {
        at: true,
        metric: true,
        dim: true,
        count: true,
        p50: true,
        p95: true,
        p99: true,
        value: true,
      },
    }),
  ]);
  return evaluateRules(effectiveRules(overrides), rows, now);
}

export const KNOWN_RULE_KEYS = new Set(METRIC_ALARMS.map(ruleKey));

/**
 * Set (or with both fields at their code defaults, clear) a rule's override.
 * `threshold: null` means "use the code value".
 */
export async function setOverride(
  key: string,
  change: { threshold: number | null; muted: boolean },
  adminId: string,
): Promise<void> {
  if (change.threshold === null && !change.muted) {
    await prisma.opsAlarmOverride.deleteMany({ where: { key } });
    await logAdminAction(adminId, 'oncall.rule.reset', { targetType: 'alarm_rule', targetId: key });
    return;
  }
  await prisma.opsAlarmOverride.upsert({
    where: { key },
    create: { key, threshold: change.threshold, muted: change.muted, updatedBy: adminId },
    update: { threshold: change.threshold, muted: change.muted, updatedBy: adminId },
  });
  await logAdminAction(adminId, 'oncall.rule.override', {
    targetType: 'alarm_rule',
    targetId: key,
    detail: JSON.stringify(change),
  });
}
