import { beforeEach, describe, expect, it, vi } from 'vitest';

// A reply removed by a moderator, an admin takedown or a community mod must not stay pinned: the helper those paths call
// clears the pin by the reply's id alone, whichever post carries it.

const updateMany = vi.hoisted(() => vi.fn(async () => ({ count: 1 })));

vi.mock('@/lib/prisma.server', () => ({ prisma: { rMHark: { updateMany } } }));

const { clearPinnedForComment } = await import('@/lib/feed/conversation-controls.server');

describe('clearPinnedForComment', () => {
  beforeEach(() => updateMany.mockClear());

  it('unpins every post that pins the removed reply, matching on the reply id only', async () => {
    await clearPinnedForComment('c9');
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({
      where: { pinnedCommentId: 'c9' },
      data: { pinnedCommentId: null },
    });
  });
});
