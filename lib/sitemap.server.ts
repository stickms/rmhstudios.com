/**
 * The DB-backed halves of the sitemap.
 *
 * `/sitemap.xml` is a sitemap *index* rather than one file. The old single file
 * was already emitting ~22,000 URLs and had no user profiles or posts in it;
 * adding those would have pushed it past the protocol's 50,000-URL limit, at
 * which point a crawler rejects the whole document — so the fix that made the
 * platform's largest content types discoverable is the same fix that had to
 * split the file.
 *
 * Each section here declares how to count its rows and how to page through
 * them, and `renderSection` slices at `SITEMAP_CHUNK_SIZE`. Nothing enumerates
 * a table without a `where` clause: every predicate below is the public
 * visibility rule for that content type, and a sitemap is fetched by anonymous
 * crawlers and cached by third parties, so a leak here is permanent.
 */

import { prisma } from '@/lib/prisma.server';
import type { Prisma } from '@prisma/client';
import { PUBLIC_POST_WHERE } from '@/lib/feed/rss.server';
import {
  catalogRoutes,
  chunkPath,
  SITEMAP_CHUNK_SIZE,
  STATIC_ROUTES,
  type SitemapEntry,
  type SitemapSectionName,
} from '@/lib/sitemap';

/**
 * Per-section ceilings.
 *
 * These are not arbitrary — they bound the work a single crawler request can
 * ask of Postgres. When a section hits its cap we serve the most recent rows
 * and log the shortfall, because a silently truncated sitemap looks exactly
 * like a complete one.
 */
const CAPS = {
  users: 200_000,
  posts: 200_000,
  builds: 100_000,
  content: 100_000,
  community: 50_000,
  jobs: 50_000,
  homes: 50_000,
} as const;

interface Section {
  /** How many URLs this section has, for sizing the index. */
  count: () => Promise<number>;
  /** One page of URLs. */
  page: (skip: number, take: number) => Promise<SitemapEntry[]>;
  /** Upper bound on rows; anything beyond it is dropped (and logged). */
  cap: number;
}

// ─────────────────────────── visibility rules ───────────────────────────

/**
 * A profile worth indexing: it resolves (has a handle), it isn't banned, it
 * isn't one of the AI bot accounts, and it has at least one post.
 *
 * The post-count floor is a quality filter, not a privacy one. A sitemap full
 * of empty profiles is the textbook thin-content pattern, and it costs crawl
 * budget that the pages with content need. Bot accounts are excluded for the
 * adjacent reason: they post on a schedule, and submitting a few thousand
 * machine-written profiles is a bad signal to send about the whole domain.
 */
function indexableUserWhere(): Prisma.UserWhereInput {
  return {
    handle: { not: null },
    postCount: { gt: 0 },
    isBot: false,
    // A function, not a module-level const: `new Date()` in a const is
    // evaluated once at import, so a long-running web process would keep
    // filtering against its own boot time and never let a lapsed ban expire.
    OR: [{ bannedUntil: null }, { bannedUntil: { lt: new Date() } }],
  };
}

/** Non-repost public posts by a user who has a handle to build the URL from. */
function indexablePostWhere() {
  return {
    ...PUBLIC_POST_WHERE,
    // A repost's content belongs to the original, which is listed separately.
    originalId: null,
    user: { handle: { not: null }, isBot: false },
  };
}

// ────────────────────────────── sections ──────────────────────────────

