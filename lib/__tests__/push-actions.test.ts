import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));

import { pushActionsFor } from '@/lib/push/send.server';

/**
 * Push notification buttons (plan U6). `/api/push/action` accepts a verb only
 * if `pushActionsFor` offers it for the caller's own notification row, so this
 * table IS the authorization rule for what a notification button can do.
 */
describe('pushActionsFor', () => {
  const verbs = (...args: Parameters<typeof pushActionsFor>) =>
    pushActionsFor(...args).map((a) => a.action);

  it('offers like only on a mention of someone else’s post', () => {
    expect(verbs('MENTION', 'rmhark')).toEqual(['like', 'mark-read']);
    // These rows carry the RECIPIENT's own post id — liking it is meaningless.
    expect(verbs('COMMENT', 'rmhark')).toEqual(['mark-read']);
    expect(verbs('REPOST', 'rmhark')).toEqual(['mark-read']);
    expect(verbs('LIKE', 'rmhark')).toEqual(['mark-read']);
    // A mention inside a comment points at a comment id, not a post.
    expect(verbs('MENTION', 'comment')).toEqual(['mark-read']);
  });

  it('offers follow-back only on a follow notification about a user', () => {
    expect(verbs('FOLLOW', 'user')).toEqual(['follow-back', 'mark-read']);
    expect(verbs('FOLLOW', null)).toEqual(['mark-read']);
  });

  it('never offers more than two buttons, and always a title', () => {
    for (const type of ['LIKE', 'COMMENT', 'REPLY', 'FOLLOW', 'MENTION', 'REPOST', 'SYSTEM'] as const) {
      const actions = pushActionsFor(type, 'rmhark');
      expect(actions.length).toBeLessThanOrEqual(2);
      for (const a of actions) expect(a.title.length).toBeGreaterThan(0);
    }
  });
});
