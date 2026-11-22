import { describe, expect, it } from 'vitest';
import {
  ICS_UPDATES_MAX,
  NOTIFY_PREVIEW_MAX,
  UPDATE_WINDOW_MS,
  audienceOf,
  canDeleteUpdate,
  describeWithUpdates,
  nextUpdateAt,
  notifyPreview,
} from '@/lib/events/updates';
import { eventToICS } from '@/lib/events-ics';
import { postUpdateBody } from '@/lib/events/updates-schema';

const NOW = new Date('2026-11-30T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('rolling window', () => {
  it('has room under three, and names when the oldest of the last three leaves', () => {
    expect(nextUpdateAt([ago(1000), ago(2000)], NOW)).toBeNull();
    const next = nextUpdateAt([ago(1000), ago(5_000), ago(3_600_000)], NOW)!;
    expect(next.getTime()).toBe(NOW.getTime() - 3_600_000 + UPDATE_WINDOW_MS);
  });
  it('ignores updates older than 24 hours', () => {
    expect(nextUpdateAt([ago(UPDATE_WINDOW_MS + 1), ago(UPDATE_WINDOW_MS + 2), ago(1), ago(2)], NOW)).toBeNull();
  });
  it('closes the delete window at ten minutes', () => {
    expect(canDeleteUpdate(ago(9 * 60_000), NOW)).toBe(true);
    expect(canDeleteUpdate(ago(10 * 60_000), NOW)).toBe(false);
  });
});

describe('the notification preview', () => {
  it('is the first 120 characters, whole code points, with an ellipsis', () => {
    const p = notifyPreview('😀'.repeat(300));
    expect(Array.from(p)).toHaveLength(NOTIFY_PREVIEW_MAX);
    expect(p.endsWith('…')).toBe(true);
    expect(notifyPreview('  short   one \n two ')).toBe('short one two');
  });
});

describe('audience', () => {
  const row = (userId: string, status: string, at = 0, everyTime = false) => ({
    userId,
    status,
    occurrenceAt: new Date(at),
    everyTime,
  });
  it('a one-off event: going, maybe and waitlist, never no', () => {
    expect(
      audienceOf([row('a', 'going'), row('b', 'maybe'), row('c', 'waitlist'), row('d', 'no')], null, false).sort(),
    ).toEqual(['a', 'b', 'c']);
  });
  it('a whole series: anyone with a yes on any date', () => {
    const d = Date.UTC(2026, 11, 8);
    expect(
      audienceOf([row('a', 'going', d), row('b', 'no', d), row('c', 'going', 0, true)], null, true).sort(),
    ).toEqual(['a', 'c']);
  });
});

describe('ICS description', () => {
  const u = (body: string, minutesAgo: number) => ({ body, createdAt: ago(minutesAgo * 60_000) });
  it('lists the newest three first, after the description', () => {
    const d = describeWithUpdates('Bring a controller', [u('one', 40), u('four', 10), u('two', 30), u('three', 20)])!;
    expect(d.startsWith('Bring a controller\n\nUpdate ')).toBe(true);
    const lines = d.split('\n\n')[1]!.split('\n');
    expect(lines).toHaveLength(ICS_UPDATES_MAX);
    expect(lines.map((l) => l.split(': ')[1])).toEqual(['four', 'three', 'two']);
  });
  it('is the description untouched when there are no updates', () => {
    expect(describeWithUpdates('x', [])).toBe('x');
    expect(describeWithUpdates(undefined, [])).toBeUndefined();
  });
  it('escapes commas, semicolons and newlines once the writer folds it into ICS text', () => {
    const d = describeWithUpdates(undefined, [u('Room 4; bring snacks, drinks\nand chairs', 1)])!;
    const ics = eventToICS({ id: 'e1', title: 'T', description: d, startsAt: NOW }).replace(/\r\n /g, '');
    const line = ics.split('\r\n').find((l) => l.startsWith('DESCRIPTION:'))!;
    expect(line).toContain('Room 4\\; bring snacks\\, drinks\\nand chairs');
  });
});

describe('request schema', () => {
  it('takes 1 to 500 characters, trimmed', () => {
    expect(postUpdateBody.safeParse({ body: '   ' }).success).toBe(false);
    expect(postUpdateBody.safeParse({ body: 'x'.repeat(501) }).success).toBe(false);
    expect(postUpdateBody.parse({ body: '  hi  ' }).body).toBe('hi');
    expect(postUpdateBody.safeParse({ body: 'hi', occurrenceAt: null }).success).toBe(true);
    expect(postUpdateBody.safeParse({ body: 'hi', occurrenceAt: 'tomorrow' }).success).toBe(false);
  });
});
