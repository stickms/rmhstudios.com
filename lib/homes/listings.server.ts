/**
 * RMHHomes — listings service (server only).
 *
 * DB-backed CRUD + browse/search for the community housing marketplace. Every
 * listing is a real `HomeListing` row owned by its author. No external
 * providers, scraping, or generated data.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveCenter } from './geo.server';
import { haversineKm } from './distance';
import { notifyWatchersOfNewListing } from './watches.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { reducedSince } from './prices';
import { normalizeAlts } from './photos';
import { lastChangesFor, notifyFavouritersOfDrop, recordPriceChange, reductionsFor } from './prices.server';
import { MAX_COMPARE, normalizeNote } from './compare';
import type { PriceChange } from './prices';
import type {
  Listing,
  ListingInput,
  ListingStatus,
  SearchCenter,
  SearchFilters,
  SearchResponse,
} from './types';

/** How many candidate rows we pull before in-memory radius filtering. */
const CANDIDATE_LIMIT = 1000;

const authorSelect = {
  id: true,
  name: true,
  image: true,
  handle: true,
  username: true,
} satisfies Prisma.UserSelect;

type ListingRow = Prisma.HomeListingGetPayload<{
  include: { author: { select: typeof authorSelect }; favorites: true };
}>;

function myFavorite(row: ListingRow, viewerId: string) {
  return row.favorites.find((f) => f.userId === viewerId);
}

/** Map a DB row (+ viewer context) to the client Listing DTO. */
function toDTO(row: ListingRow, viewerId: string | null, reducedBy: number | null = null): Listing {
  return {
    id: row.id,
    source: row.source,
    status: row.status,
    listingType: row.listingType,
    propertyType: row.propertyType,
    title: row.title,
    description: row.description,
    price: Math.round(row.priceCents) / 100,
    beds: row.beds,
    baths: row.baths,
    sqft: row.sqft,
    address: row.address,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    lat: row.lat,
    lng: row.lng,
    amenities: row.amenities,
    petsAllowed: row.petsAllowed,
    availableFrom: row.availableFrom ? row.availableFrom.toISOString() : null,
    images: row.images,
    aiImages: row.aiImages,
    imageAlts: normalizeAlts(row.images, row.imageAlts),
    viewsCount: row.viewsCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    author: row.author
      ? {
          id: row.author.id,
          name: row.author.name,
          handle: row.author.handle ?? row.author.username ?? null,
          image: row.author.image,
        }
      : null,
    externalUrl: row.externalUrl,
    sourceName: row.sourceName,
    favorited: viewerId ? row.favorites.some((f) => f.userId === viewerId) : false,
    isOwner: viewerId != null && viewerId === row.authorId,
    // s12-16: only the author is told a moderator removed it (everyone else gets a 404 before this runs).
    ...(row.moderatedAt && viewerId != null && viewerId === row.authorId ? { removedByModerator: true } : {}),
    ...(reducedBy != null ? { reducedByCents: reducedBy } : {}),
    ...(viewerId ? { priceAlerts: row.favorites.find((f) => f.userId === viewerId)?.priceAlerts ?? true } : {}),
    // The viewer's own private note, from their own favourite row only (`includeFor` never loads anyone else's).
    ...(viewerId && myFavorite(row, viewerId) ? { note: myFavorite(row, viewerId)?.note ?? null } : {}),
  };
}

/** Map rows to DTOs, adding "Reduced" for the page with one read (`reductionsFor`). */
async function toDTOs(rows: ListingRow[], viewerId: string | null): Promise<Listing[]> {
  const reductions = await reductionsFor(rows);
  return rows.map((r) => toDTO(r, viewerId, reductions.get(r.id) ?? null));
}

function includeFor(viewerId: string | null) {
  return {
    author: { select: authorSelect },
    favorites: viewerId ? { where: { userId: viewerId } } : { where: { userId: '' } },
  } satisfies Prisma.HomeListingInclude;
}

/** Degrees of latitude per km (longitude scaled by cos(lat) at call site). */
const KM_PER_DEG_LAT = 111.32;

function boundingBox(center: SearchCenter, radiusKm: number) {
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const dLng = radiusKm / (KM_PER_DEG_LAT * Math.max(0.01, Math.cos((center.lat * Math.PI) / 180)));
  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}

