/**
 * Adapters from the v1 shapes (`/api/v1/me/rmhtube/*`, `/api/v1/rmhtube/parties*`) to the functions the site uses
 * (s10-14): `listWatchLater` / `addWatchLater` / `deleteWatchLater`, `listUpcoming` / `getParty` / `setGoing` and
 * `getMyStats`. No new business rule. Every function acts as the key owner and takes no other member's id.
 *
 * A party is visible to the key owner when it is public, or they host it, or they are going (the site's
 * `listUpcoming` rule: a link-only party is never listed to anyone else); anything else is `null`, the same answer
 * as a room that does not exist (s14-10: so is a room a moderator removed, which `listUpcoming` and `getParty` leave
 * out; `TUBE_ROOM_READ_PATHS` holds that). A party whose host is in a block with the key owner, in either direction, is
 * hidden the same way. A party's attendee list is never returned: only `going` (the owner's own answer) and the
 * count the site shows.
 */
import { filterBlocked } from '@/lib/social/follow-list-privacy.server';
import { addWatchLater, deleteWatchLater, findWatchLater, listWatchLaterPage } from '@/lib/rmhtube/watch.server';
import { getParty, listUpcoming, roomIdFromParams, setGoing, type PartyRefusal } from '@/lib/rmhtube/parties.server';
import { getMyStats } from '@/lib/rmhtube/stats.server';
import type { PartyDTO } from '@/lib/rmhtube/parties.contract';
import { decodeWatchLaterCursor, encodeWatchLaterCursor } from '@/lib/api/v1/rmhtube-schema';

export interface ApiWatchLaterItem {
  id: string;
  url: string;
  title: string;
  createdAt: string;
}

export interface ApiParty {
  id: string;
  name: string;
  /** An empty string when the host wrote none. */
  description: string;
  /** ISO 8601 UTC. */
  startsAt: string;
  isPublic: boolean;
  maxMembers: number;
  host: { id: string; name: string };
  /** The count the site shows. The list of who is going is not returned. */
  goingCount: number;
  /** Whether the key owner is going. */
  going: boolean;
  /** Whether the key owner hosts it. */
  isHost: boolean;
  closed: boolean;
}

const toItem = (r: { id: string; url: string; title: string; createdAt: Date }): ApiWatchLaterItem => ({
  id: r.id,
  url: r.url,
  title: r.title,
  createdAt: r.createdAt.toISOString(),
});

export async function listWatchLaterForKey(
  userId: string,
  opts: { limit: number; cursor?: string | undefined },
): Promise<{ data: ApiWatchLaterItem[]; nextCursor: string | null } | 'invalid_cursor'> {
  let after: { at: Date; id: string } | null = null;
  if (opts.cursor) {
    after = decodeWatchLaterCursor(opts.cursor);
    if (!after) return 'invalid_cursor';
  }
  const { rows, hasMore } = await listWatchLaterPage(userId, opts.limit, after);
  const last = rows[rows.length - 1];
  return {
    data: rows.map(toItem),
    nextCursor: hasMore && last ? encodeWatchLaterCursor({ at: last.createdAt, id: last.id }) : null,
  };
}

/** Saves the URL (the site's `addWatchLater`); `created` is false when it was already in the list. */
export async function addWatchLaterForKey(
  userId: string,
  input: { url: string; title?: string | undefined },
): Promise<{ item: ApiWatchLaterItem; created: boolean }> {
  const existing = await findWatchLater(userId, input.url);
  if (existing) return { item: toItem(existing), created: false };
  const title = input.title || new URL(input.url).hostname;
  return { item: toItem(await addWatchLater(userId, input.url, title)), created: true };
}

/** True when a row of the key owner's was removed; another member's id removes nothing. */
export async function deleteWatchLaterForKey(userId: string, id: string): Promise<boolean> {
  const out = await deleteWatchLater(userId, id);
  return out.count > 0;
}

