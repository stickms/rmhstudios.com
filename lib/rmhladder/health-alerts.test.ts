import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  detectLadderHealthAlerts, resolveAlertThresholds, DEFAULT_ALERT_THRESHOLDS,
  type AlertInput,
} from './health-alerts';

const now = new Date('2026-07-16T12:00:00.000Z');
const base: AlertInput = {
  now,
  lastCompletedRunAt: new Date(now.getTime() - 60 * 60_000), // 1h ago
  latestRun: { errorCount: 0, discoveredCount: 100 },
  openMassExpiryTasks: 0,
  resumeReady: true,
  thresholds: DEFAULT_ALERT_THRESHOLDS,
};
const codes = (i: AlertInput) => detectLadderHealthAlerts(i).map((a) => a.code);

describe('detectLadderHealthAlerts', () => {
  it('returns no alerts when everything is healthy', () => {
    expect(detectLadderHealthAlerts(base)).toEqual([]);
  });
  it('flags worker_stale when no completed run is within the window', () => {
    expect(codes({ ...base, lastCompletedRunAt: new Date(now.getTime() - 25 * 60 * 60_000) })).toContain('worker_stale');
    expect(codes({ ...base, lastCompletedRunAt: null })).toContain('worker_stale');
  });
  it('flags high_error_run when the latest run error rate exceeds the threshold', () => {
    expect(codes({ ...base, latestRun: { errorCount: 60, discoveredCount: 100 } })).toContain('high_error_run');
  });
  it('does NOT flag high_error_run for a tiny run below minRunForRate', () => {
    expect(codes({ ...base, latestRun: { errorCount: 3, discoveredCount: 3 } })).not.toContain('high_error_run');
  });
  it('flags breaker_tripped when open mass-expiry tasks exist', () => {
    expect(codes({ ...base, openMassExpiryTasks: 2 })).toContain('breaker_tripped');
  });
  it('flags resume_not_ready when resume subsystem is not ready', () => {
    expect(codes({ ...base, resumeReady: false })).toContain('resume_not_ready');
  });
  it('assigns severities (worker_stale/breaker/resume = high, error rate = medium)', () => {
    const alerts = detectLadderHealthAlerts({
      ...base, lastCompletedRunAt: null, openMassExpiryTasks: 1, resumeReady: false,
      latestRun: { errorCount: 60, discoveredCount: 100 },
    });
    const bySeverity = Object.fromEntries(alerts.map((a) => [a.code, a.severity]));
    expect(bySeverity.worker_stale).toBe('high');
    expect(bySeverity.breaker_tripped).toBe('high');
    expect(bySeverity.resume_not_ready).toBe('high');
    expect(bySeverity.high_error_run).toBe('medium');
  });
});

describe('resolveAlertThresholds', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('defaults sanely', () => {
    expect(resolveAlertThresholds({})).toEqual(DEFAULT_ALERT_THRESHOLDS);
    expect(DEFAULT_ALERT_THRESHOLDS.staleRunMs).toBe(86_400_000);
  });
  it('honors valid overrides and ignores junk', () => {
    expect(resolveAlertThresholds({ LADDER_ALERT_ERROR_RATE: '0.25' }).errorRate).toBe(0.25);
    expect(resolveAlertThresholds({ LADDER_ALERT_ERROR_RATE: 'abc' }).errorRate).toBe(0.5);
  });
  it('boundary tests for LADDER_ALERT_ERROR_RATE', () => {
    expect(resolveAlertThresholds({ LADDER_ALERT_ERROR_RATE: '0' }).errorRate).toBe(0.5);
    expect(resolveAlertThresholds({ LADDER_ALERT_ERROR_RATE: '1' }).errorRate).toBe(1);
    expect(resolveAlertThresholds({ LADDER_ALERT_ERROR_RATE: '1.5' }).errorRate).toBe(0.5);
  });
  it('does NOT flag high_error_run when discoveredCount is 0, even with minRunForRate=0', () => {
    expect(codes({
      ...base,
      latestRun: { errorCount: 1, discoveredCount: 0 },
      thresholds: { ...DEFAULT_ALERT_THRESHOLDS, minRunForRate: 0 },
    })).not.toContain('high_error_run');
  });
});
