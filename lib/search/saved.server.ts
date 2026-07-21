/**
 * Universal search — saved searches server logic (§18). CRUD + a weekly
 * new-results alert flag (the pg-boss alert sweep is a follow-up; the reverse
 * fields lastRunAt/alerts are in place).
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { MAX_SAVED_SEARCHES, type SavedSearchView } from '@/lib/search/saved';

export class SavedSearchError extends Error {}

// The search page re-fetches a user's saved searches on every mount (and every
// remount as they navigate back to it), each time re-running the same
// findMany. The list only changes when the same user saves/edits/deletes one,
// so a short per-user TTL cache absorbs those repeated reads without ever
// serving another user's rows or going stale past a mutation. Keyed by userId
// (a delimiter after the prefix avoids one user's id being a prefix of
// another's) and invalidated by every write below.
const SAVED_TTL_MS = 30_000;
const savedCacheKey = (userId: string) => `saved-search:list:${userId}`;

export async function listSaved(userId: string): Promise<SavedSearchView[]> {
  const key = savedCacheKey(userId);
  const cached = apiCache.get<SavedSearchView[]>(key);
  if (cached) return cached;

  const rows = await prisma.savedSearch.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, query: true, types: true, alerts: true, createdAt: true },
  });
  const views = rows.map((r) => ({
    id: r.id,
    query: r.query,
    types: Array.isArray(r.types) ? (r.types as string[]) : [],
    alerts: r.alerts,
    createdAt: r.createdAt.toISOString(),
  }));
  apiCache.set(key, views, SAVED_TTL_MS);
  return views;
}

export async function createSaved(
  userId: string,
  query: string,
  types: string[] = [],
  alerts = false,
): Promise<SavedSearchView> {
  const count = await prisma.savedSearch.count({ where: { userId } });
  if (count >= MAX_SAVED_SEARCHES) throw new SavedSearchError('LIMIT');
  const row = await prisma.savedSearch.create({
    data: { userId, query, types, alerts },
    select: { id: true, query: true, types: true, alerts: true, createdAt: true },
  });
  apiCache.invalidate(savedCacheKey(userId));
  return {
    id: row.id,
    query: row.query,
    types: Array.isArray(row.types) ? (row.types as string[]) : [],
    alerts: row.alerts,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function updateSaved(userId: string, id: string, alerts: boolean): Promise<void> {
  const res = await prisma.savedSearch.updateMany({ where: { id, userId }, data: { alerts } });
  if (res.count === 0) throw new SavedSearchError('NOT_FOUND');
  apiCache.invalidate(savedCacheKey(userId));
}

export async function deleteSaved(userId: string, id: string): Promise<void> {
  await prisma.savedSearch.deleteMany({ where: { id, userId } });
  apiCache.invalidate(savedCacheKey(userId));
}
