import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { MUTE_DURATIONS } from '@/lib/feed/muted-expiry';

/** Timed account mutes (s10-10): readers ignore an expired mute, the job deletes only expired rows, the endpoint stores the end. */

type MuteRow = { id: string; muterId: string; mutedId: string; createdAt: Date; expiresAt: Date | null };
const h = vi.hoisted(() => ({ mutes: [] as MuteRow[], deleteWhere: [] as unknown[] }));

/** Just enough of Prisma's where for `UserMute`: equality plus the `OR` / `gt` / `lte` the code under test writes. */
function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (k === 'OR') return (v as Record<string, unknown>[]).some((w) => matches(row, w));
    if (k === 'AND') return (v as Record<string, unknown>[]).every((w) => matches(row, w));
    const value = row[k];
    if (v instanceof Date) return value instanceof Date && value.getTime() === v.getTime();
    if (v && typeof v === 'object') {
      const op = v as { gt?: Date; lte?: Date; in?: unknown[] };
      if (op.in) return op.in.includes(value);
      if (op.gt) return value instanceof Date && value > op.gt;
      if (op.lte) return value instanceof Date && value <= op.lte;
      return false;
    }
    return value === v;
  });
}

vi.mock('@/lib/cached.server', () => ({
  cached: async (_key: string, _ttl: number, load: () => Promise<unknown>) => load(),
  invalidateCached: async () => undefined,
}));
vi.mock('@/lib/prisma.server', () => ({
  prisma: {
    userBlock: { findMany: async () => [] },
    userMute: {
      findMany: async ({ where, take }: { where: Record<string, unknown>; take?: number }) =>
        h.mutes.filter((m) => matches(m, where)).slice(0, take ?? 1e9),
      findUnique: async ({ where }: { where: { muterId_mutedId: { muterId: string; mutedId: string } } }) =>
        h.mutes.find(
          (m) => m.muterId === where.muterId_mutedId.muterId && m.mutedId === where.muterId_mutedId.mutedId,
        ) ?? null,
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        h.deleteWhere.push(where);
        const gone = h.mutes.filter((m) => matches(m, where));
        h.mutes = h.mutes.filter((m) => !gone.includes(m));
        return { count: gone.length };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        h.mutes = h.mutes.filter((m) => m.id !== where.id);
      },
      upsert: async ({
        where,
        create,
        update,
      }: {
        where: { muterId_mutedId: { muterId: string; mutedId: string } };
        create: Omit<MuteRow, 'id' | 'createdAt'>;
        update: Partial<MuteRow>;
      }) => {
        const row = h.mutes.find(
          (m) => m.muterId === where.muterId_mutedId.muterId && m.mutedId === where.muterId_mutedId.mutedId,
        );
        if (row) Object.assign(row, update);
        else h.mutes.push({ id: `m${h.mutes.length + 1}`, createdAt: new Date(), ...create });
      },
    },
  },
}));
vi.mock('@/lib/rate-limit.server', () => ({ checkRateLimit: async () => ({ allowed: true }) }));

const { getHiddenAuthorIds } = await import('@/lib/moderation.server');
const { deleteExpiredMutes } = await import('@/lib/moderation/mute-expiry-jobs.server');
const { activeMuteWhere, muteExpiresAt, isMuteActive } = await import('@/lib/moderation/mute-expiry');

const NOW = new Date('2026-11-30T12:00:00Z');
const at = (ms: number) => new Date(NOW.getTime() + ms);
let n = 0;
const mute = (mutedId: string, expiresAt: Date | null, muterId = 'me'): MuteRow => {
  const row = { id: `x${++n}`, muterId, mutedId, createdAt: new Date('2026-11-01T00:00:00Z'), expiresAt };
  h.mutes.push(row);
  return row;
};

