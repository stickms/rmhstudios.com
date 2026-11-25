import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * s14-10: a member may report an RMHTube room or watch party. The host, a private room the reporter was never in, an
 * already removed room and an unknown code are all refused (the last three with the same answer). A takedown stamps
 * `moderatedAt` once, keeps an earlier `closedAt`, tells the members going and tells the hub through Redis; a second
 * takedown does nothing. A host cannot schedule or rename a party to a name removed in the last 30 days, and a removed
 * room is read by nothing that lists or opens parties.
 */

type Room = {
  id: string;
  name: string | null;
  description: string | null;
  hostId: string;
  isPublic: boolean;
  scheduledFor: Date | null;
  closedAt: Date | null;
  moderatedAt: Date | null;
  host: { name: string | null };
};

const h = vi.hoisted(() => ({
  rooms: [] as Record<string, unknown>[],
  members: [] as { roomId: string; userId: string }[],
  rsvps: [] as { roomId: string; userId: string }[],
  notifications: [] as Record<string, unknown>[],
  publish: vi.fn((_channel: string, _data: unknown) => true),
}));

type Where = Record<string, unknown>;
const NOW_FOR_FAKE = new Date('2026-12-10T12:00:00Z');
const ms = (v: unknown) => (v instanceof Date ? v.getTime() : (v as number));
function matches(row: Record<string, unknown>, where: Where): boolean {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond === null) return value === null;
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, unknown>;
      if ('in' in c) return (c.in as unknown[]).includes(value);
      if ('gte' in c) return value instanceof Date && ms(value) >= ms(c.gte);
      return false;
    }
    return value === cond;
  });
}

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  const client = {
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(client),
    rmhTubeRoom: {
      findUnique: async ({ where }: { where: { id: string } }) => h.rooms.find((r) => r.id === where.id) ?? null,
      // The party page reads it with its `include`: the host, the going count and the first few going.
      findFirst: async ({ where }: { where: Where }) => {
        const row = h.rooms.find((r) => matches(r, where));
        return row
          ? {
              ...row,
              updatedAt: NOW_FOR_FAKE,
              host: {
                id: row.hostId,
                name: 'Hosty',
                image: null,
                username: null,
                handle: 'hosty',
                profile: null,
                inventory: [],
              },
              _count: { rsvps: 0 },
              rsvps: [],
            }
          : null;
      },
      findMany: async ({ where }: { where: Where }) => h.rooms.filter((r) => matches(r, where)),
      updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        const rows = h.rooms.filter((r) => matches(r, where));
        for (const r of rows) Object.assign(r, data);
        return { count: rows.length };
      },
    },
    rmhTubeRoomMember: {
      findUnique: async ({ where }: { where: { roomId_userId: { roomId: string; userId: string } } }) => {
        const key = where.roomId_userId;
        const row = h.members.find((m) => m.roomId === key.roomId && m.userId === key.userId);
        return row ? { id: `${key.roomId}:${key.userId}` } : null;
      },
    },
    rmhTubeRoomRsvp: {
      findMany: async ({ where }: { where: { roomId: string } }) => h.rsvps.filter((r) => r.roomId === where.roomId),
    },
  };
  return { prisma: shapeChecked(client) };
});
vi.mock('@/lib/redis.server', () => ({ redisPublish: h.publish }));
vi.mock('@/lib/notifications.server', () => ({
  createNotification: vi.fn(async (n: Record<string, unknown>) => {
    h.notifications.push(n);
  }),
}));
vi.mock('@/lib/rmhtube/subscriptions.server', () => ({ enqueueTubePartyFanout: vi.fn(async () => {}) }));

import { assertJsonSafe } from '@/lib/db/query-shape';
import { ERROR_CODES } from '@/lib/errors/codes';
import { REMOVABLE_REPORT_ENTITY_TYPES, REPORT_ENTITY_TYPES } from '@/lib/moderation/report-constants';
import {
  partyForCalendar,
  getParty,
  partyModerated,
  refusalResponse,
  scheduleParty,
  updateParty,
} from '@/lib/rmhtube/parties.server';
import {
  ROOM_CLOSED_CHANNEL,
  recentlyModeratedName,
  roomPreviews,
  roomReportAuthor,
  roomReportable,
  takeDownRoom,
} from '@/lib/rmhtube/room-reports.server';
import {
  ROOM_NAME_REMOVED_DAYS,
  ROOM_PREVIEW_DESCRIPTION_MAX,
  isRemovedRoomName,
  normalizeRoomName,
  roomPreviewLine,
} from '@/lib/rmhtube/room-reports';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const NOW = new Date('2026-12-10T12:00:00Z');
const DAY = 86_400_000;

