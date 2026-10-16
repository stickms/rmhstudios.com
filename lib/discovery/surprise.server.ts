/**
 * A1 · Surprise me. One random thing worth opening: a game, an app, a library
 * item, a build or a well-liked post.
 *
 * No ORDER BY random() and no OFFSET on the big tables: we pick a random
 * instant between the oldest and newest row (bounds cached) and read forward
 * from it over the existing time index.
 */
import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { games } from '@/lib/games';
import { apps } from '@/lib/apps';

export type SurpriseKind = 'game' | 'app' | 'library' | 'build' | 'post';
export interface Surprise {
  kind: SurpriseKind;
  id: string;
  title: string;
  href: string;
}

const BOUNDS_TTL_MS = 10 * 60_000;
const pick = <T>(xs: readonly T[]): T | undefined => xs[Math.floor(Math.random() * xs.length)];

async function bounds(key: string, load: () => Promise<[Date | null, Date | null]>) {
  const [lo, hi] = await cached<[string | null, string | null]>(key, BOUNDS_TTL_MS, async () => {
    const [a, b] = await load();
    return [a?.toISOString() ?? null, b?.toISOString() ?? null];
  });
  return lo && hi ? ([new Date(lo), new Date(hi)] as const) : null;
}

const randomInstant = (lo: Date, hi: Date) =>
  new Date(lo.getTime() + Math.random() * (hi.getTime() - lo.getTime()));

function fromCatalog(kind: 'game' | 'app', not?: string): Surprise | null {
  const list: readonly {
    id: string;
    title: string;
    href: string;
    unlisted?: boolean;
    hidden?: boolean;
  }[] = kind === 'game' ? games : apps;
  const ok = list.filter((e) => !e.unlisted && !e.hidden && e.id !== not);
  const e = pick(ok);
  return e ? { kind, id: e.id, title: e.title, href: e.href } : null;
}

async function libraryItem(not?: string): Promise<Surprise | null> {
  const b = await bounds('discovery:b:library', async () => {
    const [a, z] = await Promise.all([
      prisma.libraryDocument.findFirst({
        where: { hidden: false },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.libraryDocument.findFirst({
        where: { hidden: false },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    return [a?.createdAt ?? null, z?.createdAt ?? null];
  });
  if (!b) return null;
  const t = randomInstant(...b);
  const where = { hidden: false, ...(not ? { id: { not } } : {}) };
  const row =
    (await prisma.libraryDocument.findFirst({
      where: { ...where, createdAt: { gte: t } },
      orderBy: { createdAt: 'asc' },
      select: { id: true, slug: true, title: true },
    })) ??
    (await prisma.libraryDocument.findFirst({
      where: { ...where, createdAt: { lt: t } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, slug: true, title: true },
    }));
  return row
    ? { kind: 'library', id: row.id, title: row.title, href: `/library/${row.slug}` }
    : null;
}

async function buildItem(not?: string): Promise<Surprise | null> {
  const live = { visibility: 'PUBLIC' as const, publishedAt: { not: null } };
  const b = await bounds('discovery:b:build', async () => {
    const [a, z] = await Promise.all([
      prisma.userBuild.findFirst({
        where: live,
        orderBy: { publishedAt: 'asc' },
        select: { publishedAt: true },
      }),
      prisma.userBuild.findFirst({
        where: live,
        orderBy: { publishedAt: 'desc' },
        select: { publishedAt: true },
      }),
    ]);
    return [a?.publishedAt ?? null, z?.publishedAt ?? null];
  });
  if (!b) return null;
  const t = randomInstant(...b);
  const base = { visibility: 'PUBLIC' as const, ...(not ? { id: { not } } : {}) };
  const sel = { id: true, slug: true, title: true } as const;
  const row =
    (await prisma.userBuild.findFirst({
      where: { ...base, publishedAt: { gte: t } },
      orderBy: { publishedAt: 'asc' },
      select: sel,
    })) ??
    (await prisma.userBuild.findFirst({
      where: { ...base, publishedAt: { lt: t } },
      orderBy: { publishedAt: 'desc' },
      select: sel,
    }));
  return row
    ? { kind: 'build', id: row.id, title: row.title, href: `/user-builds/${row.slug}` }
    : null;
}

async function postItem(viewerId: string | null, not?: string): Promise<Surprise | null> {
  const b = await bounds('discovery:b:post', async () => {
    const live = { deletedAt: null, audience: 'PUBLIC' as const };
    const [a, z] = await Promise.all([
      prisma.rMHark.findFirst({
        where: live,
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      }),
      prisma.rMHark.findFirst({
        where: live,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);
    return [a?.createdAt ?? null, z?.createdAt ?? null];
  });
  if (!b) return null;
  const hidden = await getHiddenAuthorIds(viewerId);
  const where = {
    deletedAt: null,
    audience: 'PUBLIC' as const,
    communityId: null,
    content: { not: '' },
    ...(hidden.length ? { userId: { notIn: hidden } } : {}),
    ...(not ? { id: { not } } : {}),
  };
  const sel = {
    id: true,
    content: true,
    likeCount: true,
    user: { select: { handle: true, id: true } },
  } as const;
  const t = randomInstant(...b);
  // A bounded window read forward from the random instant (index: createdAt).
  let rows = await prisma.rMHark.findMany({
    where: { ...where, createdAt: { gte: t } },
    orderBy: { createdAt: 'asc' },
    take: 60,
    select: sel,
  });
  if (!rows.length)
    rows = await prisma.rMHark.findMany({
      where: { ...where, createdAt: { lt: t } },
      orderBy: { createdAt: 'desc' },
      take: 60,
      select: sel,
    });
  const liked = rows.filter((r) => (r.likeCount ?? 0) >= 1);
  const row = pick(liked.length ? liked : rows);
  if (!row) return null;
  const title = row.content.replace(/\s+/g, ' ').trim().slice(0, 90);
  return {
    kind: 'post',
    id: row.id,
    title,
    href: `/u/${row.user.handle ?? row.user.id}/post/${row.id}`,
  };
}

export async function surpriseMe(viewerId: string | null, not?: string): Promise<Surprise | null> {
  const kinds: SurpriseKind[] = ['game', 'app', 'library', 'build', 'post'];
  // Shuffle; fall through to the next kind when one comes up empty.
  for (let i = kinds.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kinds[i], kinds[j]] = [kinds[j]!, kinds[i]!];
  }
  for (const kind of kinds) {
    try {
      const r =
        kind === 'game' || kind === 'app'
          ? fromCatalog(kind, not)
          : kind === 'library'
            ? await libraryItem(not)
            : kind === 'build'
              ? await buildItem(not)
              : await postItem(viewerId, not);
      if (r) return r;
    } catch (e) {
      console.error('[discovery] surprise', kind, e);
    }
  }
  return null;
}
