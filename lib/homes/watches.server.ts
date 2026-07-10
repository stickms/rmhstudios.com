/**
 * RMHHomes — listing watches / alerts (server only).
 *
 * A watch stores browse criteria; when a new listing is posted that matches,
 * the owner gets an in-app notification (best-effort, like every other
 * notification). CRUD for the manage page lives here too.
 */

import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { haversineKm } from './geo.server';
import type { Watch, WatchInput } from './types';
import type { Prisma, HomeListing } from '@prisma/client';

const MAX_WATCHES = 50;

function toDTO(row: {
  id: string;
  label: string;
  listingType: 'RENT' | 'SALE' | null;
  propertyTypes: string[];
  locationLabel: string | null;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  minPriceCents: number | null;
  maxPriceCents: number | null;
  minBeds: number | null;
  minBaths: number | null;
  petsRequired: boolean;
  active: boolean;
  createdAt: Date;
}): Watch {
  return {
    id: row.id,
    label: row.label,
    listingType: row.listingType,
    propertyTypes: row.propertyTypes as Watch['propertyTypes'],
    locationLabel: row.locationLabel,
    lat: row.lat,
    lng: row.lng,
    radiusKm: row.radiusKm,
    minPrice: row.minPriceCents != null ? row.minPriceCents / 100 : null,
    maxPrice: row.maxPriceCents != null ? row.maxPriceCents / 100 : null,
    minBeds: row.minBeds,
    minBaths: row.minBaths,
    petsRequired: row.petsRequired,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listWatches(userId: string): Promise<Watch[]> {
  const rows = await prisma.homeWatch.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_WATCHES,
  });
  return rows.map(toDTO);
}

export async function createWatch(
  userId: string,
  input: WatchInput,
): Promise<{ ok: boolean; error?: string; watch?: Watch }> {
  const count = await prisma.homeWatch.count({ where: { userId } });
  if (count >= MAX_WATCHES) {
    return { ok: false, error: 'You have reached the maximum number of watches.' };
  }
  const data: Prisma.HomeWatchUncheckedCreateInput = {
    userId,
    label: input.label.trim().slice(0, 120) || 'Watch',
    listingType: input.listingType ?? null,
    propertyTypes: input.propertyTypes.slice(0, 6),
    locationLabel: input.locationLabel?.slice(0, 200) || null,
    lat: input.lat ?? null,
    lng: input.lng ?? null,
    radiusKm:
      input.radiusKm != null ? Math.min(500, Math.max(1, Math.round(input.radiusKm))) : null,
    minPriceCents: input.minPrice != null ? Math.round(input.minPrice * 100) : null,
    maxPriceCents: input.maxPrice != null ? Math.round(input.maxPrice * 100) : null,
    minBeds: input.minBeds ?? null,
    minBaths: input.minBaths ?? null,
    petsRequired: Boolean(input.petsRequired),
  };
  const row = await prisma.homeWatch.create({ data });
  return { ok: true, watch: toDTO(row) };
}

export async function setWatchActive(userId: string, id: string, active: boolean): Promise<void> {
  await prisma.homeWatch.updateMany({ where: { id, userId }, data: { active } });
}

export async function deleteWatch(userId: string, id: string): Promise<void> {
  await prisma.homeWatch.deleteMany({ where: { id, userId } });
}

/** Does `listing` satisfy every criterion set on `watch`? */
function matches(
  watch: {
    listingType: 'RENT' | 'SALE' | null;
    propertyTypes: string[];
    lat: number | null;
    lng: number | null;
    radiusKm: number | null;
    minPriceCents: number | null;
    maxPriceCents: number | null;
    minBeds: number | null;
    minBaths: number | null;
    petsRequired: boolean;
  },
  listing: HomeListing,
): boolean {
  if (watch.listingType && listing.listingType !== watch.listingType) return false;
  if (watch.propertyTypes.length && !watch.propertyTypes.includes(listing.propertyType))
    return false;
  if (watch.minPriceCents != null && listing.priceCents < watch.minPriceCents) return false;
  if (watch.maxPriceCents != null && listing.priceCents > watch.maxPriceCents) return false;
  if (watch.minBeds != null && listing.beds < watch.minBeds) return false;
  if (watch.minBaths != null && listing.baths < watch.minBaths) return false;
  if (watch.petsRequired && !listing.petsAllowed) return false;
  if (watch.lat != null && watch.lng != null && watch.radiusKm != null) {
    const d = haversineKm(
      { lat: watch.lat, lng: watch.lng },
      { lat: listing.lat, lng: listing.lng },
    );
    if (d > watch.radiusKm) return false;
  }
  return true;
}

/**
 * After a listing is created, notify the owners of every active watch it
 * matches (excluding the poster). Best-effort and fire-and-forget: never throws.
 */
export async function notifyWatchersOfNewListing(listingId: string): Promise<void> {
  try {
    const listing = await prisma.homeListing.findUnique({ where: { id: listingId } });
    if (!listing || listing.status !== 'ACTIVE') return;

    // Bounded scan of active watches from other users. The `active` index keeps
    // this cheap; matching is done in memory since criteria are heterogeneous.
    const watches = await prisma.homeWatch.findMany({
      where: { active: true, userId: { not: listing.authorId } },
      take: 2000,
    });

    const priceDollars = Math.round(listing.priceCents / 100).toLocaleString('en-US');
    const kind = listing.listingType === 'RENT' ? 'rental' : 'home for sale';

    const toNotify = watches.filter((w) => matches(w, listing));
    for (const w of toNotify) {
      await createNotification({
        userId: w.userId,
        actorId: listing.authorId,
        type: 'SYSTEM',
        entityType: 'home_listing',
        entityId: listing.id,
        preview: `New ${kind} matching “${w.label}”: ${listing.title} — $${priceDollars} in ${listing.city}, ${listing.state}`,
        link: `/homes/listing/${listing.id}`,
      });
    }
    if (toNotify.length) {
      await prisma.homeWatch.updateMany({
        where: { id: { in: toNotify.map((w) => w.id) } },
        data: { lastNotifiedAt: new Date() },
      });
    }
  } catch (err) {
    console.error('notifyWatchersOfNewListing failed:', err);
  }
}
