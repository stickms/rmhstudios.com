/**
 * Blocks and reports in Rideshare (s13-15).
 *
 * - `rideReportAuthor`: who a report of a trip is about (the other party), only for the rider or the driver of a trip
 *   that was accepted and ended no more than 30 days ago. Everyone else gets the same `null` as an unknown id.
 * - `ridePreview`: what a moderator reads for a reported trip: its times, its pickup and drop-off labels (never
 *   coordinates, never a saved place), the two parties and the trip's chat. The chat is the evidence.
 * - `rideChatClosed`: the trip chat is off once the trip is not under way, or when either party has blocked the other
 *   (blocks come from `getBlockedAuthorIds`, both directions). A block mid-trip closes the chat and leaves the trip.
 * - `blockedRiderFilter`: the `where` fragment that keeps a blocked rider's request out of a driver's list.
 */
import { withinRideReportWindow } from '@/lib/rideshare/report-window';
import { prisma } from '@/lib/prisma.server';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { ERROR_CODES, refusalBody, type ErrorCode } from '@/lib/errors/codes';
import type { RefusalParams } from '@/lib/errors/codes';

/** The newest chat messages a moderator is shown, and the longest line of each. */
export const RIDE_PREVIEW_MESSAGES = 40;

export interface RideParties {
  riderId: string;
  driverId: string | null;
}

/** The other member of the trip, or `null` when `viewerId` is not a party (or there is no driver yet). */
export function otherParty(ride: RideParties, viewerId: string): string | null {
  if (ride.riderId === viewerId) return ride.driverId;
  if (ride.driverId === viewerId) return ride.riderId;
  return null;
}

/** Pure: is chat off for this trip, given the viewer's block set? Not under way, or the other party is blocked. */
export function chatClosedFor(
  ride: RideParties & { status: string },
  viewerId: string,
  blockedIds: readonly string[],
): boolean {
  if (ride.status !== 'ACCEPTED' && ride.status !== 'IN_PROGRESS') return true;
  const other = otherParty(ride, viewerId);
  if (!other) return true;
  return blockedIds.includes(other);
}

/** Is chat off for this trip for `viewerId`? A failed block lookup throws, so the request fails, not allows. */
export async function rideChatClosed(ride: RideParties & { status: string }, viewerId: string): Promise<boolean> {
  if (ride.status !== 'ACCEPTED' && ride.status !== 'IN_PROGRESS') return true;
  return chatClosedFor(ride, viewerId, await getBlockedAuthorIds(viewerId));
}

/** Is the rider of a request blocked, in either direction, with the driver who would accept it? */
export async function rideBlockedWith(riderId: string, driverId: string): Promise<boolean> {
  return (await getBlockedAuthorIds(driverId)).includes(riderId);
}

/**
 * The condition that leaves a blocked rider's requests (and the driver's own) out of the query itself, so a page of
 * 50 stays full.
 */
export function blockedRiderFilter(blockedIds: readonly string[], selfId: string): { riderId: { notIn: string[] } } {
  return { riderId: { notIn: [...blockedIds, selfId] } };
}

/** A refusal in the taxonomy: the code's English, its code and params, with the code's HTTP status. */
export function refuse(code: ErrorCode, params?: RefusalParams, headers?: Record<string, string>): Response {
  return Response.json(refusalBody(code, params), { status: ERROR_CODES[code].http, ...(headers ? { headers } : {}) });
}

/**
 * Pure: the member a report of this trip is about, or `null`. `now` is injected for the tests.
 */
export function reportAuthorOf(
  ride: RideParties & { acceptedAt: Date | null; completedAt: Date | null; cancelledAt: Date | null },
  reporterId: string,
  now: Date,
): string | null {
  const other = otherParty(ride, reporterId);
  // No driver yet, or never accepted: there was no trip to report.
  if (!other || !ride.driverId || !ride.acceptedAt) return null;
  const ended = ride.completedAt ?? ride.cancelledAt;
  if (!withinRideReportWindow(ended, now)) return null;
  return other;
}

