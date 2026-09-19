import { describe, it, expect } from 'vitest';

/**
 * The programming grid's expansion (L1).
 *
 * Recurrence expansion is the part that goes wrong quietly: a slot that began
 * a year ago must still appear this week, a daily slot must not cost 365
 * iterations to render seven days, and an unbounded recurrence must not be
 * able to produce an unbounded list.
 */

import {
  buildGrid,
  expand,
  groupByDay,
  nextUp,
  startOfDay,
  type SlotDefinition,
} from '@/lib/schedule/slots';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 14); // Monday 14 September 2026

function slot(over: Partial<SlotDefinition> = {}): SlotDefinition {
  return {
    id: 's',
    kind: 'premiere',
    title: 'A thing',
    href: '/x',
    startsAt: new Date(T0),
    durationMinutes: 60,
    recurrence: 'once',
    until: null,
    ...over,
  };
}

describe('expand — once', () => {
  it('yields the single occurrence inside the window', () => {
    const out = expand(slot(), new Date(T0 - DAY), new Date(T0 + DAY));
    expect(out).toHaveLength(1);
    expect(out[0].startsAt.getTime()).toBe(T0);
  });

  it('yields nothing outside it', () => {
    expect(expand(slot(), new Date(T0 + DAY), new Date(T0 + 2 * DAY))).toEqual([]);
    expect(expand(slot(), new Date(T0 - 3 * DAY), new Date(T0 - DAY))).toEqual([]);
  });

  it('computes the end from the duration', () => {
    const out = expand(slot({ durationMinutes: 90 }), new Date(T0), new Date(T0 + DAY));
    expect(out[0].endsAt.getTime() - out[0].startsAt.getTime()).toBe(90 * 60_000);
  });

  it('treats a zero duration as a moment', () => {
    const out = expand(slot({ durationMinutes: 0 }), new Date(T0), new Date(T0 + DAY));
    expect(out[0].endsAt.getTime()).toBe(out[0].startsAt.getTime());
  });
});

describe('expand — recurring', () => {
  it('shows a slot that began long before the window', () => {
    // The bug this prevents: filtering on `startsAt >= from` and silently
    // dropping every recurring slot older than the page being viewed.
    const daily = slot({ recurrence: 'daily', startsAt: new Date(T0 - 365 * DAY) });
    const out = expand(daily, new Date(T0), new Date(T0 + 7 * DAY));
    expect(out).toHaveLength(8);
    expect(out[0].startsAt.getTime()).toBe(T0);
  });

  it('steps weekly', () => {
    const weekly = slot({ recurrence: 'weekly' });
    const out = expand(weekly, new Date(T0), new Date(T0 + 21 * DAY));
    expect(out.map((o) => o.startsAt.getTime())).toEqual([
      T0,
      T0 + 7 * DAY,
      T0 + 14 * DAY,
      T0 + 21 * DAY,
    ]);
  });

  it('stops at `until`', () => {
    const daily = slot({ recurrence: 'daily', until: new Date(T0 + 2 * DAY) });
    const out = expand(daily, new Date(T0), new Date(T0 + 30 * DAY));
    expect(out).toHaveLength(3);
  });

  it('caps an unbounded recurrence', () => {
    const daily = slot({ recurrence: 'daily' });
    const out = expand(daily, new Date(T0), new Date(T0 + 10_000 * DAY), 50);
    expect(out).toHaveLength(50);
  });

  it('does not start before the window even when the slot did', () => {
    const daily = slot({ recurrence: 'daily', startsAt: new Date(T0 - 10 * DAY) });
    const out = expand(daily, new Date(T0 + 3 * DAY), new Date(T0 + 5 * DAY));
    expect(out.every((o) => o.startsAt.getTime() >= T0 + 3 * DAY)).toBe(true);
  });
});

describe('buildGrid', () => {
  it('returns everything in time order regardless of slot order', () => {
    const out = buildGrid(
      [
        slot({ id: 'late', startsAt: new Date(T0 + 5 * DAY) }),
        slot({ id: 'early', startsAt: new Date(T0 + DAY) }),
      ],
      new Date(T0),
      new Date(T0 + 7 * DAY),
    );
    expect(out.map((o) => o.slotId)).toEqual(['early', 'late']);
  });

  it('is empty for an empty schedule', () => {
    expect(buildGrid([], new Date(T0), new Date(T0 + DAY))).toEqual([]);
  });
});

describe('groupByDay', () => {
  it('gives every day a bucket, including the quiet ones', () => {
    // A grid that omits empty days is a grid whose columns move, and "nothing
    // on Wednesday" is real information.
    const out = groupByDay(
      buildGrid([slot()], new Date(T0), new Date(T0 + 7 * DAY)),
      new Date(T0),
      7,
    );
    expect(out).toHaveLength(7);
    expect(out[0].occurrences).toHaveLength(1);
    expect(out[3].occurrences).toEqual([]);
  });

  it('drops occurrences outside the window rather than mis-bucketing them', () => {
    const out = groupByDay(
      [
        {
          slotId: 'x',
          kind: 'premiere',
          title: 't',
          href: null,
          startsAt: new Date(T0 + 40 * DAY),
          endsAt: new Date(T0 + 40 * DAY),
        },
      ],
      new Date(T0),
      7,
    );
    expect(out.every((b) => b.occurrences.length === 0)).toBe(true);
  });
});

describe('nextUp', () => {
  const grid = buildGrid(
    [slot({ id: 'a' }), slot({ id: 'b', startsAt: new Date(T0 + 2 * DAY) })],
    new Date(T0),
    new Date(T0 + 7 * DAY),
  );

  it('finds the next thing', () => {
    expect(nextUp(grid, new Date(T0 - DAY))?.slotId).toBe('a');
  });

  it('counts something already running as next', () => {
    // Mid-premiere, the answer to "what is on" is the premiere.
    expect(nextUp(grid, new Date(T0 + 30 * 60_000))?.slotId).toBe('a');
  });

  it('moves on once it has ended', () => {
    expect(nextUp(grid, new Date(T0 + 2 * 60 * 60_000))?.slotId).toBe('b');
  });

  it('returns null when the grid is spent', () => {
    expect(nextUp(grid, new Date(T0 + 30 * DAY))).toBeNull();
  });
});

describe('startOfDay', () => {
  it('floors to midnight UTC', () => {
    expect(startOfDay(new Date('2026-09-19T23:59:59.999Z')).toISOString()).toBe(
      '2026-09-19T00:00:00.000Z',
    );
  });
});
