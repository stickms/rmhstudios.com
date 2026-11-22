/**
 * One transaction-scoped Postgres advisory lock, keyed by a string.
 *
 * A check-then-write rule ("at most N rows", "one pending offer", "one seat
 * left") is only a rule if two requests cannot both pass the check before either
 * writes. Take the lock first, inside the transaction that checks and writes:
 * `pg_advisory_xact_lock` blocks a second holder of the same key until the first
 * transaction ends, and releases itself on commit or rollback.
 *
 * Keys are namespaced by the caller (`'reader-marks:' + userId`,
 * `'event-rsvp:' + eventId`); `hashtext` maps them onto the lock space, so an
 * unrelated key colliding only costs a moment of waiting, never correctness.
 */
import type { Prisma } from '@prisma/client';

export async function lockKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}
