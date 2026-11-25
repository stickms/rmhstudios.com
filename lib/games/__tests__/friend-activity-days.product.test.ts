import { describe, expect, it } from 'vitest';
import { groupEventsByDay } from '../activity';
import type { ActivityEvent } from '../activity-types';

const ev = (id: string, at: string): ActivityEvent => ({
  id,
  kind: 'review',
  at,
  user: { userId: 'u', handle: 'u', name: 'U', image: null },
  gameId: 'g',
  gameTitle: 'G',
  detail: 5,
});

describe('groupEventsByDay', () => {
  it('groups newest-first events under their day, keeping order', () => {
    const days = groupEventsByDay(
      [ev('a', '2026-11-20T15:00:00Z'), ev('b', '2026-11-20T09:00:00Z'), ev('c', '2026-11-19T22:00:00Z')],
      'UTC',
    );
    expect(days.map((d) => d.day)).toEqual(['2026-11-20', '2026-11-19']);
    expect(days[0]?.events.map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('uses the viewer time zone for the day boundary', () => {
    const events = [ev('a', '2026-11-20T02:00:00Z')];
    expect(groupEventsByDay(events, 'UTC')[0]?.day).toBe('2026-11-20');
    expect(groupEventsByDay(events, 'America/Los_Angeles')[0]?.day).toBe('2026-11-19');
  });

  it('is empty for no events and skips an unreadable time stamp', () => {
    expect(groupEventsByDay([], 'UTC')).toEqual([]);
    expect(groupEventsByDay([ev('x', 'nope')], 'UTC')).toEqual([]);
  });
});
