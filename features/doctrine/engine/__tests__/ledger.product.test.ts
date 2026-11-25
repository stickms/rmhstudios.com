import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XP_ACTIONS } from '../constants';
import {
  ACTION_LABEL_KEYS,
  LEDGER_ACTIONS,
  OTHER_LABEL,
  bucketDays,
  decodeLedgerCursor,
  encodeLedgerCursor,
  labelKeyFor,
  resolveTimeZone,
  summarize,
} from '../ledger';

describe('ledger labels', () => {
  it('has a label key for every XP_ACTIONS key and the weekly decay', () => {
    for (const action of Object.keys(XP_ACTIONS)) expect(ACTION_LABEL_KEYS[action], action).toBeTruthy();
    expect(ACTION_LABEL_KEYS.WEEKLY_DECAY).toBe('action-weekly-decay');
    expect(LEDGER_ACTIONS).toContain('WEEKLY_DECAY');
  });

  it('gives unknown actions "Other", including names that exist on Object.prototype', () => {
    expect(labelKeyFor('RETIRED_ACTION')).toBe(OTHER_LABEL);
    expect(labelKeyFor('constructor')).toBe(OTHER_LABEL);
    expect(labelKeyFor('PUZZLE_SOLVE')).toBe('action-puzzle-solve');
  });

  it('keeps every label key a literal t() call in the component, with the namespace entry', () => {
    const source = readFileSync(join(__dirname, '../../ui/reputation/xp-ledger.tsx'), 'utf8');
    for (const key of Object.values(ACTION_LABEL_KEYS)) expect(source, key).toContain(`case '${key}':`);
    for (const key of [...Object.values(ACTION_LABEL_KEYS), OTHER_LABEL]) {
      expect(source, key).toContain(`t('${key}', {`);
    }
    const catalogue = JSON.parse(readFileSync(join(__dirname, '../../../../locales/en/doctrine-ledger.json'), 'utf8'));
    for (const key of [...Object.values(ACTION_LABEL_KEYS), OTHER_LABEL]) expect(catalogue[key], key).toBeTruthy();
  });
});

describe('summarize', () => {
  it('splits gained and lost and nets per action, largest change first', () => {
    const s = summarize([
      { action: 'PUZZLE_SOLVE', xpDelta: 10 },
      { action: 'PUZZLE_SOLVE', xpDelta: 10 },
      { action: 'PUZZLE_FIRST_SOLVE', xpDelta: 50 },
      { action: 'WEEKLY_DECAY', xpDelta: -12 },
      { action: 'INCIDENT_REACTION', xpDelta: 1 },
    ]);
    expect(s.gained).toBe(71);
    expect(s.lost).toBe(12);
    expect(s.byAction).toEqual([
      { action: 'PUZZLE_FIRST_SOLVE', xp: 50 },
      { action: 'PUZZLE_SOLVE', xp: 20 },
      { action: 'WEEKLY_DECAY', xp: -12 },
      { action: 'INCIDENT_REACTION', xp: 1 },
    ]);
  });

  it('is empty for no rows and drops actions that net to zero', () => {
    expect(summarize([])).toEqual({ gained: 0, lost: 0, byAction: [] });
    expect(
      summarize([
        { action: 'A', xpDelta: 5 },
        { action: 'A', xpDelta: -5 },
      ]).byAction,
    ).toEqual([]);
  });
});

describe('day bucketing', () => {
  const lateUtc = new Date('2026-11-20T23:30:00Z');
  it('counts only earning rows', () => {
    expect(
      bucketDays(
        [
          { xpDelta: 10, createdAt: lateUtc },
          { xpDelta: -5, createdAt: lateUtc },
          { xpDelta: 0, createdAt: lateUtc },
        ],
        'UTC',
      ),
    ).toEqual({ '2026-11-20': 1 });
  });

  it('puts the same instant on different days across a time-zone boundary', () => {
    const rows = [{ xpDelta: 10, createdAt: lateUtc }];
    expect(bucketDays(rows, 'UTC')).toEqual({ '2026-11-20': 1 });
    expect(bucketDays(rows, 'Asia/Tokyo')).toEqual({ '2026-11-21': 1 });
    expect(bucketDays(rows, 'America/Los_Angeles')).toEqual({ '2026-11-20': 1 });
  });

  it('falls back to UTC for an invalid or missing zone', () => {
    const rows = [{ xpDelta: 10, createdAt: lateUtc }];
    expect(resolveTimeZone('Not/AZone')).toBe('UTC');
    expect(resolveTimeZone(undefined)).toBe('UTC');
    expect(bucketDays(rows, 'Not/AZone')).toEqual({ '2026-11-20': 1 });
    expect(bucketDays(rows, undefined)).toEqual({ '2026-11-20': 1 });
  });
});

describe('cursor', () => {
  it('round trips', () => {
    const at = new Date('2026-11-20T12:34:56.789Z');
    const back = decodeLedgerCursor(encodeLedgerCursor({ at, id: 'clx1abc' }));
    expect(back?.id).toBe('clx1abc');
    expect(back?.at.getTime()).toBe(at.getTime());
  });

  it('rejects anything that is not a cursor', () => {
    expect(decodeLedgerCursor('')).toBeNull();
    expect(decodeLedgerCursor('!!!')).toBeNull();
    expect(decodeLedgerCursor('x'.repeat(201))).toBeNull();
    expect(decodeLedgerCursor(encodeLedgerCursor({ at: new Date(1), id: 'a' }).slice(0, 2))).toBeNull();
  });
});
