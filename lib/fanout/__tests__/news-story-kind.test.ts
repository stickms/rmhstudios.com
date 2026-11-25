import { describe, expect, it, vi } from 'vitest';

/** s13-12: `news-story-article` is a fan-out kind, and the reclaim sweep re-queues a stalled one on its own queue. */

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => null }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));

import { FANOUT_KINDS, isFanoutKind } from '@/lib/fanout/run';
import { reclaimJob } from '@/lib/fanout/queue.server';
import { STORY_FANOUT_QUEUE, storyFanoutJobKey, storyFanoutSubject } from '@/lib/reading/story-follows';

describe('the news-story-article fan-out kind', () => {
  it('is a known kind next to the others', () => {
    expect(FANOUT_KINDS).toContain('news-story-article');
    expect(isFanoutKind('news-story-article')).toBe(true);
    expect(isFanoutKind('news-story')).toBe(false);
  });

  it('is reclaimed onto the story queue, with the story and the article read back from the subject', () => {
    const subjectId = storyFanoutSubject('cuid123', 'a-slug-with:colon');
    expect(reclaimJob({ kind: 'news-story-article', subjectId })).toEqual({
      queue: STORY_FANOUT_QUEUE,
      data: { storyId: 'cuid123', articleSlug: 'a-slug-with:colon' },
      options: { singletonKey: storyFanoutJobKey('cuid123', 'a-slug-with:colon'), retryLimit: 3, retryDelay: 60 },
    });
  });

  it('keeps the other kinds on their queues', () => {
    expect(reclaimJob({ kind: 'tube-party', subjectId: 'ROOM01' }).queue).toBe('rmhtube.party-fanout');
    expect(reclaimJob({ kind: 'post-alert', subjectId: 'p1' }).queue).toBe('communities.post-alerts');
    expect(reclaimJob({ kind: 'event-update', subjectId: 'u1' }).queue).toBe('events.update-fanout');
  });
});
