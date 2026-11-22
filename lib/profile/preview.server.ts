/**
 * The profile preview (sprint 10 08): the caller's own profile as a signed-out visitor, or a signed-in member who does
 * not follow them, would see it. Read-only, and assembled only from the readers the profile uses:
 *
 *  - the header is `getProfile`, called for the audience's viewer;
 *  - the first page of posts is `readProfilePosts`, the function behind `GET /api/profile/$id/rmharks`;
 *  - the shelves row is `getPublicShelves`, the reader behind the profile's Shelves tab.
 *
 * No visibility rule is written here. The one thing added is the owner's own check: the profile embeds posts by other
 * members (a repost, a quote card), and the preview shows the owner nothing they could not open themselves, so a post
 * by someone else is kept only when it also passes the owner's view (blocks in both directions, mutes, circles, supporter
 * and follower audiences, private communities), through `viewerVisiblePostWhere` called with the owner's id. What fails
 * becomes "a post you can't see": no author, text or counts. Follow lists are reported as visible or hidden, never as
 * names, and guestbook entries are not read at all.
 *
 * Nothing in this file writes. The readers it calls with the stranger id are held to the same by
 * `lib/profile/__tests__/preview-stranger-id.test.ts`.
 */
import { prisma } from '@/lib/prisma.server';
import { getProfile, type ProfilePayload } from '@/lib/profile.server';
import { readProfilePosts } from '@/lib/profile/api/profile.$id.rmharks.server';
import { viewerVisiblePostWhere } from '@/lib/feed/audience.server';
import { getPrefs, getPublicShelves } from '@/lib/reading/shelves.server';
import { getLeaderboardPrivacy } from '@/lib/game/leaderboard-privacy-settings.server';
import { QUOTE_UNAVAILABLE_MESSAGE } from '@/lib/feed/quoted-original';
import { redactCounts } from '@/lib/feed/quiet-counts';
import type { FeedItem } from '@/lib/feed-types';
import { guestbookTabVisible, likesTabVisible } from '@/lib/profile/audience';
import {
  PREVIEW_STRANGER_ID,
  describeAudience,
  type AudienceSettings,
  type PreviewAudience,
  type PreviewCounts,
  type PreviewHeader,
  type PreviewPost,
  type PreviewQuote,
  type PreviewRow,
  type ProfilePreviewResult,
} from '@/lib/profile/preview';

/** How many posts the preview shows: the profile's first page is longer, and a preview is a glance. */
export const PREVIEW_POST_LIMIT = 10;

/** The viewer a reader is called with for an audience: no one, or a signed-in member with no relationship. */
export function previewViewerId(audience: PreviewAudience): string | null {
  return audience === 'stranger' ? PREVIEW_STRANGER_ID : null;
}

function headerOf(p: ProfilePayload): PreviewHeader {
  return {
    id: p.id,
    name: p.name,
    handle: p.handle,
    image: p.image,
    isVerified: p.isVerified,
    bio: p.bio,
    location: p.location,
    website: p.website,
    links: p.links,
    pronouns: p.pronouns,
    status: p.status,
    presence: p.presence,
    followerCount: p.followerCount,
    followingCount: p.followingCount,
    postCount: p.rmharkCount,
    followLists: p.canSeeFollowLists ? 'visible' : 'hidden',
    guestbookMode: p.guestbookMode,
  };
}

/** The ids, among `ids`, of posts the owner could open themselves. */
async function postsOwnerCanOpen(ownerId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.rMHark.findMany({
    where: { id: { in: ids }, ...(await viewerVisiblePostWhere(ownerId, { hideMuted: true })) },
    select: { id: true },
  });
  return new Set(rows.map((r) => r.id));
}

/** The post a feed item stands for: a repost row stands for the post it repeats. */
const underlyingId = (item: FeedItem): string => item.actualId ?? item.id;

/** Third-party posts on the page: reposts of someone else's post, and quote cards that show someone else's text. */
function thirdPartyIds(items: FeedItem[], ownerId: string): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.user && item.user.id !== ownerId) ids.add(underlyingId(item));
    const q = item.original;
    if (q && q.user && q.user.id !== ownerId && !q.deletedAt && q.content !== QUOTE_UNAVAILABLE_MESSAGE) ids.add(q.id);
  }
  return [...ids];
}

function quoteOf(card: FeedItem | undefined, ownerId: string, openable: Set<string>): PreviewQuote | null {
  if (!card) return null;
  if (card.deletedAt) return { state: 'deleted' };
  if (!card.user || card.content === QUOTE_UNAVAILABLE_MESSAGE) return { state: 'unavailable' };
  if (card.user.id !== ownerId && !openable.has(card.id)) return { state: 'hidden' };
  return { state: 'visible', author: card.user.name ?? card.user.handle ?? null, text: card.content ?? '' };
}

