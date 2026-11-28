/**
 * `/api/v1/me/homes/*` (RMH Homes; scopes `read:homes` and `write:homes`).
 *
 * Nothing here is a second implementation of the site's saved homes: a save is `favorite`, a note is
 * `setFavoriteNote`, the price alert is `setPriceAlerts`, an unsave is `unfavorite` and the saved searches are
 * `listWatches`. Reads are the key owner's own `HomeFavorite` rows only.
 *
 * What a response carries is an allowlist (the `select`s below). A listing's address, coordinates and posting author
 * are never selected, and `priceNoticeAt` (an internal throttle) is never returned. A listing a moderator removed, or
 * one whose author is blocked either way, reads `available: false` with its figures `null`; the saved row and the
 * note stay.
 */
import { readInput } from './request-input';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { RATE_LIMIT_POLICIES, rateLimit } from '@/lib/rate-limit';
import { SITE_URL } from '@/lib/seo';
import { getBlockedAuthorIds } from '@/lib/moderation.server';
import { favorite, setFavoriteNote, unfavorite } from '@/lib/homes/listings.server';
import { setPriceAlerts } from '@/lib/homes/prices.server';
import { listWatches } from '@/lib/homes/watches.server';
import { decodeSavedCursor, encodeSavedCursor, type PutSavedBody, type savedQuery } from '@/lib/api/v1/homes-schema';

/** Headers for every response of these routes: a house hunt is personal and must not sit in a shared cache. */
export const NO_STORE = { 'Cache-Control': 'private, no-store' } as const;

/** The newest this many recorded price changes of a listing ride on its saved row. */
export const PRICE_CHANGE_LIMIT = 10;

export interface PriceChangeV1 {
  oldCents: number;
  newCents: number;
  changedAt: string;
}

export interface SavedListingV1 {
  title: string | null;
  listingType: string | null;
  propertyType: string | null;
  priceCents: number | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  city: string | null;
  state: string | null;
  status: string | null;
  url: string;
  available: boolean;
}

export interface SavedHomeV1 {
  listingId: string;
  savedAt: string;
  note: string | null;
  priceAlerts: boolean;
  listing: SavedListingV1;
  priceChanges: PriceChangeV1[];
}

export interface SavedSearchV1 {
  id: string;
  label: string;
  listingType: string | null;
  propertyTypes: string[];
  locationLabel: string | null;
  radiusKm: number | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  minBeds: number | null;
  minBaths: number | null;
  petsRequired: boolean;
  active: boolean;
  createdAt: string;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/** The listing's page on the site (the address and map live there, not in the API). */
export const listingUrl = (listingId: string): string => `${SITE_URL}/homes/listing/${listingId}`;

const savedSelect = {
  id: true,
  listingId: true,
  createdAt: true,
  priceAlerts: true,
  note: true,
  listing: {
    select: {
      id: true,
      title: true,
      listingType: true,
      propertyType: true,
      priceCents: true,
      beds: true,
      baths: true,
      sqft: true,
      city: true,
      state: true,
      status: true,
      authorId: true,
      moderatedAt: true,
      priceChanges: {
        orderBy: { changedAt: 'desc' },
        take: PRICE_CHANGE_LIMIT,
        select: { oldCents: true, newCents: true, changedAt: true },
      },
    },
  },
} satisfies Prisma.HomeFavoriteSelect;

type SavedRow = Prisma.HomeFavoriteGetPayload<{ select: typeof savedSelect }>;

/** One saved row as the API shows it. `blocked` is the key owner's blocked-either-way author ids. */
export function toSavedHomeV1(row: SavedRow, blocked: ReadonlySet<string>): SavedHomeV1 {
  const l = row.listing;
  const available = Boolean(l) && l.moderatedAt === null && !(l.authorId !== null && blocked.has(l.authorId));
  return {
    listingId: row.listingId,
    savedAt: row.createdAt.toISOString(),
    note: row.note,
    priceAlerts: row.priceAlerts,
    listing: available
      ? {
          title: l.title,
          listingType: l.listingType,
          propertyType: l.propertyType,
          priceCents: l.priceCents,
          beds: l.beds,
          baths: l.baths,
          sqft: l.sqft,
          city: l.city,
          state: l.state,
          status: l.status,
          url: listingUrl(row.listingId),
          available: true,
        }
      : {
          title: null,
          listingType: null,
          propertyType: null,
          priceCents: null,
          beds: null,
          baths: null,
          sqft: null,
          city: null,
          state: null,
          status: null,
          url: listingUrl(row.listingId),
          available: false,
        },
    priceChanges: available
      ? l.priceChanges.map((c) => ({
          oldCents: c.oldCents,
          newCents: c.newCents,
          changedAt: c.changedAt.toISOString(),
        }))
      : [],
  };
}

/** The key owner's saved homes, newest saved first (keyset on `createdAt`, then `id`). */
export async function listSavedForKey(
  userId: string,
  q: z.infer<typeof savedQuery>,
): Promise<Page<SavedHomeV1> | 'invalid_cursor'> {
  const cur = q.cursor ? decodeSavedCursor(q.cursor) : null;
  if (q.cursor && !cur) return 'invalid_cursor';
  const where = {
    userId,
    ...(cur
      ? { OR: [{ createdAt: { lt: new Date(cur.ms) } }, { createdAt: new Date(cur.ms), id: { lt: cur.id } }] }
      : {}),
  } satisfies Prisma.HomeFavoriteWhereInput;
  const [rows, blockedIds] = await Promise.all([
    prisma.homeFavorite.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      select: savedSelect,
    }),
    getBlockedAuthorIds(userId),
  ]);
  const blocked = new Set(blockedIds);
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return {
    data: page.map((r) => toSavedHomeV1(r, blocked)),
    nextCursor: rows.length > q.limit && last ? encodeSavedCursor({ ms: last.createdAt.getTime(), id: last.id }) : null,
  };
}

