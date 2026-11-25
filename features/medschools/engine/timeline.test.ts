import { describe, expect, it } from 'vitest';
import type { ChanceDto, TrackerApplicationDto } from '../medschools.contract';
import { buildTimeline, silenceOf } from './timeline';

const school = (slug: string, name = slug) => ({
  slug,
  name,
  shortName: name,
  degree: 'MD' as const,
  state: 'NC',
  active: true,
});
const app = (id: string, slug: string, milestones: TrackerApplicationDto['milestones']): TrackerApplicationDto => ({
  id,
  school: school(slug, slug.toUpperCase()),
  program: 'REG',
  notes: null,
  milestones,
});

describe('buildTimeline', () => {
  it('merges schools oldest first with the wait from the step before', () => {
    const rows = buildTimeline([
      app('a', 'duke', [
        { type: 'SUBMITTED', date: '2026-06-10' },
        { type: 'COMPLETE', date: '2026-07-20' },
        { type: 'INTERVIEW', date: '2026-08-23' },
        { type: 'ACCEPTANCE', date: '2026-10-25' },
      ]),
      app('b', 'unc', [
        { type: 'COMPLETE', date: '2026-07-21' },
        { type: 'REJECTION', date: '2026-09-01' },
      ]),
    ]);
    expect(rows.map((r) => `${r.date} ${r.school.slug} ${r.type}`)).toEqual([
      '2026-06-10 duke SUBMITTED',
      '2026-07-20 duke COMPLETE',
      '2026-07-21 unc COMPLETE',
      '2026-08-23 duke INTERVIEW',
      '2026-09-01 unc REJECTION',
      '2026-10-25 duke ACCEPTANCE',
    ]);
    const by = (type: string, slug: string) => rows.find((r) => r.type === type && r.school.slug === slug)!;
    expect(by('COMPLETE', 'duke')).toMatchObject({ waitDays: 40, since: 'SUBMITTED' });
    expect(by('INTERVIEW', 'duke')).toMatchObject({ waitDays: 34, since: 'COMPLETE' });
    // A decision counts from the invite when there is one, from complete otherwise.
    expect(by('ACCEPTANCE', 'duke')).toMatchObject({ waitDays: 63, since: 'INTERVIEW' });
    expect(by('REJECTION', 'unc')).toMatchObject({ waitDays: 42, since: 'COMPLETE' });
    expect(by('SUBMITTED', 'duke')).toMatchObject({ waitDays: null, since: null });
  });

  it('no wait when the earlier step is missing or dated after it; same-day steps are 0 days', () => {
    const rows = buildTimeline([
      app('a', 'duke', [
        { type: 'INTERVIEW', date: '2026-08-01' },
        { type: 'COMPLETE', date: '2026-08-05' },
        { type: 'SECONDARY', date: '2026-08-05' },
      ]),
    ]);
    const by = (type: string) => rows.find((r) => r.type === type)!;
    expect(by('INTERVIEW').waitDays).toBeNull();
    expect(by('SECONDARY')).toMatchObject({ waitDays: 0, since: 'COMPLETE' });
    expect(buildTimeline([])).toEqual([]);
  });
});

const chance = (o: Partial<ChanceDto>): ChanceDto => ({
  applicationId: 'a',
  school: { slug: 'duke', shortName: 'Duke', name: 'Duke', active: true },
  program: 'REG',
  status: 'estimate',
  completeOn: '2026-10-01',
  completeFrom: 'complete',
  invitedOn: null,
  asOf: null,
  basis: null,
  points: [],
  waitingWeeks: 6,
  typical: { halfWeek: 4, mostWeek: 9, lastWeek: 13, basis: 20 },
  ...o,
});

describe('silenceOf', () => {
  it('places the wait against the half and most weeks', () => {
    const at = (weeks: number) => silenceOf(chance({ waitingWeeks: weeks }));
    expect(at(3)).toMatchObject({ kind: 'silent', position: 'before-half' });
    expect(at(4)).toMatchObject({ position: 'before-most' });
    expect(at(9)).toMatchObject({ position: 'before-most' });
    expect(at(10)).toMatchObject({ position: 'after-most' });
    expect(at(13)).toMatchObject({ position: 'after-most' });
    expect(at(14)).toMatchObject({ position: 'beyond-range', lastWeek: 13 });
    expect(at(6)).toEqual({
      kind: 'silent',
      weeks: 6,
      halfWeek: 4,
      mostWeek: 9,
      lastWeek: 13,
      position: 'before-most',
    });
  });

  it('beyond (past the curve horizon) still compares; no range is plain', () => {
    expect(silenceOf(chance({ status: 'beyond' }))?.kind).toBe('silent');
    expect(silenceOf(chance({ typical: null }))).toEqual({ kind: 'plain', weeks: 6 });
  });

  it('thin data says so and compares nothing', () => {
    expect(silenceOf(chance({ status: 'thin', typical: null }))).toEqual({ kind: 'thin', weeks: 6 });
  });

  it('does not apply to invited, closed, not-complete or missing rows', () => {
    for (const status of ['invited', 'closed', 'no-complete', 'not-complete-yet'] as const) {
      expect(silenceOf(chance({ status, waitingWeeks: null, typical: null }))).toBeNull();
    }
    expect(silenceOf(undefined)).toBeNull();
  });
});

describe('no complete date: the secondary submitted date stands in (owner 2026-11-24)', () => {
  it('measures the invite from the secondary submitted date when there is no complete date', () => {
    const rows = buildTimeline([
      app('a', 'duke', [
        { type: 'SECONDARY', date: '2026-07-01' },
        { type: 'SECONDARY_SUBMITTED', date: '2026-07-10' },
        { type: 'INTERVIEW', date: '2026-08-21' },
      ]),
    ]);
    const invite = rows.find((r) => r.type === 'INTERVIEW')!;
    expect(invite.since).toBe('SECONDARY_SUBMITTED');
    expect(invite.waitDays).toBe(42);
  });
  it('still prefers the complete date when there is one', () => {
    const rows = buildTimeline([
      app('a', 'duke', [
        { type: 'SECONDARY_SUBMITTED', date: '2026-07-10' },
        { type: 'COMPLETE', date: '2026-07-15' },
        { type: 'INTERVIEW', date: '2026-08-21' },
      ]),
    ]);
    expect(rows.find((r) => r.type === 'INTERVIEW')!.since).toBe('COMPLETE');
  });
});