export const SITEMAP_SECTIONS: Record<SitemapSectionName, Section> = {
  /** Static routes plus everything derived from the game/app catalogs. */
  pages: {
    cap: 10_000,
    count: () => Promise.resolve(STATIC_ROUTES.length + catalogRoutes().length),
    page: (skip, take) =>
      Promise.resolve([...STATIC_ROUTES, ...catalogRoutes()].slice(skip, skip + take)),
  },

  /** Long-form: blog, news, library documents and albums, game guides. */
  content: {
    cap: CAPS.content,
    count: async () => {
      const [blog, news, docs, albums, guides] = await Promise.all([
        prisma.blogPost.count(),
        prisma.newsArticle.count({ where: { status: 'PUBLISHED' } }),
        prisma.libraryDocument.count({ where: { hidden: false, reported: false } }),
        prisma.album.count(),
        prisma.gameGuide.count({ where: { published: true } }),
      ]);
      return blog + news + docs + albums + guides;
    },
    page: async (skip, take) => {
      // Small enough to assemble whole and slice: the five sources together are
      // in the low thousands, and interleaving them by date would cost a union
      // query for no crawler-visible benefit.
      const [blog, news, docs, albums, guides] = await Promise.all([
        prisma.blogPost.findMany({
          select: { slug: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: CAPS.content,
        }),
        prisma.newsArticle.findMany({
          where: { status: 'PUBLISHED' },
          select: { slug: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: CAPS.content,
        }),
        prisma.libraryDocument.findMany({
          where: { hidden: false, reported: false },
          select: { slug: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: CAPS.content,
        }),
        prisma.album.findMany({
          select: { slug: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: CAPS.content,
        }),
        prisma.gameGuide.findMany({
          where: { published: true },
          select: { id: true, gameId: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: CAPS.content,
        }),
      ]);

      const entries: SitemapEntry[] = [
        ...blog.map((p) => ({
          loc: `/blog/${p.slug}`,
          lastmod: p.updatedAt,
          changefreq: 'monthly' as const,
          priority: 0.6,
        })),
        ...news.map((n) => ({
          loc: `/news/${n.slug}`,
          lastmod: n.updatedAt,
          changefreq: 'monthly' as const,
          priority: 0.5,
        })),
        ...docs.map((d) => ({
          loc: `/library/${d.slug}`,
          lastmod: d.createdAt,
          changefreq: 'monthly' as const,
          priority: 0.6,
        })),
        ...albums.map((a) => ({
          loc: `/library/albums/${a.slug}`,
          lastmod: a.updatedAt,
          changefreq: 'monthly' as const,
          priority: 0.4,
        })),
        ...guides.map((g) => ({
          loc: `/games/${g.gameId}/guides/${g.id}`,
          lastmod: g.updatedAt,
          changefreq: 'monthly' as const,
          priority: 0.5,
        })),
      ];
      return entries.slice(skip, skip + take);
    },
  },

  /**
   * What people build here: community build submissions and generated vibe
   * pages. Neither was in the old sitemap's user-facing half — `/user-builds`
   * was listed, but it redirects, so the builds themselves were unreachable
   * from it.
   */
  builds: {
    cap: CAPS.builds,
    count: async () => {
      const [builds, vibes] = await Promise.all([
        prisma.userBuild.count({ where: { visibility: 'PUBLIC' } }),
        prisma.vibePage.count({ where: { status: 'ready' } }),
      ]);
      return builds + vibes;
    },
    page: async (skip, take) => {
      const buildCount = await prisma.userBuild.count({ where: { visibility: 'PUBLIC' } });
      const entries: SitemapEntry[] = [];

      if (skip < buildCount) {
        const rows = await prisma.userBuild.findMany({
          where: { visibility: 'PUBLIC' },
          select: { slug: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          skip,
          take,
        });
        entries.push(
          ...rows.map((b) => ({
            loc: `/user-builds/${b.slug}`,
            lastmod: b.updatedAt,
            changefreq: 'weekly' as const,
            priority: 0.5,
          })),
        );
      }

      if (entries.length < take) {
        const rows = await prisma.vibePage.findMany({
          where: { status: 'ready' },
          select: { slug: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          skip: Math.max(0, skip - buildCount),
          take: take - entries.length,
        });
        entries.push(
          ...rows.map((v) => ({
            loc: `/v/${v.slug}`,
            lastmod: v.updatedAt,
            changefreq: 'weekly' as const,
            priority: 0.5,
          })),
        );
      }

      return entries;
    },
  },

  /** Public user profiles. */
  users: {
    cap: CAPS.users,
    count: () => prisma.user.count({ where: indexableUserWhere() }),
    page: async (skip, take) => {
      const rows = await prisma.user.findMany({
        where: indexableUserWhere(),
        select: { handle: true, updatedAt: true, followerCount: true },
        // Most-followed first, so if the cap ever bites it drops the tail
        // rather than a random slice.
        orderBy: [{ followerCount: 'desc' }, { id: 'asc' }],
        skip,
        take,
      });
      return rows.map((u) => ({
        loc: `/u/${u.handle!}`,
        lastmod: u.updatedAt,
        changefreq: 'daily' as const,
        // A profile with an audience is worth more crawl budget than one
        // without; everything else about them is identical.
        priority: u.followerCount >= 10 ? 0.6 : 0.4,
      }));
    },
  },

  /** Public post permalinks, at their canonical `/u/{handle}/post/{id}` URL. */
  posts: {
    cap: CAPS.posts,
    count: () => prisma.rMHark.count({ where: indexablePostWhere() }),
    page: async (skip, take) => {
      const rows = await prisma.rMHark.findMany({
        where: indexablePostWhere(),
        select: {
          id: true,
          updatedAt: true,
          user: { select: { handle: true } },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      });
      return rows.map((p) => ({
        loc: `/u/${p.user.handle!}/post/${p.id}`,
        lastmod: p.updatedAt,
        changefreq: 'weekly' as const,
        priority: 0.4,
      }));
    },
  },

  /** Communities, public personas, public study decks, public tournaments. */
  community: {
    cap: CAPS.community,
    count: async () => {
      const [communities, personas, decks, tournaments] = await Promise.all([
        prisma.community.count({ where: { isPrivate: false } }),
        prisma.aiPersona.count({ where: { isPublic: true } }),
        prisma.flashcardDeck.count({ where: { isPublic: true } }),
        prisma.tournament.count({ where: { visibility: 'public' } }),
      ]);
      return communities + personas + decks + tournaments;
    },
    page: async (skip, take) => {
      const [communities, personas, decks, tournaments] = await Promise.all([
        prisma.community.findMany({
          where: { isPrivate: false },
          select: { slug: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: CAPS.community,
        }),
        prisma.aiPersona.findMany({
          where: { isPublic: true },
          select: { id: true, updatedAt: true },
          orderBy: { chatCount: 'desc' },
          take: CAPS.community,
        }),
        prisma.flashcardDeck.findMany({
          where: { isPublic: true },
          select: { id: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: CAPS.community,
        }),
        prisma.tournament.findMany({
          where: { visibility: 'public' },
          select: { id: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: CAPS.community,
        }),
      ]);

      const entries: SitemapEntry[] = [
        ...communities.map((c) => ({
          loc: `/c/${c.slug}`,
          lastmod: c.createdAt,
          changefreq: 'daily' as const,
          priority: 0.6,
        })),
        ...personas.map((p) => ({
          loc: `/personas/${p.id}`,
          lastmod: p.updatedAt,
          changefreq: 'weekly' as const,
          priority: 0.4,
        })),
        ...decks.map((d) => ({
          loc: `/study/${d.id}`,
          lastmod: d.updatedAt,
          changefreq: 'weekly' as const,
          priority: 0.4,
        })),
        ...tournaments.map((t) => ({
          loc: `/tournaments/${t.id}`,
          lastmod: t.updatedAt,
          changefreq: 'daily' as const,
          priority: 0.3,
        })),
      ];
      return entries.slice(skip, skip + take);
    },
  },

  /** Active home listings. */
  homes: {
    cap: CAPS.homes,
    count: () => prisma.homeListing.count({ where: { status: 'ACTIVE' } }),
    page: async (skip, take) => {
      const rows = await prisma.homeListing.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, updatedAt: true },
        orderBy: { updatedAt: 'desc' },
        skip,
        take,
      });
      return rows.map((h) => ({
        loc: `/homes/listing/${h.id}`,
        lastmod: h.updatedAt,
        changefreq: 'daily' as const,
        priority: 0.5,
      }));
    },
  },

  /**
   * Verified, currently-active early-career roles.
   *
   * Google Jobs will drop — and can penalise — a `JobPosting` whose listing has
   * expired, so the predicate matches the one the page itself uses to decide
   * it can render: active, early-career, an enabled company, and a latest
   * verification that actually says the role is live.
   */
  jobs: {
    cap: CAPS.jobs,
    count: () => prisma.ladderJob.count({ where: ladderJobWhere() }),
    page: async (skip, take) => {
      const rows = await prisma.ladderJob.findMany({
        where: ladderJobWhere(),
        select: {
          id: true,
          lastVerifiedAt: true,
          lastCheckedAt: true,
          discoveredAt: true,
          verifications: {
            orderBy: { checkedAt: 'desc' },
            take: 1,
            select: { status: true },
          },
        },
        orderBy: [{ lastVerifiedAt: 'desc' }, { id: 'asc' }],
        skip,
        take,
      });
      return rows
        .filter((j) =>
          ['verified_active', 'verified_probable'].includes(j.verifications[0]?.status ?? ''),
        )
        .map((j) => ({
          loc: `/rmhladder/jobs/${j.id}`,
          lastmod: j.lastVerifiedAt ?? j.lastCheckedAt ?? j.discoveredAt,
          changefreq: 'daily' as const,
          priority: 0.6,
        }));
    },
  },
};

function ladderJobWhere(): Prisma.LadderJobWhereInput {
  return {
    status: 'active',
    earlyCareerClassification: { in: ['yes', 'probable'] },
    company: { enabled: true },
  };
}

// ─────────────────────────────── assembly ───────────────────────────────

/**
 * The child sitemap paths the index should list.
 *
 * A section that fails to count is skipped rather than taking the index down
 * with it — a partial sitemap is worth far more than a 500.
 */
export async function listSitemapChunks(): Promise<string[]> {
  const counted = await Promise.all(
    Object.entries(SITEMAP_SECTIONS).map(async ([name, section]) => {
      let total: number;
      try {
        total = await section.count();
      } catch (e) {
        console.error(`[sitemap] section "${name}" failed to count, omitting it:`, e);
        return { name, chunks: 0 };
      }
      if (total > section.cap) {
        console.warn(
          `[sitemap] section "${name}" has ${total} URLs but is capped at ${section.cap}; ` +
            `${total - section.cap} will not be listed.`,
        );
        total = section.cap;
      }
      return { name, chunks: Math.max(1, Math.ceil(total / SITEMAP_CHUNK_SIZE)) };
    }),
  );

  // Sorting after the concurrent fan-out keeps the index byte-stable between
  // requests, which is what makes the hourly cache actually cacheable.
  return counted
    .filter((s) => s.chunks > 0)
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap(({ name, chunks }) =>
      Array.from({ length: chunks }, (_, i) => chunkPath(name, i + 1)),
    );
}

/** Render one child sitemap, or null when the section doesn't exist. */
export async function renderSection(
  section: string,
  chunk: number,
): Promise<SitemapEntry[] | null> {
  const def = SITEMAP_SECTIONS[section as SitemapSectionName];
  if (!def) return null;
  const skip = (chunk - 1) * SITEMAP_CHUNK_SIZE;
  if (skip >= def.cap) return [];
  const take = Math.min(SITEMAP_CHUNK_SIZE, def.cap - skip);
  return def.page(skip, take);
}