function room(extra: Partial<Room> & { id: string }): Room {
  return {
    name: 'Friday movies',
    description: 'We watch things',
    hostId: 'host',
    isPublic: true,
    scheduledFor: new Date('2026-12-12T20:00:00Z'),
    closedAt: null,
    moderatedAt: null,
    host: { name: 'Hosty' },
    ...extra,
  };
}

beforeEach(() => {
  h.publish.mockClear();
  h.notifications = [];
  h.members = [{ roomId: 'PRIV01', userId: 'inside' }];
  h.rsvps = [
    { roomId: 'PUB001', userId: 'going1' },
    { roomId: 'PUB001', userId: 'going2' },
  ];
  h.rooms = [
    room({ id: 'PUB001' }),
    room({ id: 'PRIV01', isPublic: false, name: 'Secret club' }),
    room({ id: 'GONE01', moderatedAt: new Date(NOW.getTime() - DAY), closedAt: new Date(NOW.getTime() - DAY) }),
  ];
});

describe('eligibility', () => {
  it('lets a member report a public room', async () => {
    expect(await roomReportable('PUB001', 'viewer')).toEqual({ ok: true, hostId: 'host' });
    expect(await roomReportAuthor('PUB001')).toBe('host');
  });

  it('refuses the host reporting their own room', async () => {
    expect(await roomReportable('PUB001', 'host')).toEqual({ ok: false, reason: 'own' });
  });

  it('answers a private room the reporter was never in the same as an unknown code', async () => {
    const outsider = await roomReportable('PRIV01', 'viewer');
    const unknown = await roomReportable('NOPE01', 'viewer');
    expect(outsider).toEqual({ ok: false, reason: 'missing' });
    expect(outsider).toEqual(unknown);
  });

  it('lets a member of a private room report it', async () => {
    expect(await roomReportable('PRIV01', 'inside')).toEqual({ ok: true, hostId: 'host' });
  });

  it('refuses a room that is already removed, as missing', async () => {
    expect(await roomReportable('GONE01', 'viewer')).toEqual({ ok: false, reason: 'missing' });
    expect(await roomReportAuthor('GONE01')).toBeNull();
    expect(await roomReportAuthor('NOPE01')).toBeNull();
  });
});

