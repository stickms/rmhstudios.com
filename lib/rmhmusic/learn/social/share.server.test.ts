import { beforeEach, describe, expect, it, vi } from 'vitest';

interface ShareRow {
  id: string;
  token: string;
  userId: string;
  kind: string;
  subject: string;
  rowId: string;
  payload: unknown;
  showName: boolean;
  createdAt: Date;
  expiresAt: Date;
  stoppedAt: Date | null;
  hiddenAt: Date | null;
}
interface DailyRow {
  id: string;
  userId: string;
  date: string;
  score: number | null;
  avgMs: number | null;
  played: number | null;
  skipped: number | null;
  results: unknown;
  hiddenAt: Date | null;
}

/**
 * An in-memory database for the where-shapes `share.server.ts` sends, so ownership, reuse, the cap
 * and the gone rules are tested by what they return.
 */
const h = vi.hoisted(() => {
  const shares: ShareRow[] = [];
  const daily: DailyRow[] = [];
  const songs: {
    id: string;
    userId: string;
    songId: string;
    mode: string;
    bestScore: number;
  }[] = [];
  const profiles = new Map<string, string>();
  const users = new Map<
    string,
    {
      id: string;
      name: string;
      bannedUntil: Date | null;
      isBot?: boolean;
    }
  >();
  const blocked = {
    fail: false,
    pairs: [] as [string, string][],
  };
  let seq = 0;

  type ShareWhere = {
    id?: string;
    token?: string;
    userId?: string;
    subject?: string;
    showName?: boolean;
    stoppedAt?: null;
    hiddenAt?: null;
    expiresAt?: {
      gt: Date;
    };
  };
  const shareOk = (s: ShareRow, w: ShareWhere) =>
    (w.id === undefined || s.id === w.id) &&
    (w.token === undefined || s.token === w.token) &&
    (w.userId === undefined || s.userId === w.userId) &&
    (w.subject === undefined || s.subject === w.subject) &&
    (w.showName === undefined || s.showName === w.showName) &&
    (w.stoppedAt === undefined || s.stoppedAt === null) &&
    (w.hiddenAt === undefined || s.hiddenAt === null) &&
    (w.expiresAt === undefined || s.expiresAt > w.expiresAt.gt);

  return {
    shares,
    daily,
    songs,
    profiles,
    users,
    blocked,
    prisma: {
      musicShare: {
        findFirst: vi.fn(async ({ where }: { where: ShareWhere }) => {
          const hits = shares.filter((s) => shareOk(s, where));
          return hits.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;
        }),
        findUnique: vi.fn(async ({ where }: { where: ShareWhere }) => shares.find((s) => shareOk(s, where)) ?? null),
        findMany: vi.fn(async ({ where }: { where: ShareWhere }) =>
          shares.filter((s) => shareOk(s, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
        ),
        count: vi.fn(async ({ where }: { where: ShareWhere }) => shares.filter((s) => shareOk(s, where)).length),
        create: vi.fn(
          async ({
            data,
          }: {
            data: Omit<ShareRow, 'id' | 'createdAt' | 'stoppedAt' | 'hiddenAt'> & {
              createdAt?: Date;
            };
          }) => {
            if (shares.some((s) => s.token === data.token))
              throw Object.assign(new Error('unique'), {
                code: 'P2002',
              });
            const row: ShareRow = {
              id: `share-${++seq}`,
              createdAt: data.createdAt ?? new Date(),
              stoppedAt: null,
              hiddenAt: null,
              ...data,
            };
            shares.push(row);
            return row;
          },
        ),
        deleteMany: vi.fn(
          async ({
            where,
          }: {
            where: {
              expiresAt: {
                lt: Date;
              };
            };
          }) => {
            const before = shares.length;
            const keep = shares.filter((s) => !(s.expiresAt < where.expiresAt.lt));
            shares.splice(0, shares.length, ...keep);
            return {
              count: before - keep.length,
            };
          },
        ),
        updateMany: vi.fn(async ({ where, data }: { where: ShareWhere; data: Partial<ShareRow> }) => {
          const hits = shares.filter((s) => shareOk(s, where));
          for (const s of hits) Object.assign(s, data);
          return {
            count: hits.length,
          };
        }),
      },
      musicSprintDaily: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              id?: string;
              userId_date?: {
                userId: string;
                date: string;
              };
            };
          }) =>
            daily.find((d) =>
              where.id !== undefined
                ? d.id === where.id
                : d.userId === where.userId_date!.userId && d.date === where.userId_date!.date,
            ) ?? null,
        ),
      },
      musicSongBest: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId_songId_mode: {
                userId: string;
                songId: string;
                mode: string;
              };
            };
          }) =>
            songs.find(
              (s) =>
                s.userId === where.userId_songId_mode.userId &&
                s.songId === where.userId_songId_mode.songId &&
                s.mode === where.userId_songId_mode.mode,
            ) ?? null,
        ),
      },
      musicLearnProfile: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              userId: string;
            };
          }) =>
            profiles.has(where.userId)
              ? {
                  instrument: profiles.get(where.userId)!,
                }
              : null,
        ),
      },
      user: {
        findFirst: vi.fn(
          async ({
            where,
          }: {
            where: {
              id: string;
              isBot?: boolean;
              OR: (
                | {
                    bannedUntil: null;
                  }
                | {
                    bannedUntil: {
                      lt: Date;
                    };
                  }
              )[];
            };
          }) => {
            const u = users.get(where.id);
            if (!u) return null;
            if (where.isBot === false && u.isBot) return null;
            const ok = where.OR.some((o) =>
              o.bannedUntil === null
                ? u.bannedUntil === null
                : u.bannedUntil !== null && u.bannedUntil < o.bannedUntil.lt,
            );
            return ok
              ? {
                  ...u,
                  image: `https://img.example/${u.id}.png`,
                  username: null,
                  handle: `handle-${u.id}`,
                  isVerified: false,
                  isAdmin: false,
                  isBot: u.isBot ?? false,
                  profile: null,
                  inventory: [],
                }
              : null;
          },
        ),
      },
    },
    getBlockedAuthorIds: vi.fn(async (viewer: string) => {
      if (blocked.fail) throw new Error('db down');
      return blocked.pairs.flatMap(([a, b]) => (a === viewer ? [b] : b === viewer ? [a] : []));
    }),
  };
});
vi.mock('@/lib/prisma.server', () => ({
  prisma: h.prisma,
}));
vi.mock('@/lib/moderation.server', () => ({
  getBlockedAuthorIds: h.getBlockedAuthorIds,
}));