beforeEach(() => {
  h.mutes = [];
  h.deleteWhere = [];
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

describe('timed mutes', () => {
  it('an expired mute does not hide the author; an active, a forever and a not-yet-ended mute do', async () => {
    mute('expired', at(-1000));
    mute('later', at(MUTE_DURATIONS.day));
    mute('forever', null);
    expect((await getHiddenAuthorIds('me')).sort()).toEqual(['forever', 'later']);
  });

  it('a cached set stops hiding an author the moment the mute ends, without the cache being rebuilt', async () => {
    mute('soon', at(60_000));
    expect(await getHiddenAuthorIds('me')).toEqual(['soon']);
    // The test's cache is a pass-through, so the loader's own output is what a cache would hold: it keeps the end.
    const src = readFileSync('lib/moderation.server.ts', 'utf8');
    expect(src).toContain('timed[m.mutedId] = m.expiresAt.getTime()');
    expect(src).toContain('if (until > nowMs) ids.add(id)');
  });

  it('the job deletes expired rows only, in batches', async () => {
    mute('a', at(-5000));
    mute('b', at(-1));
    const keepFuture = mute('c', at(5000));
    const keepForever = mute('d', null);
    for (let i = 0; i < 5; i++) mute(`e${i}`, at(-10_000 - i));
    const removed = await deleteExpiredMutes(NOW, 3);
    expect(removed).toBe(7);
    expect(h.mutes).toEqual([keepFuture, keepForever]);
    // Every delete re-states the expiry, so a mute extended after the read survives it.
    for (const w of h.deleteWhere) expect(w).toMatchObject({ expiresAt: { lte: NOW } });
  });

  it('"forever" stores no end and the durations are the muted-words ones', () => {
    expect(muteExpiresAt('forever', NOW)).toBeNull();
    expect(muteExpiresAt('day', NOW)?.getTime()).toBe(NOW.getTime() + MUTE_DURATIONS.day);
    expect(muteExpiresAt('week', NOW)?.getTime()).toBe(NOW.getTime() + MUTE_DURATIONS.week);
    expect(muteExpiresAt('month', NOW)?.getTime()).toBe(NOW.getTime() + MUTE_DURATIONS.month);
    expect(isMuteActive(null, NOW)).toBe(true);
    expect(isMuteActive(at(-1), NOW)).toBe(false);
    expect(isMuteActive(NOW, NOW)).toBe(false);
    expect(activeMuteWhere(NOW)).toEqual({ OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] });
  });
});

describe('POST /api/moderation/mute', () => {
  async function post(body: Record<string, unknown>) {
    vi.resetModules();
    vi.doMock('@/lib/api/handler.server', () => ({
      defineHandler:
        (_o: unknown, fn: (c: { session: { user: { id: string } }; body: unknown }) => Promise<Response>) =>
        (body: unknown) =>
          fn({ session: { user: { id: 'me' } }, body }),
    }));
    vi.doMock('@/lib/api/route.server', () => ({ apiRoute: (_p: string, handlers: unknown) => handlers }));
    const { route } = (await import('@/lib/moderation/api/moderation.mute.server')) as unknown as {
      route: { POST: (b: unknown) => Promise<Response> };
    };
    return (await route.POST({ targetUserId: 'them', ...body })).json() as Promise<{
      muted: boolean;
      expiresAt?: string | null;
    }>;
  }

  it('a duration mutes until that instant, on the server clock', async () => {
    const res = await post({ duration: 'week' });
    expect(res).toMatchObject({ muted: true, expiresAt: at(MUTE_DURATIONS.week).toISOString() });
    expect(h.mutes[0]?.expiresAt).toEqual(at(MUTE_DURATIONS.week));
  });

  it('"forever" stores null, and no duration means until unmuted', async () => {
    await post({ mute: true, duration: 'forever' });
    expect(h.mutes[0]?.expiresAt).toBeNull();
    h.mutes = [];
    await post({ mute: true });
    expect(h.mutes[0]?.expiresAt).toBeNull();
  });

  it('extend changes the end of a mute already in force and keeps one row', async () => {
    const row = mute('them', at(MUTE_DURATIONS.day));
    const res = await post({ mute: true, duration: 'month' });
    expect(res.muted).toBe(true);
    expect(h.mutes).toHaveLength(1);
    expect(row.expiresAt).toEqual(at(MUTE_DURATIONS.month));
  });

  it('an expired row counts as absent: muting again revives it, unmuting is a no-op that clears it', async () => {
    const row = mute('them', at(-1000));
    expect((await post({ mute: false })).muted).toBe(false);
    expect(h.mutes).toHaveLength(0);
    h.mutes = [row];
    expect((await post({ mute: true })).muted).toBe(true);
    expect(row.expiresAt).toBeNull();
  });

  it("the export reads the member's own rows with no select, so expiresAt is carried", () => {
    const src = readFileSync('lib/account/api/account.export.server.ts', 'utf8');
    const call = src.match(/prisma\.userMute\.findMany\([^\n]*\)/)?.[0] ?? '';
    expect(call).toContain('where: { muterId: userId }');
    expect(call).not.toContain('select');
  });
});
