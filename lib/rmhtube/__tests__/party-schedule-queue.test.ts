import { beforeEach, describe, expect, it, vi } from 'vitest';

/** s13-07: `scheduleParty` queues the party fan-out only after its transaction has committed, and only for a public party. */

const db = vi.hoisted(() => ({ events: [] as string[] }));

vi.mock('@/lib/notifications.server', () => ({ createNotification: vi.fn() }));
vi.mock('@/lib/rmhtube/subscriptions.server', () => ({
  enqueueTubePartyFanout: vi.fn(async (roomId: string) => {
    db.events.push(`enqueue:${roomId}`);
  }),
}));
vi.mock('@/lib/prisma.server', () => {
  const tx = {
    $executeRaw: async () => 1,
    rmhTubeRoom: {
      count: async () => 0,
      create: async ({ data }: { data: { id: string; name: string; isPublic: boolean; hostId: string } }) => {
        db.events.push('insert');
        return {
          ...data,
          description: null,
          maxMembers: 8,
          scheduledFor: new Date('2026-12-05T18:00:00Z'),
          closedAt: null,
          host: { id: 'host', name: 'Ada', image: null, username: null, handle: 'ada', profile: null, inventory: [] },
          _count: { rsvps: 0 },
          rsvps: [],
        };
      },
    },
  };
  return {
    prisma: {
      user: { findUnique: async () => ({ id: 'host', name: 'Ada', image: null, username: null, profile: null }) },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => {
        const out = await fn(tx);
        db.events.push('commit');
        return out;
      },
    },
  };
});

import { scheduleParty } from '@/lib/rmhtube/parties.server';

const NOW = new Date('2026-12-01T12:00:00Z');
const body = (isPublic: boolean) => ({
  name: 'Movie night',
  description: '',
  startsAt: '2026-12-05T18:00:00.000Z',
  isPublic,
  maxMembers: 8,
});

beforeEach(() => {
  db.events = [];
});

describe('scheduleParty and the subscriber notice', () => {
  it('queues the fan-out after the commit for a public party', async () => {
    const result = await scheduleParty('host', body(true) as never, NOW);
    expect(result.ok).toBe(true);
    expect(db.events[0]).toBe('insert');
    expect(db.events.indexOf('commit')).toBeLessThan(db.events.findIndex((e) => e.startsWith('enqueue:')));
    expect(db.events.filter((e) => e.startsWith('enqueue:'))).toHaveLength(1);
  });

  it('queues nothing for a link-only party', async () => {
    const result = await scheduleParty('host', body(false) as never, NOW);
    expect(result.ok).toBe(true);
    expect(db.events.some((e) => e.startsWith('enqueue:'))).toBe(false);
  });
});
