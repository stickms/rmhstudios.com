/**
 * A3 · Today on RMH. A daily job freezes the last 24 hours into one
 * `daily_digest_snapshot` row; /today is a single primary-key read of it.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { utcDay, type DigestLink, type DigestPayload } from './schema';

export type { DigestLink, DigestPayload };

export const TODAY_QUEUE = 'discovery.today';
const TODAY_CRON = '5 5 * * *';
const DAY = 86_400_000;

const snip = (s: string, n: number) => s.replace(/\s+/g, ' ').trim().slice(0, n);

export async function buildDigest(now = new Date()): Promise<DigestPayload> {
  const since = new Date(now.getTime() - DAY);
  const [posts, builds, docs, news, tags] = await Promise.all([
    prisma.rMHark.findMany({
      where: {
        deletedAt: null,
        audience: 'PUBLIC',
        communityId: null,
        createdAt: { gte: since },
        likeCount: { gt: 0 },
        content: { not: '' },
      },
      orderBy: [{ likeCount: 'desc' }, { createdAt: 'desc' }],
      take: 8,
      select: {
        id: true,
        content: true,
        likeCount: true,
        user: { select: userDisplaySelect },
      },
    }),
    prisma.userBuild.findMany({
      where: { visibility: 'PUBLIC', publishedAt: { gte: since } },
      orderBy: { publishedAt: 'desc' },
      take: 6,
      select: { slug: true, title: true, user: { select: userDisplaySelect } },
    }),
    prisma.libraryDocument.findMany({
      where: { hidden: false, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { slug: true, title: true },
    }),
    prisma.newsArticle.findMany({
      where: { status: 'PUBLISHED', createdAt: { gte: new Date(now.getTime() - 2 * DAY) } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { slug: true, title: true, sourcePublisher: true },
    }),
    prisma.hashtag.findMany({
      orderBy: { postCount: 'desc' },
      take: 8,
      select: { tag: true, postCount: true },
    }),
  ]);
  return {
    day: utcDay(now),
    builtAt: now.toISOString(),
    topPosts: posts.map((p) => {
      const u = resolveUser(p.user);
      return {
        title: snip(p.content, 120),
        href: `/u/${u.handle ?? u.id}/post/${p.id}`,
        meta: `${u.name ?? u.handle ?? ''} · ${p.likeCount}`,
      };
    }),
    newBuilds: builds.map((b) => ({
      title: b.title,
      href: `/user-builds/${b.slug}`,
      meta: (() => {
        const u = resolveUser(b.user);
        return u.name ?? u.handle ?? undefined;
      })(),
    })),
    newLibrary: docs.map((d) => ({ title: d.title, href: `/library/${d.slug}` })),
    news: news.map((n) => ({ title: n.title, href: `/news/${n.slug}`, meta: n.sourcePublisher })),
    trendingTags: tags.map((t) => ({
      title: `#${t.tag}`,
      href: `/tag/${t.tag}`,
      meta: String(t.postCount),
    })),
  };
}

/** Idempotent: re-running a day replaces that day's row. */
export async function storeDigest(now = new Date()): Promise<DigestPayload> {
  const payload = await buildDigest(now);
  const json = payload as unknown as object;
  await prisma.dailyDigestSnapshot.upsert({
    where: { day: payload.day },
    create: { day: payload.day, payload: json },
    update: { payload: json },
  });
  return payload;
}

/** The newest snapshot; builds one on the very first visit before the job has ever run. */
export async function getLatestDigest(): Promise<DigestPayload> {
  return cached<DigestPayload>('discovery:today', 5 * 60_000, async () => {
    const row = await prisma.dailyDigestSnapshot.findFirst({ orderBy: { day: 'desc' } });
    return row ? (row.payload as unknown as DigestPayload) : storeDigest();
  });
}

export async function registerTodayCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(TODAY_QUEUE);
  await boss.schedule(TODAY_QUEUE, TODAY_CRON, {}, { tz: 'UTC' });
  await boss.work(TODAY_QUEUE, async () => {
    await storeDigest();
  });
}
