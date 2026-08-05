/**
 * Handle allocation — the database-backed half of `lib/handle.ts`.
 *
 * Picking a handle needs to know which ones are already taken, so everything
 * here touches Prisma and must stay out of the client bundle (see
 * `lib/CLAUDE.md` §"The .server.ts rule"). The *rules* (charset, length,
 * reserved words) live in `lib/handle.ts` and are the single source of truth
 * for both halves.
 */

import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { invalidateProfileLookup } from '@/lib/profile.server';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';
import { HANDLE_MAX_LENGTH, deriveHandleBase, isValidHandle, suffixHandle } from '@/lib/handle';

/** How many `base_1234` candidates to try before falling back to a random handle. */
const SUFFIX_ATTEMPTS = 10;

async function handleTaken(handle: string): Promise<boolean> {
  const existing = await prisma.user.findUnique({ where: { handle }, select: { id: true } });
  return existing !== null;
}

/**
 * A handle nobody can have derived from a name — the last resort when a base
 * collides ten times in a row (or produces nothing usable at all).
 */
function randomHandle(): string {
  return `u${randomBytes(10).toString('hex')}`.slice(0, HANDLE_MAX_LENGTH);
}

/**
 * Generate a free handle from a name/username.
 *
 * Tries the sanitized base first (`Alice Smith` → `alice_smith`), then the
 * base with a random 4-digit suffix (`alice_smith_4821`), then a purely random
 * handle. The result always satisfies `handleSchema` and is unclaimed as of
 * the check — the unique index on `user.handle` is still the real arbiter, so
 * callers writing it should be ready to retry on a uniqueness violation.
 *
 * `alsoTaken` marks handles that are spoken for but not yet in the database —
 * the dry-run backfill uses it so a preview of three identically-named accounts
 * shows three distinct handles rather than the same one three times.
 */
export async function generateHandle(
  source: string | null | undefined,
  alsoTaken?: ReadonlySet<string>,
): Promise<string> {
  const base = deriveHandleBase(source);
  const taken = async (handle: string) =>
    Boolean(alsoTaken?.has(handle)) || (await handleTaken(handle));

  if (isValidHandle(base) && !(await taken(base))) return base;

  for (let i = 0; i < SUFFIX_ATTEMPTS; i++) {
    const candidate = suffixHandle(base);
    if (isValidHandle(candidate) && !(await taken(candidate))) return candidate;
  }

  for (let i = 0; i < SUFFIX_ATTEMPTS; i++) {
    const candidate = randomHandle();
    if (!(await taken(candidate))) return candidate;
  }

  return randomHandle();
}

export interface BackfillHandlesResult {
  /** Accounts that were missing a handle when the sweep started. */
  scanned: number;
  /** Accounts that now have one. */
  assigned: number;
  /** Accounts the sweep could not resolve (left untouched for the next run). */
  failed: number;
}

/**
 * Give every account still missing a handle one derived from its display name.
 *
 * Retroactive counterpart to the `user.create` hook in `lib/auth.ts`: accounts
 * that predate the handle column — and any bot the Go bot-worker inserted
 * before it set one — otherwise stay unmentionable forever, because
 * `/api/feed/mention-search` only offers users with a handle and `/u/<handle>`
 * has nothing to route on.
 *
 * Deleted accounts are skipped. `POST /api/account/delete` anonymizes a user
 * by nulling its handle, so handing one back out would republish a person who
 * asked to disappear — and would make the tombstone mentionable.
 *
 * Idempotent and interruption-safe: it only ever fills nulls, so a second run
 * over a healthy database touches zero rows. Production gets this once via the
 * `backfill_user_handles` migration; this is the re-runnable path for
 * development databases (which use `prisma db push`, not migrations) and for
 * stragglers.
 */
export async function backfillMissingHandles(
  options: {
    /** Rows to claim per round-trip. */
    batchSize?: number;
    /** Report what would change without writing. */
    dryRun?: boolean;
    /** Called once per account with the handle it was given. */
    onAssign?: (user: { id: string; name: string | null }, handle: string) => void;
  } = {},
): Promise<BackfillHandlesResult> {
  const { batchSize = 200, dryRun = false, onAssign } = options;

  const result: BackfillHandlesResult = { scanned: 0, assigned: 0, failed: 0 };
  // Rows we could not fill. Excluded from later pages so the "still null" query
  // doesn't hand us the same batch forever. Only failures land here, so it stays
  // small enough to pass as query parameters.
  const failed: string[] = [];
  // A dry run never writes, so the handles it "hands out" stay invisible to the
  // uniqueness check. Track them here so the preview reflects what a real run
  // would produce instead of repeating one handle for every same-named account.
  const claimed = new Set<string>();
  // A real run empties the result set as it goes, so re-querying always returns
  // fresh rows. A dry run doesn't, so it has to walk the (stable) set by offset.
  let offset = 0;

  for (;;) {
    const batch = await prisma.user.findMany({
      where: {
        handle: null,
        // Spelled out rather than `{ not: … }`: `banReason` is nullable and
        // almost every live account has it NULL, so relying on `not` to include
        // nulls would risk the whole sweep quietly matching zero rows.
        OR: [{ banReason: null }, { banReason: { not: DELETED_ACCOUNT_BAN_REASON } }],
        ...(failed.length ? { id: { notIn: failed } } : {}),
      },
      select: { id: true, name: true, username: true },
      // `id` breaks ties so the offset walk can't skip or repeat a row.
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: batchSize,
      ...(dryRun ? { skip: offset } : {}),
    });
    if (batch.length === 0) break;
    offset += batch.length;

    for (const user of batch) {
      result.scanned++;
      const handle = await generateHandle(user.username || user.name, claimed);

      if (dryRun) {
        result.assigned++;
        claimed.add(handle);
        onAssign?.(user, handle);
        continue;
      }

      try {
        await prisma.user.update({ where: { id: user.id }, data: { handle } });
        // A handle that has just started resolving must not keep 404ing for the
        // rest of the profile negative-cache window (OPT-47).
        invalidateProfileLookup(handle);
        result.assigned++;
        onAssign?.(user, handle);
      } catch {
        // Lost a race for this handle (or the row vanished). Leave the null in
        // place — the next run picks it up with a fresh candidate.
        result.failed++;
        failed.push(user.id);
      }
    }
  }

  return result;
}
