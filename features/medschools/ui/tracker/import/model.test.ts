import { describe, expect, it } from 'vitest';
import type { MedImportPreviewRes } from '../../../medschools.contract';
import {
  cycleChoices,
  editDate,
  existingIndex,
  fileProblem,
  retarget,
  saveBody,
  statusOf,
  summarize,
  toEditable,
  type Existing,
} from './model';

const now = new Date('2026-11-23T12:00:00Z');
const duke = { slug: 'duke', name: 'Duke', shortName: 'Duke', degree: 'MD' as const, state: 'NC' };
const preview = (): MedImportPreviewRes => ({
  cycleYear: 2027,
  cycleFrom: 'dates',
  truncated: false,
  dropped: 0,
  tier: 'free',
  remainingToday: 24,
  dailyCap: 25,
  rows: [
    {
      key: 'duke|REG',
      schoolName: 'Duke',
      school: duke,
      program: 'REG',
      milestones: [
        { type: 'SUBMITTED', date: '2026-06-10', yearInferred: false, ambiguous: false, from: '6/10/2026' },
        { type: 'INTERVIEW', date: '2026-10-05', yearInferred: true, ambiguous: true, from: '10/5' },
      ],
    },
    { key: 'nowhere|REG', schoolName: 'Nowhere U', school: null, program: 'REG', milestones: [
      { type: 'SUBMITTED', date: '2026-06-12', yearInferred: false, ambiguous: false, from: 'x' },
    ] },
  ],
});
const none = () => undefined;

describe('import preview rules', () => {
  it('starts matched rows ticked and unmatched rows unticked', () => {
    const rows = toEditable(preview());
    expect(rows.map((r) => r.include)).toEqual([true, false]);
  });

  it('writes new dates and nothing from an unmatched or unticked row', () => {
    const rows = toEditable(preview());
    expect(saveBody(rows, none, 2027, now).rows).toEqual([
      {
        slug: 'duke',
        program: 'REG',
        milestones: [
          { type: 'SUBMITTED', date: '2026-06-10', overwrite: false },
          { type: 'INTERVIEW', date: '2026-10-05', overwrite: false },
        ],
      },
    ]);
    rows[0]!.milestones[1]!.skip = true;
    expect(summarize(rows, none, 2027, now)).toEqual({ dates: 1, schools: 1, replacing: 0 });
    rows[0]!.include = false;
    expect(saveBody(rows, none, 2027, now).rows).toEqual([]);
  });

  it('keeps a conflicting date unless it is ticked', () => {
    const rows = toEditable(preview());
    const existing: Existing = new Map([['SUBMITTED', '2026-06-01']]);
    const of = () => existing;
    expect(statusOf(rows[0]!.milestones[0]!, existing, 2027, now)).toBe('conflict');
    expect(saveBody(rows, of, 2027, now).rows[0]!.milestones.map((m) => m.type)).toEqual(['INTERVIEW']);
    rows[0]!.milestones[0]!.replace = true;
    expect(saveBody(rows, of, 2027, now).rows[0]!.milestones[0]).toEqual({
      type: 'SUBMITTED',
      date: '2026-06-10',
      overwrite: true,
    });
  });

  it('treats the same date as nothing to do and an out-of-cycle date as invalid', () => {
    const rows = toEditable(preview());
    const same: Existing = new Map([['SUBMITTED', '2026-06-10']]);
    expect(statusOf(rows[0]!.milestones[0]!, same, 2027, now)).toBe('same');
    const m = { ...rows[0]!.milestones[0]!, date: '2019-01-01' };
    expect(statusOf(m, undefined, 2027, now)).toBe('invalid');
  });

  it('retargets only years the file did not write, and a hand edit is final', () => {
    let rows = retarget(toEditable(preview()), 2026, now);
    expect(rows[0]!.milestones[0]!.date).toBe('2026-06-10');
    expect(rows[0]!.milestones[1]!.date).toMatch(/^2025-10-05$/);
    rows = editDate(toEditable(preview()), 'duke|REG', 'INTERVIEW', '2026-10-06');
    const m = rows[0]!.milestones[1]!;
    expect([m.yearInferred, m.ambiguous]).toEqual([false, false]);
    expect(retarget(rows, 2026, now)[0]!.milestones[1]!.date).toBe('2026-10-06');
  });

  it('indexes the tracker only for the chosen cycle', () => {
    const tracker = {
      sharingAvailable: true,
      cycles: [2027],
      cycle: {
        cycleYear: 2027,
        homeState: null,
        shareAnonymously: false,
        applications: [
          { id: 'a', school: { ...duke, active: true }, program: 'REG' as const, notes: null, milestones: [{ type: 'SUBMITTED' as const, date: '2026-06-01' }] },
        ],
      },
    };
    expect(existingIndex(tracker, 2027).get('duke|REG')?.get('SUBMITTED')).toBe('2026-06-01');
    expect(existingIndex(tracker, 2026).size).toBe(0);
  });

  it('offers cycles in the tracker window and refuses files the server would', () => {
    expect(cycleChoices(now)).toContain(2027);
    expect(fileProblem({ name: 'a.xlsx', type: '', size: 10 })).toBeNull();
    expect(fileProblem({ name: 'a.exe', type: 'application/x-msdownload', size: 10 })).toBe('unsupported');
    expect(fileProblem({ name: 'a.csv', type: 'text/csv', size: 3 * 1024 * 1024 })).toBe('too-large');
  });
});