import {
  createShare,
  getSharedResult,
  listShares,
  newShareToken,
  stopAllShares,
  stopShare,
  sweepExpiredShares,
} from './share.server';
import { SHARE_TTL_MS } from './share';

const NOW = Date.UTC(2026, 10, 16, 12);
const DATE = '2026-11-16';

function scored(userId: string, date = DATE, extra: Partial<DailyRow> = {}) {
  h.daily.push({
    id: `daily-${userId}-${date}`,
    userId,
    date,
    score: 92,
    avgMs: 912,
    played: 30,
    skipped: 0,
    results: Array.from(
      {
        length: 30,
      },
      (_, i) => ({
        correct: i < 28,
        skipped: false,
      }),
    ),
    hiddenAt: null,
    ...extra,
  });
}

beforeEach(() => {
  h.shares.length = 0;
  h.daily.length = 0;
  h.songs.length = 0;
  h.profiles.clear();
  h.users.clear();
  h.blocked.fail = false;
  h.blocked.pairs = [];
  h.users.set('me', {
    id: 'me',
    name: 'Ada',
    bannedUntil: null,
  });
  h.users.set('you', {
    id: 'you',
    name: 'Ben',
    bannedUntil: null,
  });
  h.profiles.set('me', 'guitar');
});

describe('createShare', () => {
  it('shares a scored Daily run from the stored row, for 90 days, name off by default', async () => {
    scored('me');
    const res = await createShare(
      'me',
      {
        kind: 'daily',
        date: DATE,
        showName: false,
      },
      NOW,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.share.path).toMatch(/^\/rmhmusic\/r\/[A-Za-z0-9_-]{22}$/);
    expect(res.share.expiresAt).toBe(new Date(NOW + SHARE_TTL_MS).toISOString());
    const row = h.shares[0]!;
    expect(row).toMatchObject({
      userId: 'me',
      kind: 'daily',
      subject: DATE,
      rowId: `daily-me-${DATE}`,
      showName: false,
    });
    expect(row.payload).toMatchObject({
      v: 1,
      kind: 'daily',
      score: 92,
      right: 28,
      played: 30,
    });
  });

  it('refuses what is not there to share: an unscored date, a hidden run, another learner’s run', async () => {
    scored('me', DATE, {
      score: null,
    });
    scored('me', '2026-11-15', {
      hiddenAt: new Date(NOW - 1),
    });
    scored('you', '2026-11-14');
    for (const date of [DATE, '2026-11-15', '2026-11-14', '2026-11-13'])
      expect(
        await createShare(
          'me',
          {
            kind: 'daily',
            date,
            showName: false,
          },
          NOW,
        ),
      ).toEqual({
        ok: false,
        reason: 'nothing',
      });
    expect(h.shares).toHaveLength(0);
  });

  it('shares a song best with the version the learner plays, and refuses an unknown song or no best', async () => {
    h.songs.push({
      id: 'best-1',
      userId: 'me',
      songId: 'ode-to-joy',
      mode: 'play',
      bestScore: 98,
    });
    const res = await createShare(
      'me',
      {
        kind: 'song',
        songId: 'ode-to-joy',
        mode: 'play',
        showName: true,
      },
      NOW,
    );
    expect(res.ok).toBe(true);
    expect(h.shares[0]).toMatchObject({
      subject: 'ode-to-joy:play',
      rowId: 'best-1',
      showName: true,
    });
    expect(h.shares[0]!.payload).toMatchObject({
      kind: 'song',
      version: 'guitar',
      score: 98,
    });
    expect(
      await createShare(
        'me',
        {
          kind: 'song',
          songId: 'ode-to-joy',
          mode: 'wait',
          showName: false,
        },
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'nothing',
    });
    expect(
      await createShare(
        'me',
        {
          kind: 'song',
          songId: 'no-such-song',
          mode: 'play',
          showName: false,
        },
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'nothing',
    });
  });

  it('returns the live link it already made for the same result and name choice', async () => {
    scored('me');
    const a = await createShare(
      'me',
      {
        kind: 'daily',
        date: DATE,
        showName: false,
      },
      NOW,
    );
    const b = await createShare(
      'me',
      {
        kind: 'daily',
        date: DATE,
        showName: false,
      },
      NOW + 1000,
    );
    const c = await createShare(
      'me',
      {
        kind: 'daily',
        date: DATE,
        showName: true,
      },
      NOW + 2000,
    );
    expect(a.ok && b.ok && a.share.id === b.share.id).toBe(true);
    expect(c.ok && a.ok && c.share.id !== a.share.id).toBe(true);
    expect(h.shares).toHaveLength(2);
  });

  it('refuses the 51st live link, and counts only live ones', async () => {
    for (let i = 0; i < 50; i++) {
      const date = new Date(NOW - i * 86_400_000).toISOString().slice(0, 10);
      scored('me', date);
      expect(
        (
          await createShare(
            'me',
            {
              kind: 'daily',
              date,
              showName: false,
            },
            NOW,
          )
        ).ok,
      ).toBe(true);
    }
    scored('me', '2026-01-01');
    expect(
      await createShare(
        'me',
        {
          kind: 'daily',
          date: '2026-01-01',
          showName: false,
        },
        NOW,
      ),
    ).toEqual({
      ok: false,
      reason: 'cap',
    });
    await stopShare('me', h.shares[0]!.id, NOW);
    expect(
      (
        await createShare(
          'me',
          {
            kind: 'daily',
            date: '2026-01-01',
            showName: false,
          },
          NOW,
        )
      ).ok,
    ).toBe(true);
  });
});

