/**
 * Who may browse a member's followers and following lists (sprint 04 #18).
 *
 * Pure decision table; the database lookups live in `follow-list-privacy.server.ts`.
 * Counts are never gated, only the lists. "Mutuals" means what `presenceVisibility`
 * gives the word: the viewer follows the owner and the owner follows the viewer back.
 */

export const FOLLOW_LIST_VISIBILITIES = ['everyone', 'mutuals', 'me'] as const;
export type FollowListVisibility = (typeof FOLLOW_LIST_VISIBILITIES)[number];

export const DEFAULT_FOLLOW_LIST_VISIBILITY: FollowListVisibility = 'everyone';

/** The error code the site endpoints answer with (HTTP 403) when the viewer may not browse the list. */
export const LIST_PRIVATE = 'LIST_PRIVATE';

export function isFollowListVisibility(value: unknown): value is FollowListVisibility {
  return typeof value === 'string' && (FOLLOW_LIST_VISIBILITIES as readonly string[]).includes(value);
}

/** A stored value as a setting. An unrecognised value fails closed (`me`); a missing one is the default. */
export function normalizeFollowListVisibility(value: string | null | undefined): FollowListVisibility {
  if (value == null) return DEFAULT_FOLLOW_LIST_VISIBILITY;
  return isFollowListVisibility(value) ? value : 'me';
}

export interface FollowListAccessFacts {
  visibility: FollowListVisibility;
  /** Null when signed out. */
  viewerId: string | null;
  ownerId: string;
  viewerIsAdmin: boolean;
  viewerFollowsOwner: boolean;
  ownerFollowsViewer: boolean;
}

/** The decision table: the owner always sees their own lists, admins see everything (moderation). */
export function decideFollowListAccess(f: FollowListAccessFacts): boolean {
  if (f.viewerId !== null && f.viewerId === f.ownerId) return true;
  if (f.viewerIsAdmin) return true;
  switch (f.visibility) {
    case 'everyone':
      return true;
    case 'mutuals':
      return f.viewerId !== null && f.viewerFollowsOwner && f.ownerFollowsViewer;
    case 'me':
      return false;
  }
}

/**
 * Every source file that reveals who follows whom to somebody other than the owner. Each one must gate through
 * `canSeeFollowLists` and drop blocked pairs through `filterBlocked` (or, for the one SQL path, the same table written
 * as a join). `follow-list-privacy.test.ts` reads these files, and fails any other file under `app/`, `lib/` or
 * `features/` that lists another member's follow edges without being named here, so a new path is added on purpose.
 */
export const FOLLOW_LIST_READ_PATHS = [
  'lib/profile/api/profile.$id.followers.server.ts',
  'lib/profile/api/profile.$id.following.server.ts',
  'app/routes/api/v1/users/$handle/followers.ts',
  'app/routes/api/v1/users/$handle/following.ts',
  'lib/games/profile.server.ts',
  'lib/explore.server.ts',
] as const;
