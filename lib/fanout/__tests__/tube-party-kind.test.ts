import { describe, expect, it, vi } from 'vitest';

/** s13-07: `tube-party` is a fan-out kind, and the reclaim sweep re-queues a stalled one on its own queue. */

vi.mock('@/lib/prisma.server', () => ({ prisma: {} }));
vi.mock('@/lib/jobs/boss.server', () => ({ getBoss: async () => null }));
vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));

import { FANOUT_KINDS, isFanoutKind } from '@/lib/fanout/run';
import { reclaimJob } from '@/lib/fanout/queue.server';
import { PARTY_FANOUT_QUEUE, partyFanoutJobKey } from '@/lib/rmhtube/subscriptions';

describe('the tube-party fan-out kind', () => {
  it('is a known kind next to the older two', () => {
    expect(FANOUT_KINDS).toEqual(['post-alert', 'event-update', 'tube-party', 'news-story-article']);
    expect(isFanoutKind('tube-party')).toBe(true);
    expect(isFanoutKind('tube-parties')).toBe(false);
  });

  it('is reclaimed onto the party queue, keyed by the room, and the older kinds keep their queues', () => {
    expect(reclaimJob({ kind: 'tube-party', subjectId: 'ROOM01' })).toEqual({
      queue: PARTY_FANOUT_QUEUE,
      data: { roomId: 'ROOM01' },
      options: { singletonKey: partyFanoutJobKey('ROOM01'), retryLimit: 3, retryDelay: 60 },
    });
    expect(reclaimJob({ kind: 'post-alert', subjectId: 'p1' }).queue).toBe('communities.post-alerts');
    expect(reclaimJob({ kind: 'event-update', subjectId: 'u1' }).queue).toBe('events.update-fanout');
  });
});
