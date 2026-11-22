import { describe, expect, it } from 'vitest';
import { busiestSlots, emptyGrid, gridFromRows, reconstructDaily, weeklyNet } from '@/lib/social/audience';

// Noon UTC on 2026-11-20, a Friday.
const NOW = new Date('2026-11-20T12:00:00Z');

describe('reconstructDaily', () => {
  it('walks back from the current count, undoing each day net', () => {
    const days = reconstructDaily(
      10,
      [
        {
          date: '2026-11-20',
          gained: 3,
          lost: 1,
        },
        {
          date: '2026-11-18',
          gained: 2,
          lost: 0,
        },
      ],
      4,
      'UTC',
      '2026-11-01',
      NOW,
    );
    expect(days.map((d) => d.date)).toEqual(['2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    expect(days.map((d) => d.followers)).toEqual([6, 8, 8, 10]);
    expect(days.map((d) => d.net)).toEqual([0, 2, 0, 2]);
    expect(days[3]).toMatchObject({
      gained: 3,
      lost: 1,
    });
  });

  it('adds up several rows for one day', () => {
    const [day] = reconstructDaily(
      5,
      [
        {
          date: '2026-11-20',
          gained: 2,
          lost: 0,
        },
        {
          date: '2026-11-20',
          gained: 1,
          lost: 1,
        },
      ],
      1,
      'UTC',
      '2026-11-01',
      NOW,
    );
    expect(day).toMatchObject({
      gained: 3,
      lost: 1,
      net: 2,
    });
  });

  it('marks days before the log began as gains only', () => {
    const days = reconstructDaily(5, [], 5, 'UTC', '2026-11-19', NOW);
    expect(days.map((d) => d.gainsOnly)).toEqual([true, true, true, false, false]);
  });

  it('is gains only throughout when nothing has been logged', () => {
    const days = reconstructDaily(5, [], 3, 'UTC', null, NOW);
    expect(days.every((d) => d.gainsOnly)).toBe(true);
  });

  it('never reports a negative follower count', () => {
    const days = reconstructDaily(
      1,
      [
        {
          date: '2026-11-20',
          gained: 0,
          lost: 4,
        },
      ],
      2,
      'UTC',
      null,
      NOW,
    );
    expect(days.every((d) => d.followers >= 0)).toBe(true);
  });

  it('puts today in the viewer time zone', () => {
    // 23:30 UTC on the 20th is already the 21st in Auckland.
    const late = new Date('2026-11-20T23:30:00Z');
    const days = reconstructDaily(3, [], 2, 'Pacific/Auckland', null, late);
    expect(days.map((d) => d.date)).toEqual(['2026-11-20', '2026-11-21']);
  });
});

describe('weeklyNet', () => {
  it('sums to the range net and counts weeks back from today', () => {
    const days = reconstructDaily(
      40,
      Array.from(
        {
          length: 30,
        },
        (_, i) => ({
          date: new Date(NOW.getTime() - i * 86_400_000).toISOString().slice(0, 10),
          gained: i % 4,
          lost: i % 3 === 0 ? 1 : 0,
        }),
      ),
      30,
      'UTC',
      '2026-01-01',
      NOW,
    );
    const weeks = weeklyNet(days);
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.start).toBe(days[0]?.date);
    expect(weeks.reduce((sum, w) => sum + w.net, 0)).toBe(days.reduce((sum, d) => sum + d.net, 0));
  });

  it('is empty for no days', () => {
    expect(weeklyNet([])).toEqual([]);
  });
});

describe('busiestSlots', () => {
  it('buckets engagement in a non-UTC zone and ranks the busiest slots', () => {
    // 2026-11-17 23:30 UTC is Wednesday 2026-11-18 at 08:30 in Tokyo (UTC+9).
    const stamps = ['2026-11-17T23:30:00Z', '2026-11-17T23:45:00Z', '2026-11-17T23:50:00Z', '2026-11-19T09:00:00Z'];
    const zone = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      weekday: 'short',
      hour: '2-digit',
      hourCycle: 'h23',
    });
    const rows = stamps.map((s) => {
      const parts = zone.formatToParts(new Date(s));
      const day = parts.find((p) => p.type === 'weekday')?.value ?? '';
      const hour = Number(parts.find((p) => p.type === 'hour')?.value);
      return {
        dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day),
        hour,
        n: 1,
      };
    });
    const slots = busiestSlots(gridFromRows(rows), 3);
    expect(slots[0]).toEqual({
      dow: 3,
      hour: 8,
      count: 3,
    });
    expect(slots[1]).toEqual({
      dow: 4,
      hour: 18,
      count: 1,
    });
    expect(slots).toHaveLength(2);
  });

  it('breaks ties by day then hour and skips empty slots', () => {
    const grid = emptyGrid();
    grid[5]![3] = 2;
    grid[1]![20] = 2;
    grid[1]![4] = 2;
    expect(busiestSlots(grid, 5)).toEqual([
      {
        dow: 1,
        hour: 4,
        count: 2,
      },
      {
        dow: 1,
        hour: 20,
        count: 2,
      },
      {
        dow: 5,
        hour: 3,
        count: 2,
      },
    ]);
    expect(busiestSlots(emptyGrid(), 3)).toEqual([]);
  });
});

describe('gridFromRows', () => {
  it('ignores rows outside the grid and adds repeats', () => {
    const grid = gridFromRows([
      {
        dow: 2,
        hour: 5,
        n: 1,
      },
      {
        dow: 2,
        hour: 5,
        n: 2,
      },
      {
        dow: 9,
        hour: 5,
        n: 7,
      },
      {
        dow: 2,
        hour: 30,
        n: 7,
      },
    ]);
    expect(grid[2]?.[5]).toBe(3);
    expect(grid.flat().reduce((a, b) => a + b, 0)).toBe(3);
  });
});
