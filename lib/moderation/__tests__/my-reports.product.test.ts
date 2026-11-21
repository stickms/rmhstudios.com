import { describe, expect, it } from 'vitest';
import {
  MY_REPORTS_WINDOW_DAYS,
  OUTCOME_PREVIEW,
  canWithdraw,
  isOpenStatus,
  outcomeOf,
  reporterStatus,
  snippet,
  statusWhere,
  unavailableTarget,
  windowStart,
} from '@/lib/moderation/my-reports';

describe('reporterStatus', () => {
  it('maps every stored status to what the reporter sees', () => {
    expect(reporterStatus({ status: 'PENDING', withdrawnAt: null })).toBe('WAITING');
    expect(reporterStatus({ status: 'REVIEWING', withdrawnAt: null })).toBe('REVIEWING');
    expect(reporterStatus({ status: 'RESOLVED', withdrawnAt: null })).toBe('ACTION_TAKEN');
    expect(reporterStatus({ status: 'DISMISSED', withdrawnAt: null })).toBe('NO_VIOLATION');
    expect(reporterStatus({ status: 'DISMISSED', withdrawnAt: new Date() })).toBe('WITHDRAWN');
  });
});

describe('outcomes', () => {
  it('has an outcome only for a decision, never for open or withdrawn reports', () => {
    expect(outcomeOf({ status: 'RESOLVED', withdrawnAt: null })).toBe('ACTION_TAKEN');
    expect(outcomeOf({ status: 'DISMISSED', withdrawnAt: null })).toBe('NO_VIOLATION');
    expect(outcomeOf({ status: 'DISMISSED', withdrawnAt: new Date() })).toBeNull();
    expect(outcomeOf({ status: 'PENDING', withdrawnAt: null })).toBeNull();
    expect(outcomeOf({ status: 'REVIEWING', withdrawnAt: null })).toBeNull();
  });

  it('announces in plain words that say nothing about the action', () => {
    expect(OUTCOME_PREVIEW).toEqual({
      ACTION_TAKEN: 'Your report was reviewed: action taken',
      NO_VIOLATION: 'Your report was reviewed: no violation found',
    });
  });

  it('is open while waiting or reviewed, and only a waiting report can be withdrawn', () => {
    expect(isOpenStatus('WAITING')).toBe(true);
    expect(isOpenStatus('REVIEWING')).toBe(true);
    for (const s of ['ACTION_TAKEN', 'NO_VIOLATION', 'WITHDRAWN'] as const) expect(isOpenStatus(s)).toBe(false);
    expect(canWithdraw('WAITING')).toBe(true);
    expect(canWithdraw('REVIEWING')).toBe(false);
    expect(canWithdraw('WITHDRAWN')).toBe(false);
  });
});

describe('filters and labels', () => {
  it('selects stored statuses for the open and closed tabs, and all for the rest', () => {
    expect(statusWhere('open')).toEqual({ status: { in: ['PENDING', 'REVIEWING'] } });
    expect(statusWhere('closed')).toEqual({ status: { in: ['RESOLVED', 'DISMISSED'] } });
    expect(statusWhere('all')).toEqual({});
  });

  it('flattens whitespace and cuts long text', () => {
    expect(snippet('  a\n\n b   c ')).toBe('a b c');
    expect(snippet('x'.repeat(80), 10)).toBe(`${'x'.repeat(9)}…`);
    expect(snippet(null)).toBe('');
  });

  it('an unavailable target carries no text and no link', () => {
    expect(unavailableTarget('comment')).toEqual({ kind: 'comment', available: false, name: null, href: null });
  });

  it('looks back 180 days', () => {
    const now = new Date('2026-11-23T00:00:00Z');
    expect(MY_REPORTS_WINDOW_DAYS).toBe(180);
    expect(now.getTime() - windowStart(now).getTime()).toBe(180 * 86_400_000);
  });
});