/** Browse/search active listings. */
export async function browseListings(
  filters: SearchFilters,
  viewerId: string | null,
): Promise<SearchResponse> {
  // Resolve a center if the caller supplied coords or a location string.
  let center: SearchCenter | null = null;
  if (filters.lat != null && filters.lng != null) {
    center = { lat: filters.lat, lng: filters.lng, label: filters.location || 'Selected area' };
  } else if (filters.location.trim()) {
    center = await resolveCenter(filters.location);
  }

  // s12-16 member-reports: a listing a moderator removed is never browsed (its status is REMOVED too).
  const where: Prisma.HomeListingWhereInput = { status: 'ACTIVE', moderatedAt: null };
  if (filters.listingType !== 'any') where.listingType = filters.listingType;
  if (filters.source === 'community') where.source = 'COMMUNITY';
  else if (filters.source === 'external') where.source = 'EXTERNAL';
  if (filters.propertyTypes.length) where.propertyType = { in: filters.propertyTypes };
  if (filters.minPrice != null || filters.maxPrice != null) {
    const pc: Prisma.IntFilter = {};
    if (filters.minPrice != null) pc.gte = Math.round(filters.minPrice * 100);
    if (filters.maxPrice != null) pc.lte = Math.round(filters.maxPrice * 100);
    where.priceCents = pc;
  }
  if (filters.minBeds != null) where.beds = { gte: filters.minBeds };
  if (filters.minBaths != null) where.baths = { gte: filters.minBaths };
  if (filters.petsAllowed) where.petsAllowed = true;
  if (filters.reduced) where.priceDroppedAt = { gte: reducedSince(new Date()) };

  if (center) {
    const box = boundingBox(center, filters.radiusKm);
    where.lat = { gte: box.minLat, lte: box.maxLat };
    where.lng = { gte: box.minLng, lte: box.maxLng };
  }

  const orderBy: Prisma.HomeListingOrderByWithRelationInput =
    filters.sort === 'price_asc'
      ? { priceCents: 'asc' }
      : filters.sort === 'price_desc'
        ? { priceCents: 'desc' }
        : { createdAt: 'desc' };

  const rows = await prisma.homeListing.findMany({
    where,
    orderBy,
    take: CANDIDATE_LIMIT,
    include: includeFor(viewerId),
  });

  // Refine the bounding box to a true circle when we have a center.
  let matched = rows;
  if (center) {
    const c = center;
    matched = rows.filter((r) => haversineKm({ lat: r.lat, lng: r.lng }, c) <= filters.radiusKm);
  }

  const total = matched.length;
  const pageSize = Math.min(Math.max(filters.pageSize, 1), 60);
  const page = Math.max(1, filters.page);
  const start = (page - 1) * pageSize;
  const listings = await toDTOs(matched.slice(start, start + pageSize), viewerId);

  return { listings, total, page, pageSize, center };
}

/**
 * Fetch a single listing (any status) and increment its view count. A listing a moderator removed (s12-16) is a
 * miss for everyone but its author.
 */
export async function getListing(
  id: string,
  viewerId: string | null,
  countView = true,
): Promise<Listing | null> {
  const row = await prisma.homeListing.findUnique({
    where: { id },
    include: includeFor(viewerId),
  });
  if (!row) return null;
  if (row.moderatedAt && viewerId !== row.authorId) return null;

  // Count a view unless the owner is looking at their own listing.
  if (countView && viewerId !== row.authorId) {
    prisma.homeListing
      .update({ where: { id }, data: { viewsCount: { increment: 1 } } })
      .catch(() => {});
  }
  return (await toDTOs([row], viewerId))[0] ?? null;
}

export function toCreateData(input: ListingInput): Prisma.HomeListingUncheckedCreateInput {
  const images = input.images.slice(0, 12);
  return {
    authorId: '', // set by caller
    listingType: input.listingType,
    propertyType: input.propertyType,
    title: input.title.trim().slice(0, 120),
    description: input.description.trim().slice(0, 4000),
    priceCents: Math.round(Math.max(0, input.price) * 100),
    beds: Math.max(0, Math.round(input.beds)),
    baths: Math.max(0, input.baths),
    sqft: input.sqft != null && input.sqft > 0 ? Math.round(input.sqft) : null,
    address: input.address?.trim().slice(0, 300) || null,
    city: input.city.trim().slice(0, 120),
    state: input.state.trim().slice(0, 64),
    postalCode: input.postalCode?.trim().slice(0, 16) || null,
    lat: input.lat,
    lng: input.lng,
    amenities: input.amenities.slice(0, 40).map((a) => a.slice(0, 60)),
    petsAllowed: Boolean(input.petsAllowed),
    availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
    images,
    // One description per stored photo, whatever length the caller sent.
    imageAlts: normalizeAlts(images, input.imageAlts),
    // Only flag AI images that are actually among the stored photos.
    aiImages: input.aiImages.filter((u) => images.includes(u)).slice(0, 12),
  };
}

