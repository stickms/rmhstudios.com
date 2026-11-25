/**
 * RMHHomes — the member's saved homes for the data export (s12 10): each saved listing with the member's own note,
 * their price-drop alert setting and when they saved it. Only the member's own favourite rows are read.
 */
import { prisma } from '@/lib/prisma.server';

/** Most rows the export carries (the Saved tab itself lists the newest 500). */
const EXPORT_LIMIT = 5000;

export async function exportSavedHomes(userId: string): Promise<
  Array<{
    listingId: string;
    savedAt: string;
    note: string | null;
    priceAlerts: boolean;
    title: string | null;
    city: string | null;
    state: string | null;
    price: number | null;
    listingType: string | null;
    status: string | null;
  }>
> {
  const rows = await prisma.homeFavorite.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: EXPORT_LIMIT,
    select: {
      listingId: true,
      createdAt: true,
      note: true,
      priceAlerts: true,
      listing: { select: { title: true, city: true, state: true, priceCents: true, listingType: true, status: true } },
    },
  });
  return rows.map((r) => ({
    listingId: r.listingId,
    savedAt: r.createdAt.toISOString(),
    note: r.note ?? null,
    priceAlerts: r.priceAlerts,
    title: r.listing?.title ?? null,
    city: r.listing?.city ?? null,
    state: r.listing?.state ?? null,
    price: r.listing ? Math.round(r.listing.priceCents) / 100 : null,
    listingType: r.listing?.listingType ?? null,
    status: r.listing?.status ?? null,
  }));
}
