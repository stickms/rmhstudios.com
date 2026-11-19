/**
 * Universal search — saved searches server logic (§18). A saved search is a
 * Feed of kind 'search' (`CustomFeed`, `lib/feeds/kinds.ts`): `query` holds the
 * raw query with its operators, `types` the entity chips, and the "alerts" flag
 * is the feed's `notify`. CRUD only; nothing sweeps saved searches for new
 * results yet (keyword alerts are the push path, `lib/discovery/alerts.server.ts`).
 */
import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
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

const select = { id: true, query: true, types: true, notify: true, createdAt: true } as const;

function toView(r: {
  id: string;
  query: string | null;
  types: string[] | null;
  notify: boolean;
  createdAt: Date;
}): SavedSearchView {
  return {
    id: r.id,
    query: r.query ?? '',
    types: r.types ?? [],
    alerts: r.notify,
    createdAt: r.createdAt.toISOString(),
  };
}

export async function listSaved(userId: string): Promise<SavedSearchView[]> {
  const key = savedCacheKey(userId);
  return cached(
    key,
    SAVED_TTL_MS,
    async () => {
      const rows = await prisma.customFeed.findMany({
        where: { ownerId: userId, kind: 'search' },
        orderBy: { createdAt: 'desc' },
        select,
      });
      return rows.map(toView);
    },
    { l2: false },
  );
}

export async function createSaved(
  userId: string,
  query: string,
  types: string[] = [],
  alerts = false,
): Promise<SavedSearchView> {
  const count = await prisma.customFeed.count({ where: { ownerId: userId, kind: 'search' } });
  if (count >= MAX_SAVED_SEARCHES) throw new SavedSearchError('LIMIT');
  const row = await prisma.customFeed.create({
    data: {
      ownerId: userId,
      kind: 'search',
      name: query.slice(0, 60),
      query,
      types,
      notify: alerts,
      tags: [],
      authorIds: [],
      keywords: [],
    },
    select,
  });
  void invalidateCached(savedCacheKey(userId));
  return toView(row);
}

export async function updateSaved(userId: string, id: string, alerts: boolean): Promise<void> {
  const res = await prisma.customFeed.updateMany({
    where: { id, ownerId: userId, kind: 'search' },
    data: { notify: alerts },
  });
  if (res.count === 0) throw new SavedSearchError('NOT_FOUND');
  void invalidateCached(savedCacheKey(userId));
}

export async function deleteSaved(userId: string, id: string): Promise<void> {
  await prisma.customFeed.deleteMany({ where: { id, ownerId: userId, kind: 'search' } });
  void invalidateCached(savedCacheKey(userId));
}
