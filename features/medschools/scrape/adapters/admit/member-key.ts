/**
 * The ONE place an Admit member's dedupe key is built, so every path that can see the same person's report (the live
 * feed, the profile-history backfill, the school forums) produces the identical key and the report counts once:
 * `hash(ADMIT:author:<user id>:<schoolId>:<cycleYear>:<type>)` with the server secret.
 *
 * The user id is an argument and is gone when the function returns; callers keep the id only inside a closure (the
 * adapters never hand it out) and never store or log it.
 */
import { dedupeHash } from '../../../engine/dedupe';
import type { MedEventType } from '../../../engine/types';

export function admitMemberKey(
  secret: string,
  userId: string,
  schoolId: string,
  cycleYear: number,
  type: MedEventType,
): string {
  return dedupeHash(secret, 'ADMIT', `author:${userId}:${schoolId}:${cycleYear}:${type}`);
}

/**
 * Fallback key for a forum post whose author id is not available (anonymous or deleted posts): per post, event type
 * and day, so one post can never count an event twice. The post id is hashed here and is a different HMAC input from the
 * cursor hash, so neither can be turned into the other.
 */
export function admitForumPostKey(secret: string, postId: string, type: MedEventType, day: string): string {
  return dedupeHash(secret, 'ADMIT', `forumpost:${postId}:${type}:${day}`);
}

/** The persisted forum cursor: a keyed hash of the last processed post's id, never the id. */
export function admitForumCursorHash(secret: string, postId: string): string {
  return dedupeHash(secret, 'ADMIT', `forumcursor:${postId}`);
}
