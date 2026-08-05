/**
 * Idempotency-Key replay for the site's own mutations (E5). Server-only.
 *
 * `withDeveloperApi` has honoured `Idempotency-Key` since the developer API
 * shipped, keyed to a `DeveloperApiKey`. The site's own routes had nothing —
 * survivable while every write was a deliberate click, and not survivable the
 * moment writes get retried automatically. Two things being built alongside
 * this make that automatic: the service worker's offline outbox (B10) replays
 * queued POSTs when connectivity returns, and the transactional outbox (E4)
 * delivers at-least-once by design. Without replay protection, "at least once"
 * becomes "double-posted" and "double-spent".
 *
 * The claim-before-run ordering is the load-bearing part. The row is inserted
 * with a null `statusCode` *before* the handler executes, so a concurrent
 * duplicate loses the unique-constraint race and waits rather than running the
 * handler a second time. Recording the response afterwards is what makes the
 * retry cheap; claiming first is what makes it correct.
 */

import { createHash } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';

/** Keys older than this are swept; a client retrying after a day is a new request. */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

const MAX_KEY_LENGTH = 255;
/**
 * Responses larger than this are executed but not stored. Replaying a 2MB body
 * from Postgres to save one handler invocation is a bad trade, and the column
 * would become the table's dominant cost.
 */
const MAX_STORED_BODY = 64 * 1024;

export function hashBody(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export type ClaimResult =
  /** First time this key has been seen — run the handler, then `record()`. */
  | { kind: 'claimed' }
  /** Same key, same body, already completed — return this response verbatim. */
  | { kind: 'replay'; status: number; body: string }
  /** Same key, still running elsewhere. */
  | { kind: 'in-flight' }
  /** Same key, DIFFERENT body — a client bug, and never safe to replay. */
  | { kind: 'conflict' }
  /** Key was unusable (too long); caller should 400. */
  | { kind: 'invalid' };

/**
 * Claim a key, or discover it has been used.
 *
 * Fails **open** on a database error: idempotency is a safety net, and taking
 * the whole write path down because the net is briefly unavailable trades a
 * rare duplicate for a total outage.
 */
export async function claimIdempotency(
  userId: string,
  key: string,
  method: string,
  path: string,
  requestHash: string,
): Promise<ClaimResult> {
  if (!key || key.length > MAX_KEY_LENGTH) return { kind: 'invalid' };

  try {
    const existing = await prisma.siteIdempotencyKey.findUnique({
      where: { userId_idempotency: { userId, idempotency: key } },
      select: { requestHash: true, statusCode: true, responseBody: true, createdAt: true },
    });

    if (existing) {
      // An expired key is treated as absent — but the unique constraint still
      // holds the row, so delete it and fall through to a fresh claim.
      if (Date.now() - existing.createdAt.getTime() > IDEMPOTENCY_TTL_MS) {
        await prisma.siteIdempotencyKey
          .delete({ where: { userId_idempotency: { userId, idempotency: key } } })
          .catch(() => undefined);
      } else {
        if (existing.requestHash !== requestHash) return { kind: 'conflict' };
        if (existing.statusCode === null) return { kind: 'in-flight' };
        return {
          kind: 'replay',
          status: existing.statusCode,
          body: existing.responseBody ?? '',
        };
      }
    }

    await prisma.siteIdempotencyKey.create({
      data: { userId, idempotency: key, method, path, requestHash },
    });
    return { kind: 'claimed' };
  } catch (err) {
    // A unique-violation here means a concurrent request claimed it between our
    // read and our write — exactly the race this exists to lose safely.
    if ((err as { code?: string })?.code === 'P2002') return { kind: 'in-flight' };
    console.error('[idempotency] claim failed, proceeding unprotected:', (err as Error)?.message);
    return { kind: 'claimed' };
  }
}

/** Store the response for a claimed key. Best-effort — never throws. */
export async function recordIdempotency(
  userId: string,
  key: string,
  status: number,
  body: string,
): Promise<void> {
  // Only successful responses are replayable. Replaying a 500 would pin a
  // transient failure to the key for a day, so a client retrying after an
  // outage could never succeed.
  if (status >= 500) {
    await prisma.siteIdempotencyKey
      .delete({ where: { userId_idempotency: { userId, idempotency: key } } })
      .catch(() => undefined);
    return;
  }
  try {
    await prisma.siteIdempotencyKey.update({
      where: { userId_idempotency: { userId, idempotency: key } },
      data: {
        statusCode: status,
        responseBody: body.length <= MAX_STORED_BODY ? body : null,
      },
    });
  } catch (err) {
    console.error('[idempotency] record failed:', (err as Error)?.message);
  }
}

/** Release a claim so a genuine retry can run. Used when the handler throws. */
export async function releaseIdempotency(userId: string, key: string): Promise<void> {
  await prisma.siteIdempotencyKey
    .delete({ where: { userId_idempotency: { userId, idempotency: key } } })
    .catch(() => undefined);
}

/** Sweep expired keys. Called from the jobs worker. */
export async function sweepIdempotencyKeys(): Promise<number> {
  const { count } = await prisma.siteIdempotencyKey.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - IDEMPOTENCY_TTL_MS) } },
  });
  return count;
}
