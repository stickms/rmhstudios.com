/**
 * The profile preview (sprint 10 08), the pure half: the stranger's reserved id, the shapes the preview answers with,
 * and the described audience for followers and mutuals. Client-safe: no server imports.
 *
 * The preview never restates a visibility rule. The signed-out and stranger audiences are answered by the readers the
 * profile itself uses; the described audiences call the same pure decisions those readers use
 * (`inPresenceAudience`, `decideFollowListAccess`, `likesTabVisible`, `guestbookTabVisible`).
 */
import type { ProfileLink } from '@/lib/profile-schema';
import type { ProfilePresence } from '@/lib/presence-types';
import type { UserStatus } from '@/lib/profile/status';
import { decideFollowListAccess, type FollowListVisibility } from '@/lib/social/follow-list-privacy';
import { guestbookTabVisible, inPresenceAudience, likesTabVisible } from '@/lib/profile/audience';

/**
 * The viewer id the "a member who does not follow you" preview reads as. It is signed in (so it is not the signed-out
 * visitor) and matches no row: the colon keeps it out of the alphabet of ids (cuids) and of handles (lowercase letters,
 * digits and underscores), so no member can own it. Only `preview.server.ts` passes it, and only to read functions;
 * `preview-stranger-id.test.ts` holds that.
 */
export const PREVIEW_STRANGER_ID = 'preview:stranger';

export function isPreviewStrangerId(value: unknown): boolean {
  return value === PREVIEW_STRANGER_ID;
}

export const PREVIEW_AUDIENCES = ['signed-out', 'stranger'] as const;
export type PreviewAudience = (typeof PREVIEW_AUDIENCES)[number];

export function isPreviewAudience(value: unknown): value is PreviewAudience {
  return typeof value === 'string' && (PREVIEW_AUDIENCES as readonly string[]).includes(value);
}

/** Where the setting behind a row lives. */
export type PreviewControl = 'profile' | 'privacy' | 'reading' | 'none';

/** The header as the profile reader returns it for the audience (a subset: nothing the visitor cannot see). */
export interface PreviewHeader {
  id: string;
  name: string | null;
  handle: string | null;
  image: string;
  isVerified: boolean;
  bio: string | null;
  location: string | null;
  website: string | null;
  links: ProfileLink[];
  pronouns: string | null;
  status: UserStatus | null;
  presence: ProfilePresence;
  followerCount: number;
  followingCount: number;
  postCount: number;
  /** Whether this audience may open the followers and following lists. Never the names. */
  followLists: 'visible' | 'hidden';
  guestbookMode: string;
}

/** A quote card inside a post, as far as the audience and the owner may both see it. */
export type PreviewQuote =
  | { state: 'visible'; author: string | null; text: string }
  | { state: 'unavailable' }
  | { state: 'deleted' }
  | { state: 'hidden' };

/** The four numbers on a post; null when the author hides them from this audience. */
export interface PreviewCounts {
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  views: number | null;
}

export type PreviewPost =
  /** A post by someone else that the audience may see but the owner may not: no author, text or counts. */
  | { kind: 'hidden'; id: string }
  | {
      kind: 'post';
      id: string;
      createdAt: string;
      pinned: boolean;
      /** The author's name when the owner reposted someone else's post; null for the owner's own post. */
      author: string | null;
      repost: boolean;
      /** Null when the post is covered (a content warning) or locked behind a price. */
      text: string | null;
      contentWarning: string | null;
      locked: boolean;
      hasMedia: boolean;
      hasPoll: boolean;
      counts: PreviewCounts | null;
      quote: PreviewQuote | null;
    };

/** The id of one thing a profile shows or a setting decides. */
export type PreviewRowId =
  | 'posts'
  | 'likes'
  | 'achievements'
  | 'guestbook'
  | 'shelves'
  | 'kudos'
  | 'follow-lists'
  | 'presence'
  | 'activity'
  | 'leaderboards';

export interface PreviewRow {
  id: PreviewRowId;
  visible: boolean;
  control: PreviewControl;
}

/** The owner's settings the described audiences are derived from. */
export interface AudienceSettings {
  presenceVisibility: string;
  presenceDetail: boolean;
  followListVisibility: FollowListVisibility;
  showLikes: boolean;
  guestbookMode: string;
  /** At least one reading shelf is public. */
  shelvesPublic: boolean;
  /** The member is left off public game boards. */
  leaderboardHidden: boolean;
}

export const DESCRIBED_AUDIENCES = ['follower', 'mutual'] as const;
/** A follower follows the owner; a mutual also has the owner following back. */
export type DescribedAudience = (typeof DESCRIBED_AUDIENCES)[number];

/** What each setting lets a follower, or a follower the owner follows back, see. Text, not a computed profile. */
export function describeAudience(audience: DescribedAudience, s: AudienceSettings): PreviewRow[] {
  const mutual = audience === 'mutual';
  const presence = inPresenceAudience({
    visibility: s.presenceVisibility,
    isOwnProfile: false,
    hasViewer: true,
    viewerFollowsOwner: true,
    ownerFollowsViewer: mutual,
  });
  return [
    { id: 'presence', visible: presence, control: 'privacy' },
    { id: 'activity', visible: presence && s.presenceDetail, control: 'privacy' },
    {
      id: 'follow-lists',
      visible: decideFollowListAccess({
        visibility: s.followListVisibility,
        viewerId: 'follower',
        ownerId: 'owner',
        viewerIsAdmin: false,
        viewerFollowsOwner: true,
        ownerFollowsViewer: mutual,
      }),
      control: 'profile',
    },
    { id: 'likes', visible: likesTabVisible({ isOwnProfile: false, showLikes: s.showLikes }), control: 'profile' },
    {
      id: 'guestbook',
      visible: guestbookTabVisible({ isOwnProfile: false, guestbookMode: s.guestbookMode }),
      control: 'profile',
    },
    { id: 'shelves', visible: s.shelvesPublic, control: 'reading' },
    { id: 'leaderboards', visible: !s.leaderboardHidden, control: 'privacy' },
  ];
}

/** The whole answer for one audience. */
export interface ProfilePreviewResult {
  audience: PreviewAudience;
  header: PreviewHeader;
  posts: PreviewPost[];
  hasMore: boolean;
  /** Each tab of the profile and whether this audience sees it, plus the follow lists. */
  sections: PreviewRow[];
  /** What followers and mutuals see, stated from the settings. */
  described: { follower: PreviewRow[]; mutual: PreviewRow[] };
}
