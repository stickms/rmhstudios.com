import { describe, expect, it } from 'vitest';
import { heartbeatHealth, phaseOf, runbookHref, sortAlarms, type AlarmView } from '../dashboard';

// The alarms page's ordering is the on-call's triage order: an unacked page
// must never sort below something already handled.

const base: AlarmView = {
  key: 'A01',
  id: 'A01',
  sev: 2,
  title: 't',
  detail: '',
  source: 's',
  state: 'firing',
  firedAt: 1000,
  updatedAt: 1000,
  pageCount: 1,
};
const alarm = (over: Partial<AlarmView>): AlarmView => ({ ...base, ...over });

describe('phaseOf / sortAlarms', () => {
  it('puts unacked pages first, then acked, then non-paging, then resolved (newest first)', () => {
    const sorted = sortAlarms([
      alarm({ key: 'old-resolved', state: 'resolved', resolvedAt: 10 }),
      alarm({ key: 'sev3', sev: 3 }),
      alarm({ key: 'acked', acked: { by: 'u', at: 2000 } }),
      alarm({ key: 'new-resolved', state: 'resolved', resolvedAt: 20 }),
      alarm({ key: 'paging' }),
    ]);
    expect(sorted.map((a) => a.key)).toEqual([
      'paging',
      'acked',
      'sev3',
      'new-resolved',
      'old-resolved',
    ]);
    expect(phaseOf(alarm({ sev: 1 }))).toBe('paging');
  });
});

describe('heartbeatHealth', () => {
  it('is waiting before the first check-in, late past the limit', () => {
    expect(heartbeatHealth({ name: 'status', maxAgeMs: 180_000, lastSeen: null }, 1_000_000)).toBe(
      'waiting',
    );
    expect(
      heartbeatHealth({ name: 'status', maxAgeMs: 180_000, lastSeen: 900_000 }, 1_000_000),
    ).toBe('ok');
    expect(
      heartbeatHealth({ name: 'status', maxAgeMs: 180_000, lastSeen: 700_000 }, 1_000_000),
    ).toBe('late');
  });
});

describe('runbookHref', () => {
  it('links the alarm id, honours an explicit runbook, and rejects odd names', () => {
    expect(runbookHref({ id: 'A08' })).toMatch(/docs\/runbooks\/oncall\/A08\.md$/);
    expect(runbookHref({ id: 'STATUS', runbook: 'status-incident' })).toMatch(
      /status-incident\.md$/,
    );
    expect(runbookHref({ id: 'T00', runbook: 'https://example.test/x' })).toBe(
      'https://example.test/x',
    );
    expect(runbookHref({ id: 'x', runbook: 'javascript:alert(1)' })).toBeNull();
  });
});