describe('stopping', () => {
  it('stops only the owner’s link; another learner’s id changes nothing', async () => {
    scored('me');
    await createShare(
      'me',
      {
        kind: 'daily',
        date: DATE,
        showName: false,
      },
      NOW,
    );
    const id = h.shares[0]!.id;
    expect(await stopShare('you', id, NOW)).toBe(0);
    expect(h.shares[0]!.stoppedAt).toBeNull();
    expect(await stopShare('me', id, NOW)).toBe(1);
    expect(h.shares[0]!.stoppedAt).toEqual(new Date(NOW));
  });

  it('stops all of a learner’s links at once and lists only live ones', async () => {
    scored('me');
    scored('me', '2026-11-15');
    scored('you');
    await createShare(
      'me',
      {
        kind: 'daily',
        date: DATE,
        showName: false,
      },
      NOW,
    );
    await createShare(
      'me',
      {
        kind: 'daily',
        date: '2026-11-15',
        showName: false,
      },
      NOW,
    );
    await createShare(
      'you',
      {
        kind: 'daily',
        date: DATE,
        showName: false,
      },
      NOW,
    );
    expect(await listShares('me', NOW)).toHaveLength(2);
    expect(await stopAllShares('me', NOW)).toBe(2);
    expect(await listShares('me', NOW)).toHaveLength(0);
    expect(await listShares('you', NOW)).toHaveLength(1);
  });
});

