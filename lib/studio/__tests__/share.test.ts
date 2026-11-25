/**
 * Studio shares (feature 07): ownership, the cap under the lock, revoke, the one 404, the token, the server's own
 * sanitising, and what a read returns. Prisma is an in-memory fake: nothing here touches a database.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const SAMPLE_ID = '5c0f3a9e-7d1b-4c52-9a3e-0b1f6d2e8a41';
const SAMPLE_NAME = 'my-secret-kick-sample.wav';

interface ShareRow {
  id: string;
  token: string;
  userId: string;
  projectId: string;
  name: string;
  data: unknown;
  sizeBytes: number;
  trackCount: number;
  missingSamples: number;
  openCount: number;
  revokedAt: Date | null;
  createdAt: Date;
}

const state = vi.hoisted(() => ({
  projects: [] as { id: string; userId: string; name: string; data: unknown; revision: number; updatedAt: Date }[],
  shares: [] as ShareRow[],
  opens: new Set<string>(),
  users: {} as Record<string, Record<string, unknown>>,
  blocked: [] as string[],
  calls: [] as string[],
  seq: 0,
}));

vi.mock('@/lib/db/advisory-lock.server', () => ({
  lockKey: vi.fn(async (_tx: unknown, key: string) => {
    state.calls.push(`lock:${key}`);
  }),
}));
vi.mock('@/lib/moderation.server', () => ({
  getBlockedAuthorIds: vi.fn(async () => state.blocked),
}));
vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return { ...actual, randomBytes: vi.fn(actual.randomBytes) };
});
vi.mock('@/lib/auth', () => ({ auth: { api: { getSession: vi.fn(async () => null) } } }));

const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
  Object.entries(where).every(([key, want]) => {
    if (want && typeof want === 'object' && 'not' in (want as object))
      return row[key] !== (want as { not: unknown }).not;
    if (want && typeof want === 'object' && 'in' in (want as object))
      return (want as { in: unknown[] }).in.includes(row[key]);
    return row[key] === want;
  });

const prismaMock = vi.hoisted(() => {
  const p = {
    studioProject: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) =>
        state.projects.find((r) => matches(r as never, where)) ?? null,
    },
    studioProjectShare: {
      count: async ({ where }: { where: Record<string, unknown> }) => {
        state.calls.push('count');
        return state.shares.filter((r) => matches(r as never, where)).length;
      },
      create: async ({ data }: { data: Partial<ShareRow> }) => {
        state.calls.push('create');
        const row = {
          id: `s${++state.seq}`,
          openCount: 0,
          revokedAt: null,
          createdAt: new Date(1000 + state.seq),
          ...data,
        } as ShareRow;
        state.shares.push(row);
        return row;
      },
      findMany: async ({ where, skip }: { where: Record<string, unknown>; skip?: number }) =>
        state.shares.filter((r) => matches(r as never, where)).slice(skip ?? 0),
      deleteMany: async () => ({ count: 0 }),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = state.shares.filter((r) => matches(r as never, where));
        for (const row of hit) Object.assign(row, data, data.data !== undefined ? { data: null } : {});
        return { count: hit.length };
      },
      findUnique: async ({ where }: { where: { token: string } }) => {
        const row = state.shares.find((r) => r.token === where.token);
        return row ? { ...row, user: state.users[row.userId] } : null;
      },
      update: async ({ where, data }: { where: { id: string }; data: { openCount: { increment: number } } }) => {
        state.shares.find((r) => r.id === where.id)!.openCount += data.openCount.increment;
      },
    },
    studioProjectShareOpen: {
      createMany: async ({ data }: { data: { shareId: string; userId: string }[] }) => {
        const key = `${data[0]!.shareId}:${data[0]!.userId}`;
        if (state.opens.has(key)) return { count: 0 };
        state.opens.add(key);
        return { count: 1 };
      },
    },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(p),
  };
  return p;
});
vi.mock('@/lib/prisma.server', () => ({ prisma: prismaMock }));

const { randomBytes } = await import('node:crypto');
const { createShare, listShares, newShareToken, readShare, revokeShare } = await import('@/lib/studio/share.server');
const { createShareBody } = await import('@/lib/studio/share-schema');
const { MAX_LIVE_SHARES, SHARE_TOKEN_PATTERN } = await import('@/lib/studio/share');
const { route } = await import('@/lib/studio/api/studio.shares.$token.server');

function cloudData() {
  const base = { startBeat: 0, durationBeats: 4, color: '#ff0000' };
  return {
    id: 'proj-1',
    name: 'Beat tape',
    bpm: 120,
    timeSignature: [4, 4] as [number, number],
    tracks: [
      {
        id: 't1',
        name: 'Drums',
        type: 'audio' as const,
        color: '#fff',
        volume: 1,
        pan: 0,
        muted: false,
        soloed: false,
        armed: false,
        clipIds: ['a1'],
        pluginChain: [],
        sends: [],
        height: 80,
      },
    ],
    clips: {
      a1: {
        ...base,
        id: 'a1',
        trackId: 't1',
        type: 'audio' as const,
        name: SAMPLE_NAME,
        bufferId: SAMPLE_ID,
        sampleOffset: 0,
        fadeInBeats: 0,
        fadeOutBeats: 0,
      },
    },
    patterns: [],
    masterVolume: 1,
    createdAt: 1,
    updatedAt: 2,
  };
}

beforeEach(() => {
  state.projects = [
    { id: 'proj-1', userId: 'owner', name: 'Beat tape', data: cloudData(), revision: 1, updatedAt: new Date() },
  ];
  state.shares = [];
  state.opens = new Set();
  state.users = {
    owner: {
      id: 'owner',
      name: 'Owner Name',
      email: 'owner@example.com',
      profile: { displayName: 'DJ Owner' },
      bannedUntil: null,
    },
  };
  state.blocked = [];
  state.calls = [];
  state.seq = 0;
  vi.mocked(randomBytes).mockClear();
});

async function liveShare() {
  const made = await createShare('owner', 'proj-1');
  if (!made.ok) throw new Error('share not made');
  return made.share;
}

describe('creating a share', () => {
  it('only the cloud project owner can share it', async () => {
    expect(await createShare('someone-else', 'proj-1')).toEqual({ ok: false, reason: 'not-found' });
    expect(await createShare('owner', 'no-such-project')).toEqual({ ok: false, reason: 'not-found' });
    expect(state.shares).toHaveLength(0);
    expect((await createShare('owner', 'proj-1')).ok).toBe(true);
  });

  it('sanitises the server copy: no sample id or name is stored, and a client copy is never accepted', async () => {
    await liveShare();
    const stored = JSON.stringify(state.shares[0]!.data);
    expect(stored).not.toContain(SAMPLE_ID);
    expect(stored).not.toContain(SAMPLE_NAME);
    expect(state.shares[0]).toMatchObject({ missingSamples: 1, trackCount: 1, name: 'Beat tape' });
    // The request body names a project and nothing else: any project JSON a client sends is dropped by the schema.
    const parsed = createShareBody.parse({ projectId: 'proj-1', data: cloudData() });
    expect(parsed).toEqual({ projectId: 'proj-1' });
  });

  it('checks the cap under the member lock, before counting and inserting', async () => {
    await liveShare();
    expect(state.calls.slice(0, 3)).toEqual(['lock:studio-shares:owner', 'count', 'create']);
  });

  it('refuses the 21st live share, and a revoked one frees a place', async () => {
    const first = await liveShare();
    for (let i = 1; i < MAX_LIVE_SHARES; i += 1) await liveShare();
    expect(await createShare('owner', 'proj-1')).toEqual({ ok: false, reason: 'limit', max: MAX_LIVE_SHARES });
    expect(await revokeShare('owner', first.token)).toBe(true);
    expect((await createShare('owner', 'proj-1')).ok).toBe(true);
  });

  it('mints the token from randomBytes(16) as 22 base64url characters, never repeated', async () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 50; i += 1) tokens.add(newShareToken());
    expect(tokens.size).toBe(50);
    for (const token of tokens) expect(SHARE_TOKEN_PATTERN.test(token)).toBe(true);
    expect(vi.mocked(randomBytes)).toHaveBeenCalledWith(16);
    expect(vi.mocked(randomBytes)).toHaveBeenCalledTimes(50);
  });
});

describe('revoking', () => {
  it('clears data, keeps the row for the list, and is for the owner only', async () => {
    const share = await liveShare();
    expect(await revokeShare('intruder', share.token)).toBe(false);
    expect(state.shares[0]!.data).not.toBeNull();
    expect(await revokeShare('owner', share.token)).toBe(true);
    expect(state.shares[0]).toMatchObject({ data: null });
    expect(state.shares[0]!.revokedAt).toBeInstanceOf(Date);
    expect(await revokeShare('owner', share.token)).toBe(false);
  });

  it('the list shows a revoked share, marked, with its token and without data or ids', async () => {
    const share = await liveShare();
    await revokeShare('owner', share.token);
    const listed = await listShares('owner');
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ token: share.token, revoked: true, name: 'Beat tape' });
    expect(Object.keys(listed[0]!).sort()).toEqual([
      'createdAt',
      'missingSamples',
      'name',
      'openCount',
      'revoked',
      'token',
      'trackCount',
    ]);
    expect(await listShares('someone-else')).toEqual([]);
  });
});

describe('reading a share', () => {
  it('returns the project and the sharer display name, and nothing else about them', async () => {
    const share = await liveShare();
    const read = await readShare(share.token, null);
    expect(read).not.toBeNull();
    expect(Object.keys(read!).sort()).toEqual(['data', 'missingSamples', 'name', 'sharerName', 'trackCount']);
    expect(read!.sharerName).toBe('DJ Owner');
    const text = JSON.stringify(read);
    expect(text).not.toContain('owner@example.com');
    expect(text).not.toContain('"owner"');
    expect(text).not.toContain('proj-1');
    expect(text).not.toContain(SAMPLE_ID);
    expect(text).not.toContain(SAMPLE_NAME);
  });

  it('a revoked, banned-sharer, blocked-reader and unknown token all read as null', async () => {
    const revoked = await liveShare();
    await revokeShare('owner', revoked.token);
    const banned = await liveShare();
    const blockedShare = await liveShare();
    state.users.owner!.bannedUntil = new Date(Date.now() + 86_400_000);
    expect(await readShare(revoked.token, null)).toBeNull();
    expect(await readShare(banned.token, null)).toBeNull();
    state.users.owner!.bannedUntil = null;
    state.blocked = ['owner'];
    expect(await readShare(blockedShare.token, 'reader')).toBeNull();
    expect(await readShare('A'.repeat(22), null)).toBeNull();
  });

  it('counts an opening once per signed-in member and once per signed-out read', async () => {
    const share = await liveShare();
    await readShare(share.token, 'reader');
    await readShare(share.token, 'reader');
    await readShare(share.token, 'other-reader');
    expect(state.shares[0]!.openCount).toBe(2);
    await readShare(share.token, null);
    await readShare(share.token, null);
    expect(state.shares[0]!.openCount).toBe(4);
  });
});

describe('GET /api/studio/shares/$token', () => {
  const get = async (token: string) => {
    const request = new Request(`https://rmhstudios.com/api/studio/shares/${token}`, {
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    return (route.handlers as Record<string, (ctx: unknown) => Promise<Response>>).GET!({ request, params: { token } });
  };

  it('answers a revoked, banned, unknown and malformed token with the same 404, uncached', async () => {
    const revoked = await liveShare();
    await revokeShare('owner', revoked.token);
    const banned = await liveShare();
    state.users.owner!.bannedUntil = new Date(Date.now() + 86_400_000);
    const answers = await Promise.all(
      [revoked.token, banned.token, 'B'.repeat(22), 'not-a-token'].map(async (token) => {
        const res = await get(token);
        return { status: res.status, body: await res.text(), cache: res.headers.get('cache-control') };
      }),
    );
    for (const answer of answers) {
      expect(answer.status).toBe(404);
      expect(answer).toEqual(answers[0]);
    }
    expect(answers[0]!.cache).toBe('private, no-store');
  });

  it('serves a live share without caching', async () => {
    const share = await liveShare();
    const res = await get(share.token);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = (await res.json()) as { share: { name: string } };
    expect(body.share.name).toBe('Beat tape');
  });
});
