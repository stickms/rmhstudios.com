/**
 * Universal search — saved searches server logic (§18). CRUD + a weekly
 * new-results alert flag (the pg-boss alert sweep is a follow-up; the reverse
 * fields lastRunAt/alerts are in place).
 */
import { prisma } from '@/lib/prisma.server';
import { MAX_SAVED_SEARCHES, type SavedSearchView } from '@/lib/search/saved';

export class SavedSearchError extends Error {}

export async function listSaved(userId: string): Promise<SavedSearchView[]> {
  const rows = await prisma.savedSearch.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, query: true, types: true, alerts: true, createdAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    query: r.query,
    types: Array.isArray(r.types) ? (r.types as string[]) : [],
    alerts: r.alerts,
    createdAt: r.createdAt.toISOString(),
  }));
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
}

export async function deleteSaved(userId: string, id: string): Promise<void> {
  await prisma.savedSearch.deleteMany({ where: { id, userId } });
}