describe('takeDownRoom', () => {
  it('stamps moderatedAt and closedAt, tells the members going and the hub', async () => {
    const out = await takeDownRoom('PUB001', NOW);
    expect(out).toEqual({ taken: true, notified: 2, published: true });
    const row = h.rooms.find((r) => r.id === 'PUB001')!;
    expect(row.moderatedAt).toEqual(NOW);
    expect(row.closedAt).toEqual(NOW);
    expect(h.notifications.map((n) => n.userId).sort()).toEqual(['going1', 'going2']);
    expect(h.notifications[0]).toMatchObject({
      type: 'SYSTEM',
      entityId: 'PUB001',
      link: '/rmhtube/party/PUB001',
      preview: { key: 'party-cancelled', params: { name: 'Friday movies' } },
    });
    expect(h.publish).toHaveBeenCalledTimes(1);
    expect(h.publish).toHaveBeenCalledWith(ROOM_CLOSED_CHANNEL, { roomId: 'PUB001' });
    expect(ROOM_CLOSED_CHANNEL).toBe('rmhtube:room:closed');
  });

  it('keeps an earlier closedAt', async () => {
    const earlier = new Date(NOW.getTime() - 3 * DAY);
    h.rooms.find((r) => r.id === 'PUB001')!.closedAt = earlier;
    const out = await takeDownRoom('PUB001', NOW);
    expect(out.taken).toBe(true);
    const row = h.rooms.find((r) => r.id === 'PUB001')!;
    expect(row.closedAt).toEqual(earlier);
    expect(row.moderatedAt).toEqual(NOW);
  });

  it('is a no-op the second time: one stamp, one set of notices, one message to the hub', async () => {
    await takeDownRoom('PUB001', NOW);
    h.notifications = [];
    h.publish.mockClear();
    const later = new Date(NOW.getTime() + 60_000);
    expect(await takeDownRoom('PUB001', later)).toEqual({ taken: false, notified: 0, published: false });
    expect(h.rooms.find((r) => r.id === 'PUB001')!.moderatedAt).toEqual(NOW);
    expect(h.notifications).toEqual([]);
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('does nothing for a room that does not exist', async () => {
    expect(await takeDownRoom('NOPE01', NOW)).toEqual({ taken: false, notified: 0, published: false });
    expect(h.publish).not.toHaveBeenCalled();
  });

  it('says the hub was not reached when Redis is off', async () => {
    h.publish.mockReturnValueOnce(false);
    expect(await takeDownRoom('PUB001', NOW)).toMatchObject({ taken: true, published: false });
  });

  it('removes a room nobody is going to without notices', async () => {
    h.rsvps = [];
    expect(await takeDownRoom('PUB001', NOW)).toEqual({ taken: true, notified: 0, published: true });
  });
});

describe('roomPreviews', () => {
  it('shows name, description, host, visibility and time on one line', async () => {
    const previews = await roomPreviews(['PUB001', 'PRIV01']);
    expect(previews.get('PUB001')).toBe(
      'Friday movies (PUB001) · host Hosty · public · 2026-12-12 20:00 UTC: We watch things',
    );
    expect(previews.get('PRIV01')).toContain('private');
    expect(previews.get('PRIV01')).toContain('Secret club');
  });

  it('cuts the description at 280 characters and names an unnamed, unscheduled room', () => {
    const line = roomPreviewLine({
      id: 'ABC123',
      name: null,
      description: 'x'.repeat(400),
      isPublic: true,
      scheduledFor: null,
      hostId: 'u1',
      hostName: null,
    });
    expect(line).toContain('Room ABC123');
    expect(line).toContain('host u1');
    expect(line).toContain('not scheduled');
    expect(line.endsWith(`${'x'.repeat(ROOM_PREVIEW_DESCRIPTION_MAX - 1)}…`)).toBe(true);
  });

  it('does no lookup for no ids', async () => {
    expect((await roomPreviews([])).size).toBe(0);
  });
});

describe('a removed name', () => {
  const removed = (name: string, daysAgo: number, hostId = 'host') =>
    room({
      id: `RM${daysAgo}${hostId.slice(0, 2)}`.toUpperCase(),
      name,
      hostId,
      moderatedAt: new Date(NOW.getTime() - daysAgo * DAY),
      closedAt: new Date(NOW.getTime() - daysAgo * DAY),
    });

  it('compares after trimming and lower-casing', () => {
    expect(normalizeRoomName('  Late NIGHT ')).toBe('late night');
    expect(isRemovedRoomName('late night', ['  LATE Night'])).toBe(true);
    expect(isRemovedRoomName('late nights', ['late night'])).toBe(false);
    expect(isRemovedRoomName('   ', ['  ', null])).toBe(false);
    expect(ROOM_NAME_REMOVED_DAYS).toBe(30);
  });

  it('compares the same key whichever tier stored the name (80-character web names, 64-character hub names)', () => {
    const long = `${'a'.repeat(63)}x tail past the hub's cut`;
    const hubStored = `${'A'.repeat(63)}x`;
    expect(isRemovedRoomName(long, [hubStored])).toBe(true);
    expect(isRemovedRoomName(hubStored, [long])).toBe(true);
    expect(isRemovedRoomName('Don\'t "Stop"', ['dont stop'])).toBe(true);
  });

  it('blocks the same host for 30 days, then lets the name go', async () => {
    h.rooms.push(removed('Late Night', 29));
    expect(await recentlyModeratedName('host', '  late night ', NOW)).toBe(true);
    h.rooms = [removed('Late Night', 31)];
    expect(await recentlyModeratedName('host', 'late night', NOW)).toBe(false);
  });

  it('is per host and never for an empty name', async () => {
    h.rooms.push(removed('Late Night', 2, 'other'));
    expect(await recentlyModeratedName('host', 'late night', NOW)).toBe(false);
    expect(await recentlyModeratedName('other', 'Late Night', NOW)).toBe(true);
    expect(await recentlyModeratedName('other', '  ', NOW)).toBe(false);
  });

  const request = (name: string) => ({
    name,
    startsAt: new Date(NOW.getTime() + 2 * DAY).toISOString(),
    isPublic: true,
    maxMembers: 8,
  });

  it('refuses scheduling a party with a removed name, before anything is created', async () => {
    h.rooms.push(removed('Late Night', 3));
    const before = h.rooms.length;
    expect(await scheduleParty('host', request('late NIGHT'), NOW)).toEqual({ ok: false, reason: 'NAME_REMOVED' });
    expect(h.rooms).toHaveLength(before);
  });

  it('refuses renaming a party to a removed name, but not a rename that keeps its own name', async () => {
    h.rooms.push(removed('Late Night', 3));
    const open = h.rooms.find((r) => r.id === 'PUB001')!;
    open.scheduledFor = new Date(NOW.getTime() + 2 * DAY);
    expect(await updateParty('PUB001', 'host', { name: 'Late Night' }, NOW)).toEqual({
      ok: false,
      reason: 'NAME_REMOVED',
    });
    expect(open.name).toBe('Friday movies');
  });

  it('answers with the taxonomy code the dialog reads', async () => {
    const res = refusalResponse('NAME_REMOVED');
    const body = await res.json();
    assertJsonSafe(body);
    expect(res.status).toBe(409);
    expect(body).toMatchObject({ code: 'TUBE_ROOM_NAME_REMOVED', reason: 'NAME_REMOVED' });
    expect(body.error).toBe(ERROR_CODES.TUBE_ROOM_NAME_REMOVED.text);
    expect(ERROR_CODES.TUBE_ROOM_NAME_REMOVED.text).toBe('A moderator removed a room with this name. Choose another');
  });
});

describe('a removed room stays removed', () => {
  it('cannot be edited back by its host', async () => {
    const res = await updateParty('GONE01', 'host', { name: 'Back again' }, NOW);
    expect(res).toEqual({ ok: false, reason: 'MODERATED' });
    expect(h.rooms.find((r) => r.id === 'GONE01')!.name).toBe('Friday movies');
    const refusal = refusalResponse('MODERATED');
    expect(refusal.status).toBe(409);
    expect(await refusal.json()).toMatchObject({ code: 'CONTENT_REMOVED_BY_MODERATOR', reason: 'MODERATED' });
  });

  it('is not a party anyone can read, and the page can still say a moderator closed it', async () => {
    expect(await getParty('GONE01', 'host')).toBeNull();
    expect(await getParty('PUB001', 'viewer')).not.toBeNull();
    expect(await partyModerated('GONE01')).toBe(true);
    expect(await partyModerated('PUB001')).toBe(false);
    expect(await partyModerated('NOPE01')).toBe(false);
  });

  it('has no calendar file', async () => {
    expect(await partyForCalendar('GONE01')).toBeNull();
    expect(await partyForCalendar('PUB001')).not.toBeNull();
  });
});

describe('the report path wiring', () => {
  it('tube-room is reportable, removable and a member item', () => {
    expect(REPORT_ENTITY_TYPES).toContain('tube-room');
    expect(REMOVABLE_REPORT_ENTITY_TYPES).toContain('tube-room');
    const constants = read('lib/moderation/report-constants.ts');
    expect(constants.match(/^\s*'tube-room',/gm)).toHaveLength(3);
  });

  it('the report route, triage and “Your reports” each handle it', () => {
    const route = read('lib/moderation/api/moderation.report.server.ts');
    expect(route).toContain("case 'tube-room'");
    expect(route).toContain('roomReportable');
    const triage = read('lib/moderation/triage.server.ts');
    expect(triage).toContain("entityType === 'tube-room'");
    expect(triage).toContain('takeDownRoom');
    expect(triage).toContain('roomPreviews');
    expect(read('lib/moderation/my-reports.server.ts')).toContain("'tube-room'");
    const panel = read('components/moderation/MyReportsPanel.tsx');
    expect(panel).toContain("'tube-room': t('kind-tube-room'");
    expect(panel).toContain("'tube-room': t('gone-tube-room'");
    expect(read('components/feed/report-kind-label.ts')).toContain("'tube-room': t('kind-tube-room'");
  });

  it('the refusal code has its sentence', () => {
    expect(read('components/errors/refusal-sentence.ts')).toContain("case 'TUBE_ROOM_NAME_REMOVED'");
    expect(ERROR_CODES.TUBE_ROOM_NAME_REMOVED.http).toBe(409);
  });
});