export async function rideReportAuthor(
  rideId: string,
  reporterId: string,
  now: Date = new Date(),
): Promise<string | null> {
  const ride = await prisma.ride.findUnique({
    where: { id: rideId },
    select: { riderId: true, driverId: true, acceptedAt: true, completedAt: true, cancelledAt: true },
  });
  return ride ? reportAuthorOf(ride, reporterId, now) : null;
}

/**
 * A place label is whatever the rider's geocoder returned: often a full street address, and for "current location"
 * the coordinates themselves. A moderator needs the area, not the door, so coordinate pairs are removed and the
 * leading segments that carry a house number are dropped (a one-segment label keeps its name, shortened).
 */
export function placeArea(label: string): string {
  const noCoords = label.replace(/-?\d{1,3}\.\d{2,}\s*,\s*-?\d{1,3}\.\d{2,}/g, '').replace(/\(\s*\)/g, '');
  const parts = noCoords
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const out = parts.filter((p) => !/\d/.test(p)).join(', ');
  return (out || 'place withheld').slice(0, 60);
}

/** Longest chat line and total characters a moderator is shown; the newest messages win the budget. */
const PREVIEW_LINE = 160;
const PREVIEW_BUDGET = 2400;

const stamp = (d: Date | null): string => (d ? d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : 'n/a');
const who = (u: { name: string | null; handle: string | null } | null): string =>
  u ? (u.name?.trim() || u.handle?.trim() || 'unnamed') + (u.handle ? ` (@${u.handle})` : '') : 'none';

/** The moderator's text for one trip. Pure, so the tests can pin that no coordinate reaches it. */
export function formatRidePreview(ride: {
  status: string;
  pickupLabel: string;
  dropoffLabel: string;
  requestedAt: Date;
  acceptedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  rider: { name: string | null; handle: string | null };
  driver: { name: string | null; handle: string | null } | null;
  messages: { senderId: string; content: string; createdAt: Date }[];
  riderId: string;
}): string {
  const lines = [
    `Trip ${ride.status}: ${placeArea(ride.pickupLabel)} to ${placeArea(ride.dropoffLabel)}`,
    `Requested ${stamp(ride.requestedAt)}, accepted ${stamp(ride.acceptedAt)}, completed ${stamp(ride.completedAt)}, cancelled ${stamp(ride.cancelledAt)}`,
    `Rider ${who(ride.rider)}; driver ${who(ride.driver)}`,
  ];
  if (ride.messages.length === 0) {
    lines.push('Chat: no messages');
  } else {
    // Newest first against the budget, so a long chat loses its oldest lines, never its latest.
    const chat: string[] = [];
    let used = 0;
    for (const m of [...ride.messages].reverse()) {
      const line = `${stamp(m.createdAt)} ${m.senderId === ride.riderId ? 'rider' : 'driver'}: ${m.content.slice(0, PREVIEW_LINE)}`;
      if (used + line.length > PREVIEW_BUDGET) break;
      used += line.length;
      chat.unshift(line);
    }
    lines.push(chat.length < ride.messages.length ? 'Chat (earlier messages left out):' : 'Chat:', ...chat);
  }
  // The queue flattens whitespace, so the parts are separated by a visible bar.
  return lines.join(' | ');
}

/** The moderator's view of each reported trip, keyed by ride id. Reads only the reported trips, by id. */
export async function ridePreview(ids: readonly string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const rows = await prisma.ride.findMany({
    where: { id: { in: [...ids] } },
    select: {
      id: true,
      riderId: true,
      status: true,
      pickupLabel: true,
      dropoffLabel: true,
      requestedAt: true,
      acceptedAt: true,
      completedAt: true,
      cancelledAt: true,
      rider: { select: { name: true, handle: true } },
      driver: { select: { name: true, handle: true } },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: RIDE_PREVIEW_MESSAGES,
        select: { senderId: true, content: true, createdAt: true },
      },
    },
  });
  for (const row of rows) {
    out.set(row.id, formatRidePreview({ ...row, messages: [...row.messages].reverse() }));
  }
  return out;
}
