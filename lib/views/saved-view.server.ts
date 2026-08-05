/**
 * Saved views (B8) — persistence. Server-only.
 *
 * Stored on `SavedSearch`, which gained `surface`, `payload` and `name` rather
 * than getting a sibling table: the row already means "a list this person wants
 * to come back to", and search is simply the surface that had it first. Every
 * pre-existing row defaults to `surface: 'search'`, so nothing had to be
 * migrated.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { AppError } from '@/lib/errors/codes';
import {
  parseViewPayload,
  droppedKeys,
  MAX_VIEWS_PER_SURFACE,
  type ViewSurface,
  type SavedViewInput,
} from '@/lib/views/saved-view';

export interface SavedView {
  id: string;
  surface: ViewSurface;
  name: string;
  payload: Record<string, unknown>;
  alerts: boolean;
  /** Keys the surface no longer understands, so the UI can offer a re-save. */
  stale: string[];
  createdAt: Date;
}

function toView(row: {
  id: string;
  surface: string;
  name: string | null;
  query: string;
  payload: unknown;
  alerts: boolean;
  createdAt: Date;
}): SavedView {
  const surface = row.surface as ViewSurface;
  return {
    id: row.id,
    surface,
    // Pre-B8 rows have no name — fall back to the query text they were saved
    // under, which is what the search page displayed for them anyway.
    name: row.name ?? row.query,
    payload: parseViewPayload(surface, row.payload) as Record<string, unknown>,
    alerts: row.alerts,
    stale: droppedKeys(surface, row.payload),
    createdAt: row.createdAt,
  };
}

export async function listSavedViews(userId: string, surface?: ViewSurface): Promise<SavedView[]> {
  const rows = await prisma.savedSearch.findMany({
    where: { userId, ...(surface ? { surface } : {}) },
    orderBy: { createdAt: 'desc' },
    take: MAX_VIEWS_PER_SURFACE * 5,
  });
  return rows.map(toView);
}

export async function createSavedView(userId: string, input: SavedViewInput): Promise<SavedView> {
  const existing = await prisma.savedSearch.count({
    where: { userId, surface: input.surface },
  });
  if (existing >= MAX_VIEWS_PER_SURFACE) {
    throw new AppError('QUOTA_EXCEEDED', { limit: MAX_VIEWS_PER_SURFACE });
  }

  // Normalised before storage as well as on read: there is no reason to persist
  // a key the surface never declared, and doing so would make `stale` report a
  // key the user could not have set.
  const payload = parseViewPayload(input.surface, input.payload) as Record<string, unknown>;

  const row = await prisma.savedSearch.create({
    data: {
      userId,
      surface: input.surface,
      name: input.name,
      // Cast at the boundary: Prisma's InputJsonValue does not accept a bare
      // `Record<string, unknown>`, but the value has just been through the
      // surface's own zod schema, so every key is JSON-safe by construction.
      payload: payload as Prisma.InputJsonValue,
      alerts: input.alerts ?? false,
      // `query` is non-null and predates this feature. For a non-search surface
      // there is no query text, so it holds the name — which is also what the
      // pre-B8 rows meant by it.
      query: input.surface === 'search' ? String(input.payload.q ?? '') : input.name,
    },
  });
  return toView(row);
}

export async function deleteSavedView(userId: string, id: string): Promise<void> {
  // Scoped by userId in the WHERE rather than checked after the read: an
  // ownership check that happens after a findUnique is a check someone
  // eventually forgets to write.
  const { count } = await prisma.savedSearch.deleteMany({ where: { id, userId } });
  if (count === 0) throw new AppError('NOT_FOUND');
}

export async function renameSavedView(userId: string, id: string, name: string): Promise<void> {
  const { count } = await prisma.savedSearch.updateMany({
    where: { id, userId },
    data: { name: name.trim().slice(0, 60) },
  });
  if (count === 0) throw new AppError('NOT_FOUND');
}
