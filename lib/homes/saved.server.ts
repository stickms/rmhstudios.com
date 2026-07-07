/**
 * RMHHomes — saved listings & saved searches (server only).
 *
 * Users can favorite individual listings (we store a full snapshot so the card
 * still renders even after the upstream post expires) and save searches (the
 * serialized filter query) to re-run or subscribe to.
 */

import { prisma } from '@/lib/prisma.server';
import type { Prisma } from '@prisma/client';
import type { Listing } from './types';

const MAX_SAVED_LISTINGS = 500;
const MAX_SAVED_SEARCHES = 100;

export interface SavedListingRecord {
  id: string;
  listingId: string;
  listing: Listing;
  notes: string | null;
  createdAt: string;
}

export interface SavedSearchRecord {
  id: string;
  name: string;
  query: string;
  location: string;
  alertsEnabled: boolean;
  createdAt: string;
}

// ─── Saved listings ────────────────────────────────────────────────────────

export async function listSavedListings(userId: string): Promise<SavedListingRecord[]> {
  const rows = await prisma.homeSavedListing.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_SAVED_LISTINGS,
  });
  return rows.map((r) => ({
    id: r.id,
    listingId: r.listingId,
    listing: r.snapshot as unknown as Listing,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }));
}

/** Return the set of listing ids the user has saved (for cheap "is saved" UI). */
export async function savedListingIds(userId: string): Promise<string[]> {
  const rows = await prisma.homeSavedListing.findMany({
    where: { userId },
    select: { listingId: true },
    take: MAX_SAVED_LISTINGS,
  });
  return rows.map((r) => r.listingId);
}

export async function saveListing(
  userId: string,
  listing: Listing,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> {
  const count = await prisma.homeSavedListing.count({ where: { userId } });
  const exists = await prisma.homeSavedListing.findUnique({
    where: { userId_listingId: { userId, listingId: listing.id } },
    select: { id: true },
  });
  if (!exists && count >= MAX_SAVED_LISTINGS) {
    return { ok: false, error: 'Saved-listings limit reached' };
  }

  await prisma.homeSavedListing.upsert({
    where: { userId_listingId: { userId, listingId: listing.id } },
    create: {
      userId,
      listingId: listing.id,
      source: listing.source,
      snapshot: listing as unknown as Prisma.InputJsonValue,
      notes: notes?.slice(0, 500) || null,
    },
    update: {
      snapshot: listing as unknown as Prisma.InputJsonValue,
      ...(notes !== undefined ? { notes: notes.slice(0, 500) || null } : {}),
    },
  });
  return { ok: true };
}

export async function unsaveListing(userId: string, listingId: string): Promise<void> {
  await prisma.homeSavedListing.deleteMany({ where: { userId, listingId } });
}

// ─── Saved searches ──────────────────────────────────────────────────────────

export async function listSavedSearches(userId: string): Promise<SavedSearchRecord[]> {
  const rows = await prisma.homeSavedSearch.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: MAX_SAVED_SEARCHES,
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    query: r.query,
    location: r.location,
    alertsEnabled: r.alertsEnabled,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function saveSearch(
  userId: string,
  input: { name: string; query: string; location: string; alertsEnabled?: boolean },
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const count = await prisma.homeSavedSearch.count({ where: { userId } });
  if (count >= MAX_SAVED_SEARCHES) {
    return { ok: false, error: 'Saved-searches limit reached' };
  }
  const row = await prisma.homeSavedSearch.create({
    data: {
      userId,
      name: input.name.trim().slice(0, 80) || 'Saved search',
      query: input.query.slice(0, 500),
      location: input.location.slice(0, 200),
      alertsEnabled: Boolean(input.alertsEnabled),
    },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export async function deleteSavedSearch(userId: string, id: string): Promise<void> {
  await prisma.homeSavedSearch.deleteMany({ where: { id, userId } });
}

export async function setSearchAlerts(userId: string, id: string, enabled: boolean): Promise<void> {
  await prisma.homeSavedSearch.updateMany({
    where: { id, userId },
    data: { alertsEnabled: enabled },
  });
}
