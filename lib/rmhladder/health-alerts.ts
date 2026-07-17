export type LadderAlertCode =
  'worker_stale' | 'high_error_run' | 'breaker_tripped' | 'resume_not_ready';

export interface LadderHealthAlert {
  code: LadderAlertCode;
  severity: 'high' | 'medium';
  message: string;
}

export interface AlertThresholds {
  staleRunMs: number;
  errorRate: number;
  minRunForRate: number;
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  staleRunMs: 86_400_000, // 24h ≈ 2× the 12h cadence
  errorRate: 0.5,
  minRunForRate: 10,
};

function num(
  value: string | undefined,
  fallback: number,
  predicate: (n: number) => boolean,
): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && predicate(parsed) ? parsed : fallback;
}

export function resolveAlertThresholds(
  env: {
    LADDER_ALERT_STALE_RUN_MS?: string;
    LADDER_ALERT_ERROR_RATE?: string;
    LADDER_ALERT_MIN_RUN_FOR_RATE?: string;
  } = process.env,
): AlertThresholds {
  return {
    staleRunMs: num(
      env.LADDER_ALERT_STALE_RUN_MS,
      DEFAULT_ALERT_THRESHOLDS.staleRunMs,
      (n) => n > 0,
    ),
    errorRate: num(
      env.LADDER_ALERT_ERROR_RATE,
      DEFAULT_ALERT_THRESHOLDS.errorRate,
      (n) => n > 0 && n <= 1,
    ),
    minRunForRate: num(
      env.LADDER_ALERT_MIN_RUN_FOR_RATE,
      DEFAULT_ALERT_THRESHOLDS.minRunForRate,
      (n) => n >= 0,
    ),
  };
}

export interface AlertInput {
  now: Date;
  lastCompletedRunAt: Date | null;
  latestRun: { errorCount: number; discoveredCount: number } | null;
  openMassExpiryTasks: number;
  resumeReady: boolean;
  thresholds: AlertThresholds;
}

/** Pure: compute active health alerts from already-gathered signals. */
export function detectLadderHealthAlerts(input: AlertInput): LadderHealthAlert[] {
  const alerts: LadderHealthAlert[] = [];
  const { thresholds: t } = input;

  const runAgeMs = input.lastCompletedRunAt
    ? input.now.getTime() - input.lastCompletedRunAt.getTime()
    : Infinity;
  if (runAgeMs >= t.staleRunMs) {
    alerts.push({
      code: 'worker_stale',
      severity: 'high',
      message: input.lastCompletedRunAt
        ? `No completed scrape run in ${Math.round(runAgeMs / 3_600_000)}h (threshold ${Math.round(t.staleRunMs / 3_600_000)}h).`
        : 'No completed scrape run on record — the worker may not be running.',
    });
  }

  if (input.openMassExpiryTasks > 0) {
    alerts.push({
      code: 'breaker_tripped',
      severity: 'high',
      message: `${input.openMassExpiryTasks} open mass-expiry review task(s) — the circuit breaker tripped on a source.`,
    });
  }

  if (!input.resumeReady) {
    alerts.push({
      code: 'resume_not_ready',
      severity: 'high',
      message: 'Resume subsystem is not ready (object storage or encryption key unconfigured).',
    });
  }

  const r = input.latestRun;
  if (r && r.discoveredCount > 0 && r.discoveredCount >= t.minRunForRate) {
    const rate = r.errorCount / Math.max(1, r.discoveredCount);
    if (rate > t.errorRate) {
      alerts.push({
        code: 'high_error_run',
        severity: 'medium',
        message: `Latest run error rate ${Math.round(rate * 100)}% (${r.errorCount}/${r.discoveredCount}) exceeds ${Math.round(t.errorRate * 100)}%.`,
      });
    }
  }

  return alerts;
}