export async function createListing(
  authorId: string,
  input: ListingInput,
): Promise<{ id: string }> {
  const data = toCreateData(input);
  data.authorId = authorId;
  const row = await prisma.homeListing.create({ data, select: { id: true } });
  // Notify anyone whose watch matches this new listing (fire-and-forget).
  void notifyWatchersOfNewListing(row.id);
  return row;
}

/** Update a listing the caller owns. Returns false if not found/owned. */
/** Descriptions for `images` taken from the same URLs in the stored photos (a repeated URL uses each stored one once). */
export function carryAlts(images: readonly string[], oldImages: readonly string[], oldAlts: readonly string[]): string[] {
  const used = new Set<number>();
  return normalizeAlts(
    images,
    images.map((url) => {
      const at = oldImages.findIndex((u, i) => u === url && !used.has(i));
      if (at < 0) return '';
      used.add(at);
      return oldAlts[at] ?? '';
    }),
  );
}

/** The author of a listing, or `null` for a missing one or a scraped listing (no author). */
export async function listingAuthorId(id: string): Promise<string | null> {
  const row = await prisma.homeListing.findUnique({ where: { id }, select: { authorId: true } });
  return row?.authorId ?? null;
}

export async function updateListing(
  id: string,
  authorId: string,
  input: ListingInput,
): Promise<boolean> {
  const data = toCreateData(input);
  const { authorId: _drop, ...rest } = data;
  void _drop;
  // Read the old price, write the edit and record the change in one transaction (under a per-listing lock, so
  // two edits cannot both compare against the same old price). Notices go out after it commits.
  const outcome = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `home-price:${id}`);
    const before = await tx.homeListing.findFirst({
      where: { id, authorId },
      select: { priceCents: true, images: true, imageAlts: true },
    });
    if (!before) return null;
    // An edit that sends photos without descriptions (an older client) keeps each photo's own description, matched by
    // URL, instead of blanking them or sliding them onto the wrong photo.
    const data =
      input.imageAlts === undefined
        ? { ...rest, imageAlts: carryAlts(rest.images as string[], before.images, before.imageAlts) }
        : rest;
    await tx.homeListing.updateMany({ where: { id, authorId }, data });
    const change = await recordPriceChange(tx, {
      listingId: id,
      oldCents: before.priceCents,
      newCents: rest.priceCents,
      source: 'author',
    });
    return { dropped: change.dropped, oldCents: before.priceCents, newCents: rest.priceCents };
  });
  if (!outcome) return false;
  if (outcome.dropped) {
    void notifyFavouritersOfDrop({
      listingId: id,
      authorId,
      title: rest.title,
      city: rest.city,
      state: rest.state,
      oldCents: outcome.oldCents,
      newCents: outcome.newCents,
    });
  }
  return true;
}

/**
 * The author's status change. While a moderator's removal stands (`moderatedAt` set) only `REMOVED` is accepted, so
 * "active", "rented" or "sold" answer `'moderated'` (s12-16); the condition is part of the one conditional write.
 */
export async function setListingStatus(
  id: string,
  authorId: string,
  status: ListingStatus,
): Promise<boolean | 'moderated'> {
  const res = await prisma.homeListing.updateMany({
    where: { id, authorId, ...(status === 'REMOVED' ? {} : { moderatedAt: null }) },
    data: { status },
  });
  if (res.count > 0) return true;
  if (status !== 'REMOVED') {
    const removed = await prisma.homeListing.findFirst({
      where: { id, authorId, moderatedAt: { not: null } },
      select: { id: true },
    });
    if (removed) return 'moderated';
  }
  return false;
}

// s12-16 member-reports
/**
 * A moderator's takedown of a reported community listing: status REMOVED and `moderatedAt` stamped, so the author
 * cannot reactivate it. A scraped listing has no member author and is not touched. Idempotent. Returns whether this
 * call did it.
 */
export async function moderateListing(listingId: string, now: Date = new Date()): Promise<boolean> {
  const done = await prisma.homeListing.updateMany({
    where: { id: listingId, source: 'COMMUNITY', moderatedAt: null },
    data: { moderatedAt: now, status: 'REMOVED' },
  });
  return done.count === 1;
}