describe('getSharedResult', () => {
  async function shared(showName = false) {
    scored('me');
    const res = await createShare(
      'me',
      {
        kind: 'daily',
        date: DATE,
        showName,
      },
      NOW,
    );
    if (!res.ok) throw new Error('no share');
    return res.share.path.split('/').pop()!;
  }

  it('shows the snapshot, and "A learner" (no name, no picture) unless the link chose to show them', async () => {
    const token = await shared(false);
    const view = await getSharedResult(token, null, NOW);
    expect(view).toMatchObject({
      state: 'live',
      name: null,
      image: null,
    });
    expect(JSON.stringify(view)).not.toContain('Ada');
    expect(JSON.stringify(view)).not.toContain('handle-me');
  });

  it('resolves the name and picture live when the link shows them', async () => {
    const token = await shared(true);
    expect(await getSharedResult(token, null, NOW)).toMatchObject({
      state: 'live',
      name: 'Ada',
      image: 'https://img.example/me.png',
    });
  });

  it('is gone for a bad token, a stopped, expired or hidden link, a banned author, a hidden run', async () => {
    expect(await getSharedResult('not-a-token', null, NOW)).toEqual({
      state: 'gone',
    });
    expect(await getSharedResult('AbCdEfGhIjKlMnOpQrSt_-', null, NOW)).toEqual({
      state: 'gone',
    });
    const token = await shared();
    expect((await getSharedResult(token, null, NOW)).state).toBe('live');
    expect((await getSharedResult(token, null, NOW + SHARE_TTL_MS)).state).toBe('gone');
    h.users.get('me')!.bannedUntil = new Date(NOW + 1000);
    expect((await getSharedResult(token, null, NOW)).state).toBe('gone');
    h.users.get('me')!.bannedUntil = null;
    h.daily[0]!.hiddenAt = new Date(NOW);
    expect((await getSharedResult(token, null, NOW)).state).toBe('gone');
    h.daily[0]!.hiddenAt = null;
    h.shares[0]!.hiddenAt = new Date(NOW);
    expect((await getSharedResult(token, null, NOW)).state).toBe('gone');
    h.shares[0]!.hiddenAt = null;
    await stopShare('me', h.shares[0]!.id, NOW);
    expect((await getSharedResult(token, null, NOW)).state).toBe('gone');
  });

  it('is gone for a viewer who blocks or is blocked by the sharer, and when the block lookup fails', async () => {
    const token = await shared();
    h.blocked.pairs = [['you', 'me']];
    expect((await getSharedResult(token, 'you', NOW)).state).toBe('gone');
    h.blocked.pairs = [['me', 'you']];
    expect((await getSharedResult(token, 'you', NOW)).state).toBe('gone');
    h.blocked.pairs = [];
    h.blocked.fail = true;
    expect((await getSharedResult(token, 'you', NOW)).state).toBe('gone');
    expect((await getSharedResult(token, null, NOW)).state).toBe('live');
  });
});

describe('getSharedResult: the author and the viewer', () => {
  async function share() {
    scored('me');
    const res = await createShare(
      'me',
      {
        kind: 'daily',
        date: DATE,
        showName: true,
      },
      NOW,
    );
    if (!res.ok) throw new Error('no share');
    return res.share.path.split('/').pop()!;
  }

  it('is gone when the author is a bot, as on the board and the friends list', async () => {
    const token = await share();
    h.users.get('me')!.isBot = true;
    expect((await getSharedResult(token, null, NOW)).state).toBe('gone');
    expect((await getSharedResult(token, 'you', NOW)).state).toBe('gone');
  });

  it('says mine only to the viewer who made the link', async () => {
    const token = await share();
    const pick = async (viewer: string | null) => {
      const v = await getSharedResult(token, viewer, NOW);
      return v.state === 'live' ? v.mine : null;
    };
    expect(await pick('me')).toBe(true);
    expect(await pick('you')).toBe(false);
    expect(await pick(null)).toBe(false);
  });
});

describe('tokens', () => {
  it('are 22 url-safe characters and do not repeat over 10,000 draws', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) {
      const t = newShareToken();
      expect(t).toMatch(/^[A-Za-z0-9_-]{22}$/);
      seen.add(t);
    }
    expect(seen.size).toBe(10_000);
  });
});

describe('the maintenance sweep', () => {
  it('deletes links 30 days after they expire, and nothing sooner', async () => {
    scored('me');
    await createShare(
      'me',
      {
        kind: 'daily',
        date: DATE,
        showName: false,
      },
      NOW,
    );
    const expired = NOW + SHARE_TTL_MS;
    expect(await sweepExpiredShares(expired + 29 * 86_400_000)).toBe(0);
    expect(await sweepExpiredShares(expired + 31 * 86_400_000)).toBe(1);
    expect(h.shares).toHaveLength(0);
  });
});
