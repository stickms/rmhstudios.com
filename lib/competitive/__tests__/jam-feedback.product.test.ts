import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FEEDBACK_MAX,
  FEEDBACK_MIN,
  FEEDBACK_NOTIFY_WINDOW_MS,
  JAM_FEEDBACK_READ_PATHS,
  feedbackIntent,
  feedbackViewer,
  mayListFeedback,
  mayMarkHelpful,
  notifyDue,
  reportDetailsWithSnapshot,
  shapeFeedback,
  type FeedbackViewer,
} from '@/lib/competitive/jam-feedback';

describe('limits', () => {
  it('undefined leaves feedback alone, blank withdraws it', () => {
    expect(feedbackIntent(undefined)).toEqual({ kind: 'none' });
    expect(feedbackIntent('')).toEqual({ kind: 'clear' });
    expect(feedbackIntent('   \n ')).toEqual({ kind: 'clear' });
    expect(feedbackIntent(null)).toEqual({ kind: 'clear' });
  });
  it('20 to 1 000 characters after trimming', () => {
    expect(feedbackIntent('x'.repeat(FEEDBACK_MIN - 1))).toEqual({ kind: 'invalid', reason: 'too-short' });
    expect(feedbackIntent('x'.repeat(FEEDBACK_MIN))).toEqual({ kind: 'text', body: 'x'.repeat(FEEDBACK_MIN) });
    expect(feedbackIntent('x'.repeat(FEEDBACK_MAX))).toMatchObject({ kind: 'text' });
    expect(feedbackIntent('x'.repeat(FEEDBACK_MAX + 1))).toEqual({ kind: 'invalid', reason: 'too-long' });
    expect(feedbackIntent(`  ${'x'.repeat(FEEDBACK_MIN)}  `)).toEqual({ kind: 'text', body: 'x'.repeat(FEEDBACK_MIN) });
  });
});

describe('batching window', () => {
  const now = new Date('2026-11-20T12:00:00Z');
  it('is due when never told, and again a full hour later', () => {
    expect(notifyDue(null, now)).toBe(true);
    expect(notifyDue(new Date(now.getTime() - FEEDBACK_NOTIFY_WINDOW_MS + 1), now)).toBe(false);
    expect(notifyDue(new Date(now.getTime() - FEEDBACK_NOTIFY_WINDOW_MS), now)).toBe(true);
    expect(FEEDBACK_NOTIFY_WINDOW_MS).toBe(3_600_000);
  });
});

describe('visibility matrix', () => {
  const base = { ownerId: 'o', acceptedIds: ['t'] };
  const roles: Array<[string | null, boolean, FeedbackViewer]> = [
    ['o', false, 'owner'],
    ['t', false, 'teammate'],
    ['x', true, 'admin'],
    ['r', false, 'rater'],
    [null, false, 'other'],
    ['o', true, 'owner'],
  ];
  it.each(roles)('viewer %s (admin %s) is %s', (viewerId, isAdmin, expected) => {
    expect(feedbackViewer({ ...base, viewerId, isAdmin })).toBe(expected);
  });
  it('only the team and admins list; only the team flags', () => {
    const list = (['owner', 'teammate', 'admin', 'rater', 'other'] as const).filter(mayListFeedback);
    expect(list).toEqual(['owner', 'teammate', 'admin']);
    const flag = (['owner', 'teammate', 'admin', 'rater', 'other'] as const).filter(mayMarkHelpful);
    expect(flag).toEqual(['owner', 'teammate']);
  });
  it('an anonymous author is dropped for everyone but an admin', () => {
    const row = {
      id: 'f',
      body: 'text',
      anonymous: true,
      createdAt: new Date('2026-11-20T12:00:00Z'),
      helpfulAt: null,
      author: { id: 'secret', name: 'N', handle: 'h', image: null },
    };
    for (const v of ['owner', 'teammate', 'rater', 'other'] as const) {
      const dto = shapeFeedback(row, v);
      expect(dto.author).toBeNull();
      expect(JSON.stringify(dto)).not.toContain('secret');
    }
    expect(shapeFeedback(row, 'admin').author).toMatchObject({ id: 'secret' });
    expect(shapeFeedback({ ...row, anonymous: false }, 'owner').author).toMatchObject({ id: 'secret' });
  });
});

describe('report snapshot', () => {
  it('keeps the reported words and stays within the column', () => {
    expect(reportDetailsWithSnapshot(null, 'rude')).toBe('Reported text: rude');
    expect(reportDetailsWithSnapshot('  spam ', 'rude')).toBe('spam\n\nReported text: rude');
    expect(reportDetailsWithSnapshot('d'.repeat(900), 'b'.repeat(1000)).length).toBeLessThanOrEqual(1000);
  });
});

describe('read paths', () => {
  it('every path that shows feedback is listed and exists', () => {
    for (const p of JAM_FEEDBACK_READ_PATHS) expect(() => readFileSync(p, 'utf8')).not.toThrow();
    const server = readFileSync('lib/competitive/jam-feedback.server.ts', 'utf8');
    // The list read applies the team gate before reading any row.
    expect(server.indexOf('mayListFeedback(viewer)')).toBeLessThan(server.indexOf('prisma.gameJamFeedback.findMany'));
  });
  it('the SQL table and columns this feature relies on are the real ones', () => {
    const schema = readFileSync('prisma/schema/competitive.prisma', 'utf8');
    expect(schema).toContain('@@map("game_jam_feedback")');
    const sql = readFileSync('prisma/migrations/20261126020100_s06_jam_feedback/migration.sql', 'utf8');
    expect(sql).toContain('CREATE TABLE "game_jam_feedback"');
    expect(sql).toContain('"feedbackNotifiedAt"');
  });
});
