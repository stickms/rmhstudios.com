import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlersOfModule } from '@/lib/__tests__/api-handlers-of';
import { assertJsonSafe } from '@/lib/db/query-shape';

/**
 * s14-09: for an impersonation report the moderator sees which other accounts claim the websites the reported account
 * claims. The endpoint is admin only, leaves the reported account out of its own list, puts verified claims first
 * (Postgres sorts NULLs first in a descending order, so the query says `nulls: 'last'`) and caps what it shows.
 */

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  links: [] as Row[],
  orderBys: [] as unknown[],
  takes: [] as number[],
  options: [] as Row[],
}));

/** A tiny fake of `profileLink.findMany`: filters on `userId`, `host` (equal or `not: null`), sorts, takes. */
function findMany({ where, orderBy, take }: { where: Row; orderBy?: Row[]; take?: number }): Row[] {
  h.orderBys.push(orderBy);
  if (typeof take === 'number') h.takes.push(take);
  let rows = h.links.filter((r) => {
    if (where.userId !== undefined && r.userId !== where.userId) return false;
    if (typeof where.host === 'string') return r.host === where.host;
    if (where.host && typeof where.host === 'object') return r.host !== null;
    return true;
  });
  // Postgres: ascending puts NULLs last, descending puts them first, unless `nulls` says otherwise.
  const verified = orderBy?.find((o) => 'verifiedAt' in o)?.verifiedAt as
    { sort: string; nulls?: string } | 'desc' | undefined;
  if (verified) {
    const nullsLast = typeof verified === 'object' ? verified.nulls === 'last' : false;
    rows = [...rows].sort((a, b) => {
      const av = a.verifiedAt as number | null;
      const bv = b.verifiedAt as number | null;
      if (av === null || bv === null) {
        if (av === bv) return (a.createdAt as number) - (b.createdAt as number);
        return (av === null ? 1 : -1) * (nullsLast ? 1 : -1);
      }
      return bv === av ? (a.createdAt as number) - (b.createdAt as number) : bv - av;
    });
  }
  return rows.slice(0, take ?? rows.length).map((r) => ({
    ...r,
    verifiedAt: r.verifiedAt === null ? null : new Date(r.verifiedAt as number),
    user: { handle: r.handle, name: r.name },
  }));
}

vi.mock('@/lib/prisma.server', async () => {
  const { shapeChecked } = await import('@/lib/db/query-shape');
  return { prisma: shapeChecked({ profileLink: { findMany: async (args: never) => findMany(args) } }) };
});
vi.mock('@/lib/api/handler.server', () => ({
  defineHandler: (options: Row, fn: unknown) => {
    h.options.push(options);
    return fn;
  },
}));

type Handler = (a: { query: { userId: string } }) => Promise<Response>;
type Claims = {
  hosts: { host: string; verified: boolean; others: { userId: string; handle: string | null; verified: boolean }[] }[];
};

async function claims(userId: string): Promise<Claims> {
  const mod = await import('@/lib/admin/api/admin.reports.claims.server');
  const res = await handlersOfModule<Handler>(mod).GET!({ query: { userId } });
  const body = (await res.json()) as Claims;
  assertJsonSafe(body);
  return body;
}

const link = (userId: string, host: string, verifiedAt: number | null, createdAt = 1): Row => ({
  userId,
  host,
  verifiedAt,
  createdAt,
  url: `https://${host}/`,
  handle: userId,
  name: userId.toUpperCase(),
});

beforeEach(() => {
  h.links = [];
  h.orderBys = [];
  h.takes = [];
});

describe('GET /api/admin/reports/claims', () => {
  it('is admin only, rate limited as a read, and not cached', async () => {
    await import('@/lib/admin/api/admin.reports.claims.server');
    const options = h.options.find((o) => o.label === 'GET /api/admin/reports/claims');
    expect(options).toMatchObject({ auth: 'admin', rateLimit: 'read' });
    expect(options).not.toHaveProperty('cache');
  });

  it('leaves the reported account out and puts verified claims first', async () => {
    h.links = [
      link('accused', 'alice.example', null),
      link('zed', 'alice.example', null, 1),
      link('real', 'alice.example', 100, 2),
      link('ann', 'alice.example', null, 0),
    ];
    const { hosts } = await claims('accused');
    expect(hosts).toEqual([
      {
        host: 'alice.example',
        verified: false,
        others: [
          expect.objectContaining({ userId: 'real', verified: true }),
          expect.objectContaining({ userId: 'ann', verified: false }),
          expect.objectContaining({ userId: 'zed', verified: false }),
        ],
      },
    ]);
  });

  it('asks Postgres for verified first with the NULLs last, one more than it shows', async () => {
    h.links = [link('accused', 'a.example', 5)];
    await claims('accused');
    const expected = [{ verifiedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'asc' }];
    // The accused account's own links, then one query per host (take 11: ten others and the account itself).
    expect(h.orderBys).toContainEqual(expected);
    expect(h.takes).toContain(11);
  });

  it("marks the reported account's own claim verified when any link to the host is, and lists each host once", async () => {
    h.links = [
      link('accused', 'a.example', null, 1),
      link('accused', 'a.example', 9, 2),
      link('other', 'a.example', null),
    ];
    const { hosts } = await claims('accused');
    expect(hosts).toHaveLength(1);
    expect(hosts[0]).toMatchObject({ host: 'a.example', verified: true });
    expect(hosts[0]?.others.map((o) => o.userId)).toEqual(['other']);
  });

  it('shows at most ten others a host and ten hosts, and skips links with no host', async () => {
    h.links = [
      link('accused', 'big.example', null),
      ...Array.from({ length: 14 }, (_, i) => link(`u${i}`, 'big.example', i % 2 ? 50 + i : null, i)),
      ...Array.from({ length: 12 }, (_, i) => link('accused', `site${i}.example`, null, 100 + i)),
      { ...link('accused', 'x', null), host: null },
    ];
    const { hosts } = await claims('accused');
    expect(hosts).toHaveLength(10);
    const big = hosts.find((entry) => entry.host === 'big.example');
    expect(big).toBeDefined();
    expect(big?.others).toHaveLength(10);
    // Verified claims come first (the odd ones: seven of the fourteen), in the order Postgres would give.
    expect(big?.others.slice(0, 7).every((o) => o.verified)).toBe(true);
  });

  it('an account that claims no website has nothing to compare', async () => {
    h.links = [link('someone', 'a.example', null)];
    expect(await claims('accused')).toEqual({ hosts: [] });
  });
});
