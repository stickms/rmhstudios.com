/**
 * RMHHomes — listings service (server only).
 *
 * DB-backed CRUD + browse/search for the community housing marketplace. Every
 * listing is a real `HomeListing` row owned by its author. No external
 * providers, scraping, or generated data.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { resolveCenter, haversineKm } from './geo.server';
import { notifyWatchersOfNewListing } from './watches.server';
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

/** Map a DB row (+ viewer context) to the client Listing DTO. */
function toDTO(row: ListingRow, viewerId: string | null): Listing {
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
  };
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

  const where: Prisma.HomeListingWhereInput = { status: 'ACTIVE' };
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
  const listings = matched.slice(start, start + pageSize).map((r) => toDTO(r, viewerId));

  return { listings, total, page, pageSize, center };
}

/** Fetch a single listing (any status) and increment its view count. */
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

  // Count a view unless the owner is looking at their own listing.
  if (countView && viewerId !== row.authorId) {
    prisma.homeListing
      .update({ where: { id }, data: { viewsCount: { increment: 1 } } })
      .catch(() => {});
  }
  return toDTO(row, viewerId);
}

function toCreateData(input: ListingInput): Prisma.HomeListingUncheckedCreateInput {
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
    images: input.images.slice(0, 12),
    // Only flag AI images that are actually among the stored photos.
    aiImages: input.aiImages.filter((u) => input.images.includes(u)).slice(0, 12),
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
export async function updateListing(
  id: string,
  authorId: string,
  input: ListingInput,
): Promise<boolean> {
  const data = toCreateData(input);
  const { authorId: _drop, ...rest } = data;
  void _drop;
  const res = await prisma.homeListing.updateMany({
    where: { id, authorId },
    data: rest,
  });
  return res.count > 0;
}

export async function setListingStatus(
  id: string,
  authorId: string,
  status: ListingStatus,
): Promise<boolean> {
  const res = await prisma.homeListing.updateMany({ where: { id, authorId }, data: { status } });
  return res.count > 0;
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
  return rows.map((r) => toDTO(r, authorId));
}

// ─── Favorites ───────────────────────────────────────────────────────────────

export async function listFavorites(userId: string): Promise<Listing[]> {
  const favs = await prisma.homeFavorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 500,
    include: { listing: { include: includeFor(userId) } },
  });
  return favs.filter((f) => f.listing).map((f) => toDTO(f.listing as ListingRow, userId));
}

export async function favorite(userId: string, listingId: string): Promise<boolean> {
  const exists = await prisma.homeListing.findUnique({
    where: { id: listingId },
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
