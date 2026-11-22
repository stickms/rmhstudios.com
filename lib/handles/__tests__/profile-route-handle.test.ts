/**
 * s10-18: the profile form's handle change goes through `changeHandle`, so the 30-day reclaim block, the 30-day
 * cooldown and the `HandleChange` row hold on the path most members use. Prisma is a small stateful fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const DAY = 24 * 60 * 60 * 1000;

interface UserRow {
  id: string;
  handle: string | null;
  handleChangedAt: Date | null;
  isAdmin: boolean;
}
interface ChangeRow {
  userId: string;
  oldHandle: string;
  newHandle: string;
  createdAt: Date;
}

const h = vi.hoisted(() => ({
  users: [] as UserRow[],
  changes: [] as ChangeRow[],
  session: { user: { id: 'me', isAdmin: false } } as { user: { id: string; isAdmin: boolean } },
}));

function makeDb() {
  const db = {
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; handle?: string } }) => {
        const row = h.users.find((u) => (where.id ? u.id === where.id : u.handle === where.handle));
        return row ? { ...row } : null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<UserRow> }) => {
        const row = h.users.find((u) => u.id === where.id);
        if (row) Object.assign(row, data);
        return row;
      }),
    },
    handleChange: {
      findMany: vi.fn(async ({ where }: { where: { oldHandle?: string } }) =>
        h.changes.filter((c) => c.oldHandle === where.oldHandle).map((c) => ({ ...c })),
      ),
      create: vi.fn(async ({ data }: { data: Omit<ChangeRow, 'createdAt'> }) => {
        h.changes.push({ ...data, createdAt: new Date() });
      }),
    },
    userProfile: {
      upsert: vi.fn(async () => ({
        displayName: null,
        bio: null,
        location: null,
        website: null,
        links: [],
        tipGoal: null,
        tipGoalLabel: null,
        membershipPriceCoins: null,
        showLikes: false,
        dmPrivacy: 'EVERYONE',
        followListVisibility: 'EVERYONE',
        dmRequests: 'EVERYONE',
        profileSongSpotifyId: null,
        profileSongTitle: null,
        profileSongArtist: null,
        profileSongPreviewUrl: null,
        profileSongAlbumArt: null,
      })),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(db)),
  };
  return db;
}

vi.mock('@/lib/prisma.server', () => ({ prisma: makeDb() }));
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => h.session) } } }));
vi.mock('@/lib/auth/security-log.server', () => ({ recordSecurityEvent: vi.fn(async () => undefined) }));
vi.mock('@/lib/user-display.server', () => ({ invalidateUserDisplay: vi.fn() }));
vi.mock('@/lib/profile.server', () => ({ invalidateProfileLookup: vi.fn() }));
vi.mock('@/lib/rate-limit.server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/rate-limit.server')>()),
  withRateLimitAsync: vi.fn(async () => null),
}));

import { route } from '@/lib/api/routes/profile.server';

let n = 0;
async function patch(body: Record<string, unknown>) {
  n += 1;
  const request = new Request('http://localhost/api/profile', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      cookie: 'better-auth.session_token=test-1',
      'x-forwarded-for': `10.0.0.${n}`,
    },
    body: JSON.stringify(body),
  });
  const handler = route.handlers.PATCH;
  if (!handler) throw new Error('no PATCH handler');
  const res = await handler({ request, params: {} });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => {
  h.changes = [];
  h.users = [
    { id: 'me', handle: 'alice', handleChangedAt: null, isAdmin: false },
    { id: 'bob', handle: 'bob', handleChangedAt: null, isAdmin: false },
  ];
  h.session = { user: { id: 'me', isAdmin: false } };
});

describe('PATCH /api/profile handle change', () => {
  it('writes a HandleChange row and keeps the response shape', async () => {
    const { status, json } = await patch({ handle: 'alice2' });
    expect(status).toBe(200);
    expect(json.handle).toBe('alice2');
    expect(h.changes).toHaveLength(1);
    expect(h.changes[0]).toMatchObject({ userId: 'me', oldHandle: 'alice', newHandle: 'alice2' });
    expect(h.users.find((u) => u.id === 'me')?.handleChangedAt).toBeInstanceOf(Date);
  });

  it('refuses a handle another member released inside the 30-day reclaim block', async () => {
    h.changes.push({ userId: 'bob', oldHandle: 'wanted', newHandle: 'bob', createdAt: new Date(Date.now() - 5 * DAY) });
    const { status, json } = await patch({ handle: 'wanted' });
    expect(status).toBe(409);
    expect(json.error).toMatch(/released recently/i);
    expect(h.users.find((u) => u.id === 'me')?.handle).toBe('alice');
    expect(h.changes).toHaveLength(1);
  });

  it('allows it again once the block has passed', async () => {
    h.changes.push({
      userId: 'bob',
      oldHandle: 'wanted',
      newHandle: 'bob',
      createdAt: new Date(Date.now() - 31 * DAY),
    });
    const { status } = await patch({ handle: 'wanted' });
    expect(status).toBe(200);
  });

  it('uses the 30-day cooldown, not the old 14-day one', async () => {
    h.users[0]!.handleChangedAt = new Date(Date.now() - 20 * DAY);
    const { status } = await patch({ handle: 'alice3' });
    expect(status).toBe(429);
    expect(h.changes).toHaveLength(0);
  });

  it('reports a taken handle as 409', async () => {
    const { status, json } = await patch({ handle: 'bob' });
    expect(status).toBe(409);
    expect(json.error).toBe('This handle is already taken');
  });

  it('does not touch the handle when the form resends the current one', async () => {
    const { status, json } = await patch({ handle: 'alice' });
    expect(status).toBe(200);
    expect(json.handle).toBeUndefined();
    expect(h.changes).toHaveLength(0);
  });
});
