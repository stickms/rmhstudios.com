/**
 * Member memory (M3) — the store the AI surfaces share. Server-only.
 *
 * `lib/ai/coach.server.ts`, `recap.server.ts`, `catch-up.server.ts` and
 * `lib/persona-chat.server.ts` each assemble their own idea of a member on
 * every call. This is the one they can share.
 *
 * Nothing here calls a model. A memory is written by whichever surface learned
 * something and read by all of them; the learning happens where it happens.
 */

import { prisma } from '@/lib/prisma.server';
import {
  expiryFor,
  isValidKey,
  mayOverwrite,
  namespaceOf,
  type MemoryNamespace,
  type MemorySource,
} from '@/lib/ai/memory/keys';

export interface Memory {
  key: string;
  value: string;
  source: MemorySource;
  confirmed: boolean;
  updatedAt: Date;
}

/** Rows read per surface call. Bounded — this is on a request path. */
const READ_LIMIT = 60;

/**
 * Everything currently true about a member.
 *
 * Expired rows are filtered in the QUERY rather than after, so a member with
 * two years of stale context does not push their live memories out of the
 * limit. Nothing sweeps: expiry is a read-time predicate, which means there is
 * no job to fall behind and no window where one surface saw a memory another
 * had already stopped seeing.
 */
export async function recall(
  userId: string,
  opts: { namespace?: MemoryNamespace; now?: Date } = {},
): Promise<Memory[]> {
  const now = opts.now ?? new Date();
  const rows = await prisma.memberMemory.findMany({
    where: {
      userId,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      ...(opts.namespace ? { key: { startsWith: `${opts.namespace}.` } } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: READ_LIMIT,
    select: { key: true, value: true, source: true, confirmedAt: true, updatedAt: true },
  });

  // No second expiry filter here: the query above already excludes them, and a
  // redundant one would be a no-op that reads like a safety net.
  return rows.map((r) => ({
    key: r.key,
    value: r.value,
    source: r.source as MemorySource,
    confirmed: r.confirmedAt !== null,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Render a member's memories as a prompt block.
 *
 * The reason this is here and not in each surface: five surfaces formatting
 * the same facts five ways is five chances for one of them to include
 * something it should not, and one place to fix it when that happens.
 *
 * Returns an empty string for a member with no memories, so a caller can
 * interpolate it unconditionally without producing a dangling header.
 */
export async function recallAsPrompt(userId: string, now: Date = new Date()): Promise<string> {
  const memories = await recall(userId, { now });
  if (memories.length === 0) return '';
  const lines = memories.map((m) => `- ${m.key}: ${m.value}`);
  return `What you already know about this member (they can see and edit this):\n${lines.join('\n')}`;
}

/**
 * Write one memory.
 *
 * Refuses an unknown key rather than storing it: an open key space becomes a
 * junk drawer within a month, and the failure is silent — every surface writes
 * what it likes, nothing reads what another wrote, and the shared memory is
 * five private ones again.
 *
 * Returns false when the write was refused, either for the key or because a
 * member's own correction is in the way.
 */
export async function remember(
  userId: string,
  key: string,
  value: string,
  source: MemorySource,
  now: Date = new Date(),
): Promise<boolean> {
  if (!isValidKey(key)) return false;
  const trimmed = value.trim().slice(0, 400);
  if (!trimmed) return false;

  const existing = await prisma.memberMemory.findUnique({
    where: { userId_key: { userId, key } },
    select: { source: true },
  });
  if (existing && !mayOverwrite(existing.source as MemorySource, source)) return false;

  await prisma.memberMemory.upsert({
    where: { userId_key: { userId, key } },
    create: {
      userId,
      key,
      value: trimmed,
      source,
      expiresAt: source === 'member' ? null : expiryFor(key, now),
      confirmedAt: source === 'member' ? now : null,
    },
    update: {
      value: trimmed,
      source,
      // A member's own write never expires: they said it on purpose, and
      // quietly forgetting it would be the site overruling them on a delay.
      expiresAt: source === 'member' ? null : expiryFor(key, now),
      confirmedAt: source === 'member' ? now : undefined,
    },
  });
  return true;
}

/** Strike one out. The member's half of the contract. */
export async function forget(userId: string, key: string): Promise<boolean> {
  const { count } = await prisma.memberMemory.deleteMany({ where: { userId, key } });
  return count > 0;
}

/** Strike them all out. */
export async function forgetAll(userId: string): Promise<number> {
  const { count } = await prisma.memberMemory.deleteMany({ where: { userId } });
  return count;
}

/** Namespace of a key, re-exported so callers need one import. */
export { namespaceOf };
