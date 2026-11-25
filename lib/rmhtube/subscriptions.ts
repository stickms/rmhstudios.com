/**
 * Subscribing to an RMHTube host (s13-07) — the pure rules, client-safe. A subscription is a follow of a host for
 * their watch parties only. The database side is `subscriptions.server.ts`; the strings are the components'.
 */

/** A member follows at most this many hosts. */
export const MAX_TUBE_SUBSCRIPTIONS = 200;
/** The fan-out reads this many subscribers per batch. */
export const PARTY_FANOUT_BATCH = 200;
/** The most subscribers one party notice reaches (a runaway guard, far above the 200-host cap's reach for one host). */
export const PARTY_FANOUT_MAX = 5000;

/** The work queue the party notice rides (`server/jobs/index.ts`). */
export const PARTY_FANOUT_QUEUE = 'rmhtube.party-fanout';
/** The notification's entity type: the inbox already labels it "RMHTube". */
export const PARTY_NOTICE_ENTITY = 'rmhtube_party';

export interface PartyFanoutJob {
  roomId: string;
}

/** One job per party: enqueueing a party twice is one job. */
export function partyFanoutJobKey(roomId: string): string {
  return `tube-party:${roomId}`;
}

/** Where the notice leads, and what "already told" matches on. */
export function partyNoticeLink(roomId: string): string {
  return `/rmhtube/party/${roomId}`;
}

export interface TubeHostDTO {
  id: string;
  name: string | null;
  handle: string | null;
}

/** True when the subscriber is at the cap and a new host would be the 201st. */
export function atSubscriptionCap(count: number): boolean {
  return count >= MAX_TUBE_SUBSCRIPTIONS;
}

/** A banned (also: erased, whose account is locked far ahead) or pending-deletion account cannot be followed or told. */
export function isHostReachable(
  user: { bannedUntil: Date | null; deletionScheduledAt: Date | null },
  now: Date,
): boolean {
  if (user.deletionScheduledAt) return false;
  return !(user.bannedUntil && user.bannedUntil.getTime() > now.getTime());
}

/** The members of `candidates` the host may tell: not blocked either way, and not already going. */
export function eligibleSubscribers(
  candidates: readonly { id: string; bannedUntil: Date | null; deletionScheduledAt: Date | null }[],
  opts: { blocked: ReadonlySet<string>; going: ReadonlySet<string>; now: Date },
): string[] {
  return candidates
    .filter((c) => isHostReachable(c, opts.now) && !opts.blocked.has(c.id) && !opts.going.has(c.id))
    .map((c) => c.id);
}
