/**
 * `/builds/{slug}/rss.xml` — the releases of a public member build, as RSS 2.0.
 *
 * A feed is a subscription, and an aggregator would surface an unlisted build that is only reachable by its link, so
 * only `visibility = PUBLIC` builds with a `publishedAt` have one: an unlisted, private, unpublished or missing build,
 * and an official (catalog) build, which has no releases, all answer null and the route a 404. A build whose owner is
 * banned from the site or leaving (deletion grace period) has none either.
 *
 * An item carries what the build page shows a signed-out visitor for a release: the version, the build's title, the
 * release notes as plain text and the release date, linked to the build page. It never carries a repository, demo or
 * download URL, and never a commit hash, so a priced build gives nothing away that its page keeps behind the unlock.
 */
import { prisma } from '@/lib/prisma.server';
import { SITE_URL } from '@/lib/seo';
import type { RssItem } from '@/lib/rss';
import { summarize } from '@/lib/feed/rss.server';

/** Items in a build feed. */
export const BUILD_FEED_LIMIT = 30;

/** Build slugs are lower-case words and dashes. */
export const BUILD_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

/** Release notes are Markdown; a feed reader wants text, so the common marks are dropped and the rest left as written. */
export function notesToText(notes: string | null | undefined): string {
  if (!notes) return '';
  return summarize(
    notes
      .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^\s{0,3}#{1,6}\s+/gm, '')
      .replace(/(\*\*|__|`)/g, ''),
    2000,
  );
}

export interface BuildFeed {
  title: string;
  link: string;
  description: string;
  items: RssItem[];
}

/** The feed of a public build, or null (the route answers 404). */
export async function buildFeed(slug: string, now: Date = new Date()): Promise<BuildFeed | null> {
  const build = await prisma.userBuild.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      visibility: true,
      publishedAt: true,
      user: { select: { bannedUntil: true, deletionScheduledAt: true } },
    },
  });
  if (!build || build.visibility !== 'PUBLIC' || !build.publishedAt) return null;
  if (build.user.deletionScheduledAt) return null;
  if (build.user.bannedUntil && build.user.bannedUntil.getTime() > now.getTime()) return null;

  const link = `${SITE_URL}/builds/${build.slug}`;
  const versions = await prisma.buildVersion.findMany({
    where: { buildId: build.id },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: BUILD_FEED_LIMIT,
    select: { id: true, version: true, changelog: true, createdAt: true },
  });
  return {
    title: `${build.title} releases — RMH Studios`,
    link,
    description: `Releases of ${build.title} on RMH Studios.`,
    items: versions.map((v) => ({
      title: `${build.title} ${v.version}`,
      link,
      // A release has no page of its own; the id keeps every item's guid unique.
      guid: `${link}#release-${v.id}`,
      description: notesToText(v.changelog) || `${build.title} ${v.version} is out.`,
      pubDate: v.createdAt,
    })),
  };
}
