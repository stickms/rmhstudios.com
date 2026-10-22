/**
 * Case-insensitive handle -> user lookup for @mention fan-out.
 *
 * perf: this used to be `OR: handles.map(h => ({ handle: { equals: h, mode:
 * 'insensitive' } }))`, which Prisma compiles to ILIKE — nothing indexes that,
 * so every post/comment/chat with a mention seq-scanned "user". We can't
 * assume every stored handle is lowercase (legacy rows, direct writers), so
 * instead of switching to `handle IN (...)` we match `lower("handle")` against
 * the lowercased inputs, served by the btree expression index
 * `user_handle_lower_idx` (migration 20261021120000_perf_indexes).
 *
 * Also more correct than before: ILIKE treated `_` in a handle as a wildcard,
 * so `@a_b` could notify the owner of `axb`.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';

export interface HandleMatch {
  id: string;
  handle: string | null;
}

export async function findUsersByHandles(
  handles: readonly string[],
  opts: { excludeUserId?: string } = {},
): Promise<HandleMatch[]> {
  if (handles.length === 0) return [];
  const lowered = [...new Set(handles.map((h) => h.toLowerCase()))];
  const exclude = opts.excludeUserId ? Prisma.sql`AND "id" <> ${opts.excludeUserId}` : Prisma.empty;
  return prisma.$queryRaw<HandleMatch[]>(Prisma.sql`
    SELECT "id", "handle" FROM "user"
    WHERE lower("handle") = ANY(${lowered}::text[]) ${exclude}`);
}
