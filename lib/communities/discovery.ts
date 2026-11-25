/**
 * Out of discovery (sprint 10 17).
 *
 * An admin can take a community out of discovery: it stops being offered to people who are not already in it, and
 * nothing else changes. Its members, its page, its feed, its links and its notifications are as they were. The
 * state is `Community.delistedAt` (with a reason and the admin, kept for the moderators and the audit log).
 *
 * Pure and client-safe: no Prisma, no server imports. The two `where` builders are Prisma-shaped plain objects every
 * reader below spreads in, so "discoverable" is written once.
 */

/** The longest reason an admin may give; it is shown to the community's moderators. */
export const DELIST_REASON_MAX = 300;
export const DELIST_REASON_MIN = 5;

/** The shape of a community row's discovery columns. */
export interface DelistState {
  delistedAt: Date | string | null;
  delistedReason: string | null;
}

/** A community is out of discovery when `delistedAt` is set. */
export function isDelisted(c: { delistedAt: Date | string | null | undefined }): boolean {
  return c.delistedAt != null;
}

/**
 * The `where` of a community a discovery reader may list: `extra` (the reader's own conditions, such as
 * `{ isPrivate: false }`) and not delisted. Spread it, or pass the reader's conditions as the argument.
 */
export function discoverableCommunityWhere<T extends object>(extra?: T): T & { delistedAt: null } {
  return { ...(extra as T), delistedAt: null };
}

/**
 * The `where` of a post a discovery surface may offer by its community: a post outside any community, or one in a
 * community that is not delisted. For readers of posts (Explore's hot posts, the site-wide search); a community's own
 * page and feed do not use it.
 */
export function discoverablePostWhere(): {
  OR: [{ communityId: null }, { community: { delistedAt: null } }];
} {
  return { OR: [{ communityId: null }, { community: { delistedAt: null } }] };
}

/**
 * The same rule as a SQL condition for a raw query over `rmheet` (table `community`, column `"delistedAt"`). It is a
 * fixed string with nothing bound, so it can be placed in a `Prisma.raw` fragment.
 */
export const DISCOVERABLE_POST_SQL =
  '("communityId" IS NULL OR "communityId" NOT IN (SELECT id FROM community WHERE "delistedAt" IS NOT NULL))';

/** In-process cache keys that hold a discovery list; an admin action drops them so the change shows at once. */
export const DISCOVERY_CACHE_KEYS = ['explore:list', 'explore:hot-candidates'] as const;

/**
 * Every source file that lists communities, or posts by their community, to people who are not already in it. Each
 * must apply `discoverableCommunityWhere` / `discoverablePostWhere` / `DISCOVERABLE_POST_SQL`.
 * `discovery-read-paths.test.ts` reads these files, and fails any other file under `app/`, `lib/`, `features/` or
 * `server/` that lists communities without being named here or in `DISCOVERY_EXEMPT_PATHS`, so a new path is added on
 * purpose.
 */
export const DISCOVERY_READ_PATHS = [
  // The directory and its search (`q`): `/communities` and `GET /api/communities`.
  'lib/communities/directory.server.ts',
  // Explore's community rail and its hot posts.
  'lib/explore.server.ts',
  // The related rail on a community page.
  'lib/communities/sisters.server.ts',
  // A game's communities on its library page.
  'lib/games/detail.server.ts',
  // The sitemap: the community pages, and a community's wiki pages.
  'lib/sitemap.server.ts',
  // Site-wide post search (the site's search box and the developer API's search); `in:<slug>` stays inside.
  'lib/search/posts.server.ts',
  'lib/api/v1/search.server.ts',
  // Hashtag pages offer posts by tag to people browsing.
  'lib/tags.server.ts',
] as const;

/**
 * Files that read communities but are not a discovery list, with the reason each is not in `DISCOVERY_READ_PATHS`.
 * Entries come out as readers join the list; they do not go in to silence the test.
 */
export const DISCOVERY_EXEMPT_PATHS: Readonly<Record<string, string>> = {
  'lib/admin/communities.server.ts': 'The admin list: it exists to show a community that is out of discovery.',
  'lib/admin/lookup.server.ts': 'The admin lookup of one record by id, for admins only.',
  'lib/admin/api/admin.communities.$slug.owner.server.ts': 'Admin: takes over an ownerless community by slug.',
  'lib/communities/handover.server.ts': "Finds ownerless communities for an admin's take-over list (admins only).",
  'lib/communities/access.server.ts': 'Reads one community by id or slug for access checks, not a list.',
  'lib/communities/detail.server.ts': "A community's own page, which stays reachable by link and for members.",
  'lib/communities/pages.server.ts':
    "One community's own wiki pages, listed on its page for whoever can read it; not a list of communities.",
  'lib/communities/page-access.server.ts': "Access to one community's wiki page by slug, not a list.",
  'lib/communities/guard.server.ts': 'Resolves one community by slug for a moderation call.',
  'lib/communities/settings.server.ts': 'Reads one community by id for its own settings.',
  'lib/communities/rules.server.ts': 'Reads one community by id for its own rules.',
  'lib/communities/extras.server.ts': 'Reads one community by id for its own page extras.',
  'lib/communities/read-along.server.ts':
    'Reads one community by slug for its own read-alongs (the page, the mod tab and the parts job).',
  'lib/communities/recurring.server.ts': "A community's own recurring threads and the members' own memberships.",
  'lib/communities/contributors.server.ts':
    "Batches over every community to compute members' scores; nothing is listed.",
  'lib/communities/bans.server.ts': 'Reads one community by id for its own moderation.',
  'lib/communities/api/communities.server.ts':
    'Create and lookup of one community; the directory GET goes through listCommunities.',
  'lib/communities/api/communities.$slug.handover.respond.server.ts': 'One community, by slug, for its own handover.',
  'lib/communities/api/communities.$slug.handover.server.ts': 'One community, by slug, for its own handover.',
  'lib/communities/api/communities.$slug.modlog.server.ts': 'One community, by slug, for its own mod log.',
  'lib/communities/api/communities.$slug.bans.server.ts': 'One community, by slug, for its own bans.',
  'lib/communities/api/communities.$slug.join.server.ts':
    'One community, by slug, for joining it (a link still works).',
  'lib/scheduled/publish.server.ts': "Reads the post's own community for publishing a scheduled post.",
  'lib/moderation/content.server.ts': "Reads the removed content's own community for moderation.",
  'lib/discovery/watch.server.ts': 'One community by id for a watch the viewer asked for; a watch is not a listing.',
  'lib/events.server.ts': "A member's own communities for the events they can see; events are not communities.",
  'lib/og/live-stats.server.ts': 'A single public count on a share card; it names no community.',
  'lib/api/v1/events.server.ts': "A key owner's own communities for hosting an event.",
  'lib/api/v1/moderation.server.ts': "One community, by slug, for the key owner's moderation.",
  'lib/api/v1/communities.server.ts':
    "The key owner's own memberships and one community by slug; the API has no community listing.",
  'lib/feed/audience.server.ts': 'Whether one post may be read (private-community membership), not a list.',
  'lib/calendar/polls.server.ts': "One community's member check for a poll.",
  'lib/games/profile.server.ts':
    "A member's own public memberships on their profile; reached through the member, not discovery.",
  'lib/spaces.server.ts': 'Live spaces by origin, not a list of communities.',
  'lib/schedule/grid.server.ts': 'Events on a schedule grid, not a list of communities.',
};