/** One of the key owner's saved homes, or `null` when they have not saved it. */
export async function getSavedForKey(userId: string, listingId: string): Promise<SavedHomeV1 | null> {
  const [row, blockedIds] = await Promise.all([
    prisma.homeFavorite.findUnique({ where: { userId_listingId: { userId, listingId } }, select: savedSelect }),
    getBlockedAuthorIds(userId),
  ]);
  return row ? toSavedHomeV1(row, new Set(blockedIds)) : null;
}

export type PutResult = { ok: true; saved: SavedHomeV1 } | { ok: false; reason: 'not_found' };

/**
 * Save a listing (idempotent) and apply the note and the alert if they were sent. A listing that does not exist, that
 * a moderator removed, or whose author is blocked either way is `not_found`, the same as a missing one.
 */
export async function putSavedForKey(userId: string, listingId: string, body: PutSavedBody): Promise<PutResult> {
  const blocked = await getBlockedAuthorIds(userId);
  const visible = await prisma.homeListing.findFirst({
    where: {
      id: listingId,
      moderatedAt: null,
      OR: [{ authorId: null }, { authorId: { notIn: blocked } }],
    },
    select: { id: true },
  });
  if (!visible) return { ok: false, reason: 'not_found' };
  // The site's own save: it re-checks that the listing exists and is not moderated, and keeps an existing row as it is.
  if (!(await favorite(userId, listingId))) return { ok: false, reason: 'not_found' };
  if (body.note !== undefined) await setFavoriteNote(userId, listingId, body.note);
  if (body.priceAlerts !== undefined) await setPriceAlerts(userId, listingId, body.priceAlerts);
  const saved = await getSavedForKey(userId, listingId);
  return saved ? { ok: true, saved } : { ok: false, reason: 'not_found' };
}

/** Unsave through the site's own `unfavorite`; saving nothing is not an error. */
export async function deleteSavedForKey(userId: string, listingId: string): Promise<void> {
  await unfavorite(userId, listingId);
}

/** The key owner's saved searches, newest first, without coordinates (`lat` and `lng` are never returned). */
export async function listSearchesForKey(userId: string): Promise<SavedSearchV1[]> {
  const watches = await listWatches(userId);
  return watches.map((w) => ({
    id: w.id,
    label: w.label,
    listingType: w.listingType,
    propertyTypes: [...w.propertyTypes],
    locationLabel: w.locationLabel,
    radiusKm: w.radiusKm,
    minPriceCents: w.minPrice === null ? null : Math.round(w.minPrice * 100),
    maxPriceCents: w.maxPrice === null ? null : Math.round(w.maxPrice * 100),
    minBeds: w.minBeds,
    minBaths: w.minBaths,
    petsRequired: w.petsRequired,
    active: w.active,
    createdAt: w.createdAt,
  }));
}

/** Writes also draw on the member's own `write` budget, on top of the key's rate limit. */
export function writeBudgetExceeded(userId: string): boolean {
  return !rateLimit(userId, { ...RATE_LIMIT_POLICIES.write, prefix: 'v1-homes-write' }).allowed;
}

/** Like `readBody`, but a request with no body at all is `{}`: `PUT` with nothing to say just saves the home. */
export async function readOptionalBody<T extends z.ZodType>(request: Request, schema: T) {
  const text = await request.text().catch(() => null);
  if (text === null) return readInput(null, schema);
  if (text.trim() === '') return readInput({}, schema);
  try {
    return readInput(JSON.parse(text), schema);
  } catch {
    return readInput(null, schema);
  }
}

export { queryOf, readInput, readBody } from './request-input';
