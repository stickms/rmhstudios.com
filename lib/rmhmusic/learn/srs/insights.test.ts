import { describe, expect, it } from 'vitest';
import type { CardRow } from '../content/practice';
import { DAY_MS } from './schedule';
import { buildInsights, describeItem, endOfLocalDay, recallPercent } from './insights';

const NOW = Date.UTC(2026, 10, 22, 12);

/** A reviewed row last answered `agoDays` ago, due `dueInDays` from now (negative: overdue). */
function row(
  cardId: string,
  o: { stability: number; agoDays: number; dueInDays: number; reps?: number; lapses?: number },
): CardRow {
  return {
    cardId,
    due: new Date(NOW + o.dueInDays * DAY_MS).toISOString(),
    lastReviewAt: new Date(NOW - o.agoDays * DAY_MS).toISOString(),
    stability: o.stability,
    difficulty: 5,
    reps: o.reps ?? 3,
    lapses: o.lapses ?? 0,
  };
}

describe('buildInsights', () => {
  const rows = [
    row('treble:64', { stability: 30, agoDays: 1, dueInDays: 20 }), // strong, not due
    row('treble:67', { stability: 2, agoDays: 6, dueInDays: -4 }), // weak and overdue
    row('treble:71', { stability: 10, agoDays: 5, dueInDays: 0.5 }), // due later today
    row('ear:interval:third', { stability: 3, agoDays: 4, dueInDays: 3 }), // due this week
    row('sprint:note:treble:64:1', { stability: 5, agoDays: 2, dueInDays: 9 }),
    { ...row('treble:72', { stability: 0, agoDays: 0, dueInDays: 0, reps: 0 }), lastReviewAt: null }, // never answered
    row('nonsense:1', { stability: 5, agoDays: 1, dueInDays: 1 }), // no drill makes this
  ];
  const ins = buildInsights(rows, NOW, NOW + 18 * 3_600_000);

  it('counts what is due now, today and this week per family, cumulatively', () => {
    expect(ins.families.staff).toEqual({ reviewed: 3, dueNow: 1, dueToday: 2, dueWeek: 2 });
    expect(ins.families.ear).toEqual({ reviewed: 1, dueNow: 0, dueToday: 0, dueWeek: 1 });
    expect(ins.families.sprint).toEqual({ reviewed: 1, dueNow: 0, dueToday: 0, dueWeek: 0 });
    expect(ins.families.interval).toEqual({ reviewed: 0, dueNow: 0, dueToday: 0, dueWeek: 0 });
  });

  it('counts interval-reading items as their own family', () => {
    const only = buildInsights(
      [
        row('int:up:third', { stability: 3, agoDays: 4, dueInDays: -1 }),
        row('int:down:fifth', { stability: 9, agoDays: 2, dueInDays: 6 }),
      ],
      NOW,
      NOW + 18 * 3_600_000,
    );
    expect(only.families.interval).toEqual({ reviewed: 2, dueNow: 1, dueToday: 1, dueWeek: 2 });
    expect(only.families.staff.reviewed).toBe(0);
  });

  it('ignores a never-answered row and an id no drill produces', () => {
    expect(ins.reviewed).toBe(5);
  });

  it('lists the weakest first by recall and the strongest first by stability', () => {
    expect(ins.weakest.staff.map((s) => s.cardId)).toEqual(['treble:67', 'treble:71', 'treble:64']);
    expect(ins.strongest.staff.map((s) => s.cardId)).toEqual(['treble:64', 'treble:71', 'treble:67']);
    expect(ins.weakest.staff[0]!.recall).toBeLessThan(ins.weakest.staff[1]!.recall);
  });

  it('does not call an item strong after a single answer', () => {
    const once = buildInsights([row('treble:64', { stability: 30, agoDays: 1, dueInDays: 20, reps: 1 })], NOW);
    expect(once.strongest.staff).toEqual([]);
    expect(once.weakest.staff).toHaveLength(1);
  });

  it('keeps at most `limit` of each list', () => {
    const many = Array.from({ length: 9 }, (_, i) =>
      row(`treble:${[59, 60, 62, 64, 65, 67, 69, 71, 72][i]}`, { stability: i + 1, agoDays: 3, dueInDays: 1 }),
    );
    expect(buildInsights(many, NOW, NOW, 4).weakest.staff).toHaveLength(4);
    expect(buildInsights(many, NOW, NOW, 0).weakest.staff).toEqual([]);
  });

  it('is empty and honest for a new learner', () => {
    const none = buildInsights([], NOW);
    expect(none.reviewed).toBe(0);
    expect(none.families.staff).toEqual({ reviewed: 0, dueNow: 0, dueToday: 0, dueWeek: 0 });
    expect(none.weakest.ear).toEqual([]);
  });
});