function countsOf(item: FeedItem): PreviewCounts {
  return {
    likes: item.likeCount ?? null,
    replies: item.commentCount ?? null,
    reposts: item.repostCount ?? null,
    views: item.viewCount ?? null,
  };
}

/** One feed item as a static row, or the hidden placeholder when it is someone else's and the owner cannot open it. */
function postOf(item: FeedItem, viewerId: string | null, ownerId: string, openable: Set<string>): PreviewPost {
  const own = !item.user || item.user.id === ownerId;
  if (!own && !openable.has(underlyingId(item))) return { kind: 'hidden', id: item.id };
  // The reader redacted already; the serialiser redacts again so this file never hands a hidden count on.
  const safe = redactCounts(item, viewerId);
  const warning = safe.contentWarning ?? null;
  const covered = !!warning || !!safe.locked;
  return {
    kind: 'post',
    id: safe.id,
    createdAt: safe.createdAt,
    pinned: !!safe.pinned,
    author: own ? null : (safe.user?.name ?? safe.user?.handle ?? null),
    repost: !!safe.repostedBy,
    text: covered ? null : (safe.content ?? ''),
    contentWarning: warning,
    locked: !!safe.locked,
    hasMedia: !covered && ((safe.imageUrls?.length ?? 0) > 0 || !!safe.gifUrl),
    hasPoll: !covered && !!safe.poll,
    counts: covered ? null : countsOf(safe),
    quote: covered ? null : quoteOf(safe.original, ownerId, openable),
  };
}

/** The tabs a profile has, and whether this audience sees each (the same decisions the tab bar makes). */
function sectionsOf(p: ProfilePayload, shelfCount: number): PreviewRow[] {
  return [
    { id: 'posts', visible: true, control: 'none' },
    { id: 'likes', visible: likesTabVisible({ isOwnProfile: false, showLikes: p.showLikes }), control: 'profile' },
    { id: 'achievements', visible: true, control: 'none' },
    {
      id: 'guestbook',
      visible: guestbookTabVisible({ isOwnProfile: false, guestbookMode: p.guestbookMode }),
      control: 'profile',
    },
    { id: 'shelves', visible: shelfCount > 0, control: 'reading' },
    { id: 'kudos', visible: true, control: 'none' },
    { id: 'follow-lists', visible: p.canSeeFollowLists, control: 'profile' },
  ];
}

/** The owner's settings the described audiences read: the profile's own columns, shelf and board switches. */
async function audienceSettingsOf(ownerId: string, p: ProfilePayload): Promise<AudienceSettings> {
  const [row, prefs, board] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { userId: ownerId },
      select: { presenceVisibility: true, presenceDetail: true },
    }),
    getPrefs(ownerId),
    getLeaderboardPrivacy(ownerId),
  ]);
  return {
    presenceVisibility: row?.presenceVisibility ?? 'mutuals',
    presenceDetail: row?.presenceDetail ?? true,
    followListVisibility: p.followListVisibility,
    showLikes: p.showLikes,
    guestbookMode: p.guestbookMode,
    shelvesPublic: prefs.wantPublic || prefs.readingPublic || prefs.readPublic,
    leaderboardHidden: board.hidden,
  };
}

/**
 * `ownerId`'s profile as `audience` sees it; null when the member does not exist. The caller must be `ownerId`: the
 * endpoint passes the session's own id and takes none from the request.
 */
export async function previewProfile(ownerId: string, audience: PreviewAudience): Promise<ProfilePreviewResult | null> {
  const viewerId = previewViewerId(audience);
  const [payload, page, shelves] = await Promise.all([
    getProfile(ownerId, { id: viewerId, isAdmin: false }),
    readProfilePosts({ idOrHandle: ownerId, viewerId, cursor: null, limit: PREVIEW_POST_LIMIT }),
    getPublicShelves(ownerId, viewerId),
  ]);
  if (!payload) return null;

  const openable = await postsOwnerCanOpen(ownerId, thirdPartyIds(page.items, ownerId));
  const settings = await audienceSettingsOf(ownerId, payload);

  return {
    audience,
    header: headerOf(payload),
    posts: page.items.map((item) => postOf(item, viewerId, ownerId, openable)),
    hasMore: page.hasMore,
    sections: sectionsOf(payload, shelves?.entries.length ?? 0),
    described: { follower: describeAudience('follower', settings), mutual: describeAudience('mutual', settings) },
  };
}