/**
 * The author of a listing a member may report: a community listing with an author that has not already been taken
 * down. A scraped listing (no member author) and anything else is `null`.
 */
export async function listingReportAuthor(listingId: string): Promise<string | null> {
  const row = await prisma.homeListing.findUnique({
    where: { id: listingId },
    select: { authorId: true, source: true, moderatedAt: true },
  });
  return row && row.source === 'COMMUNITY' && !row.moderatedAt ? row.authorId : null;
}

/** Listing titles, for an admin reading a report (whatever the listing's state). */
export async function listingReportTitles(ids: readonly string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.homeListing.findMany({
    where: { id: { in: [...ids] } },
    select: { id: true, title: true },
  });
  return new Map(rows.map((r) => [r.id, r.title]));
}

export async function deleteListing(id: string, authorId: string): Promise<boolean> {
  const res = await prisma.homeListing.deleteMany({ where: { id, authorId } });
  return res.count > 0;
}

/** The caller's own listings (any status), newest first. */
export async function listMine(authorId: string): Promise<Listing[]> {
  const rows = await prisma.homeListing.findMany({
    where: { authorId },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: includeFor(authorId),
  });
  return toDTOs(rows, authorId);
}

// ─── Favorites ───────────────────────────────────────────────────────────────

export async function listFavorites(userId: string): Promise<Listing[]> {
  const favs = await prisma.homeFavorite.findMany({
    // A listing a moderator removed (s12-16) drops out of everyone's saved list.
    where: { userId, listing: { moderatedAt: null } },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { listing: { include: includeFor(userId) } },
  });
  return toDTOs(
    favs.filter((f) => f.listing).map((f) => f.listing as ListingRow),
    userId,
  );
}

export async function favorite(userId: string, listingId: string): Promise<boolean> {
  const exists = await prisma.homeListing.findUnique({
    where: { id: listingId, moderatedAt: null },
    select: { id: true },
  });
  if (!exists) return false;
  await prisma.homeFavorite.upsert({
    where: { userId_listingId: { userId, listingId } },
    create: { userId, listingId },
    update: {},
  });
  return true;
}

export async function unfavorite(userId: string, listingId: string): Promise<void> {
  await prisma.homeFavorite.deleteMany({ where: { userId, listingId } });
}

/**
 * Write the caller's private note on a listing they saved (`null` or an empty note clears it). False when they have
 * not saved it. The `where` names the caller, so one member cannot write another's note.
 */
export async function setFavoriteNote(userId: string, listingId: string, note: string | null): Promise<boolean> {
  const res = await prisma.homeFavorite.updateMany({
    where: { userId, listingId },
    data: { note: note == null ? null : normalizeNote(note) },
  });
  return res.count > 0;
}

export interface FavoriteComparison {
  listings: Listing[];
  notes: Record<string, string | null>;
  changes: Record<string, PriceChange | null>;
  /** Distinct ids asked for that are not in the caller's saved homes. */
  missing: number;
}

/**
 * Up to four of the caller's saved listings, in the order asked, with their notes and last price change. The saved-by-
 * caller filter is in the query (`userId`), so an id that is not theirs never loads.
 */
export async function compareFavorites(userId: string, ids: readonly string[]): Promise<FavoriteComparison> {
  const wanted = [...new Set(ids)].slice(0, MAX_COMPARE);
  if (wanted.length === 0) return { listings: [], notes: {}, changes: {}, missing: 0 };
  const favs = await prisma.homeFavorite.findMany({
    where: { userId, listingId: { in: wanted }, listing: { moderatedAt: null } },
    take: MAX_COMPARE,
    include: { listing: { include: includeFor(userId) } },
  });
  const byId = new Map(favs.filter((f) => f.listing).map((f) => [f.listingId, f] as const));
  const found = wanted.filter((id) => byId.has(id));
  const rows = found.map((id) => byId.get(id)!.listing as ListingRow);
  const listings = await toDTOs(rows, userId);
  const notes: Record<string, string | null> = {};
  for (const id of found) notes[id] = byId.get(id)?.note ?? null;
  const changes = await lastChangesFor(found);
  return {
    listings,
    notes,
    changes: Object.fromEntries(found.map((id) => [id, changes.get(id) ?? null])),
    missing: wanted.length - found.length,
  };
}