describe('describeItem', () => {
  it('names a staff card by its clef and note', () => {
    expect(describeItem('treble:64')).toEqual({ kind: 'staff', clef: 'treble', name: 'E4' });
  });

  it('names a sharp or flat card by the note as written, not by its sounding pitch', () => {
    expect(describeItem('treble:66:sharp')).toEqual({ kind: 'staff', clef: 'treble', name: 'F♯4' });
    expect(describeItem('treble:70:flat')).toEqual({ kind: 'staff', clef: 'treble', name: 'B♭4' });
  });

  it("names a key card by the note and its key, so two keys' cards for one pitch differ", () => {
    expect(describeItem('key:G:treble:66')).toEqual({ kind: 'staff', clef: 'treble', name: 'F♯4', key: 'G' });
    const flatKey = describeItem('key:Bb:treble:70');
    expect(flatKey).toMatchObject({ kind: 'staff', clef: 'treble', key: 'B♭' });
  });

  it('names an interval read off the staff by its direction and name', () => {
    expect(describeItem('int:up:third')).toEqual({ kind: 'staff-interval', direction: 'up', name: 'third' });
    expect(describeItem('int:down:minor-second')).toEqual({
      kind: 'staff-interval',
      direction: 'down',
      name: 'minor-second',
    });
  });

  it('names ear items by their interval or chord', () => {
    expect(describeItem('ear:interval:fifth')).toEqual({ kind: 'ear-interval', name: 'fifth' });
    expect(describeItem('ear:chord:minor')).toEqual({ kind: 'ear-chord', name: 'minor' });
  });

  it('spells a Sprint note with its printed accidental', () => {
    expect(describeItem('sprint:note:treble:65:1')).toEqual({ kind: 'sprint-note', clef: 'treble', name: 'F♯4' });
    expect(describeItem('sprint:note:bass:47:-1')).toEqual({ kind: 'sprint-note', clef: 'bass', name: 'B♭2' });
    expect(describeItem('sprint:note:treble:64:0')).toEqual({ kind: 'sprint-note', clef: 'treble', name: 'E4' });
  });

  it('names a Sprint chord by its lowest written note and quality', () => {
    expect(describeItem('sprint:chord:treble:60:minor')).toEqual({
      kind: 'sprint-chord',
      clef: 'treble',
      root: 'C4',
      quality: 'minor',
    });
  });

  it('is null for an id no drill produces', () => {
    expect(describeItem('nonsense:1')).toBeNull();
    expect(describeItem('ear:interval:tritone')).toBeNull();
  });
});

describe('helpers', () => {
  it('endOfLocalDay is the last millisecond of the same local day', () => {
    const end = endOfLocalDay(NOW);
    expect(end).toBeGreaterThanOrEqual(NOW);
    expect(end - NOW).toBeLessThan(DAY_MS);
    expect(new Date(end + 1).getDate()).not.toBe(new Date(end).getDate());
  });

  it('recallPercent is a clamped whole percent', () => {
    expect(recallPercent(0.874)).toBe(87);
    expect(recallPercent(2)).toBe(100);
    expect(recallPercent(-1)).toBe(0);
  });
});