const toParty = (p: PartyDTO): ApiParty => ({
  id: p.roomId,
  name: p.name,
  description: p.description ?? '',
  startsAt: p.scheduledFor,
  isPublic: p.isPublic,
  maxMembers: p.maxMembers,
  host: { id: p.host.id, name: p.host.name ?? '' },
  goingCount: p.goingCount,
  going: p.viewerGoing,
  isHost: p.viewerIsHost,
  closed: p.closed,
});

const seenBy = (p: PartyDTO) => p.isPublic || p.viewerGoing || p.viewerIsHost;

export async function listPartiesForKey(userId: string): Promise<ApiParty[]> {
  const parties = (await listUpcoming(userId)).filter(seenBy);
  const hosts = [...new Set(parties.map((p) => p.host.id))];
  const allowed = new Set(await filterBlocked(userId, hosts));
  return parties.filter((p) => allowed.has(p.host.id)).map(toParty);
}

async function visibleParty(roomId: string, userId: string): Promise<PartyDTO | null> {
  const party = await getParty(roomId, userId);
  if (!party || !seenBy(party)) return null;
  if ((await filterBlocked(userId, [party.host.id])).length === 0) return null;
  return party;
}

export async function getPartyForKey(rawId: string, userId: string): Promise<ApiParty | null> {
  const roomId = roomIdFromParams({ roomId: rawId });
  if (!roomId) return null;
  const party = await visibleParty(roomId, userId);
  return party && toParty(party);
}

export type GoingFailure = {
  code: 'not_found' | 'party_closed' | 'forbidden' | 'invalid_request' | 'rate_limited';
  message: string;
  status: 400 | 403 | 404 | 409 | 429;
};

const REFUSALS: Record<PartyRefusal, GoingFailure> = {
  NOT_FOUND: { code: 'not_found', message: 'Party not found.', status: 404 },
  CLOSED: { code: 'party_closed', message: 'This party is closed.', status: 409 },
  MODERATED: { code: 'party_closed', message: 'This party is closed.', status: 409 },
  NAME_REMOVED: { code: 'invalid_request', message: 'Request not allowed.', status: 400 },
  FORBIDDEN: { code: 'forbidden', message: 'Not allowed.', status: 403 },
  TOO_SOON: { code: 'invalid_request', message: 'Request not allowed.', status: 400 },
  TOO_FAR: { code: 'invalid_request', message: 'Request not allowed.', status: 400 },
  INVALID_TIME: { code: 'invalid_request', message: 'Request not allowed.', status: 400 },
  INVALID_VIDEO: { code: 'invalid_request', message: 'Request not allowed.', status: 400 },
  HOST_LIMIT: { code: 'rate_limited', message: 'Request not allowed.', status: 429 },
  DAILY_LIMIT: { code: 'rate_limited', message: 'Request not allowed.', status: 429 },
};

/** The site's `setGoing`, after the same visibility the reads use (a party you cannot see is 404). */
export async function setGoingForKey(
  rawId: string,
  userId: string,
  going: boolean,
): Promise<{ ok: true; party: ApiParty } | { ok: false; failure: GoingFailure }> {
  const roomId = roomIdFromParams({ roomId: rawId });
  if (!roomId) return { ok: false, failure: REFUSALS.NOT_FOUND };
  if (going) {
    if (!(await visibleParty(roomId, userId))) return { ok: false, failure: REFUSALS.NOT_FOUND };
  } else {
    // Leaving is always allowed for someone who is going, even after a block hid the party from the reads.
    const party = await getParty(roomId, userId);
    if (!party || !(party.viewerGoing || party.viewerIsHost)) return { ok: false, failure: REFUSALS.NOT_FOUND };
  }
  const result = await setGoing(roomId, userId, going);
  if (!result.ok) return { ok: false, failure: REFUSALS[result.reason] };
  return { ok: true, party: toParty(result.value) };
}

/** The key owner's statistics as the site serves them, with the pause flag. */
export async function statsForKey(userId: string) {
  const s = await getMyStats(userId);
  return { counters: s.counters, paused: s.paused, days: s.days };
}
