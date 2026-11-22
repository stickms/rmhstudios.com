import { describe, expect, it } from 'vitest';
import { DAY_MS } from '../srs/schedule';
import { STAFF_INTERVAL_LESSON_IDS } from '../theory/staff-intervals';
import { buildToday, sprintLevelOf } from './today';
import type { CardRow } from './practice';

const NOW = Date.UTC(2026, 10, 22, 12);
const HOUR = 3_600_000;

/** A reviewed row, overdue (due a day ago) unless `dueInDays` says otherwise. */
function row(cardId: string, o: { dueInDays?: number; reps?: number; metHoursAgo?: number } = {}): CardRow {
  const last = o.metHoursAgo === undefined ? NOW - 5 * DAY_MS : NOW - o.metHoursAgo * HOUR;
  return {
    cardId,
    due: new Date(NOW + (o.dueInDays ?? -1) * DAY_MS).toISOString(),
    lastReviewAt: new Date(last).toISOString(),
    stability: 3,
    difficulty: 5,
    reps: o.reps ?? 3,
    lapses: 0,
  };
}

describe('buildToday', () => {
  it('counts what is due now per drill, and the total', () => {
    const t = buildToday(
      [
        row('treble:64'),
        row('treble:67'),
        row('treble:71', { dueInDays: 4 }), // not due
        row('ear:interval:third'),
        row('sprint:note:treble:64:0'),
        row('sprint:chord:treble:60:minor'),
      ],
      NOW,
      { newPerDay: 10 },
    );
    expect(t.due).toEqual({ staff: 2, interval: 0, ear: 1, sprint: 2 });
    expect(t.reviewed).toEqual({ staff: 3, interval: 0, ear: 1, sprint: 2 });
    expect(t.totalDue).toBe(5);
  });

  it('says how many new cards are left today', () => {
    const rows = [
      row('treble:64', { reps: 1, metHoursAgo: 2, dueInDays: 1 }),
      row('treble:67', { reps: 1, metHoursAgo: 30, dueInDays: 1 }),
    ];
    const t = buildToday(rows, NOW, { newPerDay: 10 });
    expect(t.newIntroduced).toBe(1);
    expect(t.newLeft).toBe(9);
    expect(buildToday(rows, NOW, { newPerDay: 0 }).newLeft).toBe(0);
    expect(buildToday(rows, NOW, { newPerDay: Number.NaN }).newLeft).toBe(0);
  });

  it('points to the ear lesson with the most due items in its pool', () => {
    const t = buildToday([row('ear:interval:fifth'), row('ear:interval:octave'), row('ear:interval:second')], NOW, {
      newPerDay: 10,
    });
    expect(t.ear).toEqual({ lessonId: 'ear-fifth-octave', due: 2 });
  });

  it('points to a chord lesson when chords are what is due', () => {
    const t = buildToday([row('ear:chord:minor')], NOW, { newPerDay: 10 });
    expect(t.ear).toEqual({ lessonId: 'ear-major-minor', due: 1 });
  });

  it('points to the interval-reading lesson with the most due items in its pool and directions', () => {
    const t = buildToday([row('int:up:second'), row('int:up:third'), row('int:down:third')], NOW, { newPerDay: 10 });
    expect(t.due.interval).toBe(3);
    // The lesson that holds the most of them (one covering both directions and every size holds all three).
    expect(STAFF_INTERVAL_LESSON_IDS).toContain(t.interval!.lessonId);
    expect(t.interval!.due).toBe(3);
    expect(buildToday([row('treble:64')], NOW, { newPerDay: 10 }).interval).toBeNull();
  });

  it('points to the Sprint level with the most due items', () => {
    const t = buildToday(
      [row('sprint:note:treble:64:1'), row('sprint:note:bass:48:-1'), row('sprint:note:treble:67:0')],
      NOW,
      { newPerDay: 10 },
    );
    expect(t.sprint).toEqual({ level: 'accidental', due: 2 });
  });

  it('names no target when nothing of that drill is due, and is quiet for a new learner', () => {
    const t = buildToday([row('treble:64')], NOW, { newPerDay: 10 });
    expect(t.ear).toBeNull();
    expect(t.sprint).toBeNull();
    const none = buildToday([], NOW, { newPerDay: 10 });
    expect(none.totalDue).toBe(0);
    expect(none.newLeft).toBe(10);
  });
});

describe('sprintLevelOf', () => {
  it('maps a Sprint item to the level that deals it', () => {
    expect(sprintLevelOf('sprint:note:treble:64:0')).toBe('note');
    expect(sprintLevelOf('sprint:note:bass:48:0')).toBe('note-both');
    expect(sprintLevelOf('sprint:note:treble:65:1')).toBe('accidental');
    expect(sprintLevelOf('sprint:chord:treble:60:major')).toBe('triad');
    expect(sprintLevelOf('treble:64')).toBeNull();
  });
});
