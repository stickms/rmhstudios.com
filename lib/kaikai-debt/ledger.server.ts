/**
 * The Kaikai Debt Counter's ledger. Server-only.
 *
 * Owns three things: the snapshot the page boots from, the infinite backwards
 * walk the scroll consumes, and the write path a member's addition takes.
 *
 * ## The basis is a rolling aggregate, not a scan
 *
 * The counter needs `Σ aᵢ·e^(−r·tᵢ)` over every row (see `debt.ts`). Computing
 * that in JavaScript means loading the table, which stops being reasonable at
 * exactly the point this feature is designed to reach — an infinite ledger. So
 * it is computed in Postgres, as one aggregate over an index-only-ish scan, and
 * cached in-process for {@link SNAPSHOT_TTL_MS}.
 *
 * The cache is what makes the page cheap under load: a thousand readers watching
 * the counter tick share one aggregate every few seconds, and the ticking itself
 * is client-side arithmetic over the cached scalar. It is invalidated on write,
 * so an addition is visible immediately to the person who made it.
 *
 * ## Why generation lives behind an advisory lock
 *
 * Two people scrolling to the frontier at the same moment would both find the
 * ledger short and both call DeepSeek for the same stretch of history. The lock
 * makes one of them the generator; the other gets what is already cached and
 * asks again on the next scroll. It is `pg_try_advisory_xact_lock` —
 * transaction-scoped, so it is released by COMMIT and is safe through PgBouncer
 * in transaction mode (the invariant `lib/__tests__/pgbouncer-safety.test.ts`
 * exists to protect), and *try*, so a reader never blocks behind a model call.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { createBus } from '@/lib/realtime-bus.server';
import {
  ANNUAL_INTEREST_RATE,
  DEBT_EPOCH_MS,
  LEDGER_PAGE_SIZE,
  RECEIPT_STRIDE_MS,
  SEED_DEBT_CENTS,
  basisContribution,
  isDebtCategory,
  type DebtEntryDto,
  type DebtLedgerPage,
  type DebtSnapshot,
  type DebtSource,
  type DebtStreamEvent,
} from '@/lib/kaikai-debt/debt';
import { generateReceipts, isAiConfigured } from '@/lib/kaikai-debt/ai.server';

/* -------------------------------------------------------------------------- */
/* Realtime                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * One channel — everybody watching the counter sees the same pile.
 *
 * Keyed anyway (`GLOBAL_KEY`) because `createBus` is keyed and a single-key bus
 * costs nothing; if the joke ever grows a second debtor, this does not need
 * rewriting.
 */
export const debtBus = createBus<DebtStreamEvent>('kaikai-debt');
export const DEBT_CHANNEL = 'global';

/* -------------------------------------------------------------------------- */
/* Serialisation                                                              */
/* -------------------------------------------------------------------------- */

const entrySelect = {
  id: true,
  source: true,
  item: true,
  note: true,
  category: true,
  amountCents: true,
  claim: true,
  createdAt: true,
  addedBy: { select: { id: true, name: true, handle: true, image: true } },
} as const satisfies Prisma.KaikaiDebtEntrySelect;

type EntryRow = Prisma.KaikaiDebtEntryGetPayload<{ select: typeof entrySelect }>;

/**
 * Row → DTO.
 *
 * `category` and `source` are `VarChar` in the database and therefore `string`
 * in the client's types, but the DTO promises literal unions. This is the one
 * place that gap is closed, and it closes it by falling back rather than
 * throwing: a row written by a future version of the code with a category this
 * one has never heard of should render as "other", not 500 the whole page.
 */
function toDto(row: EntryRow): DebtEntryDto {
  return {
    id: row.id,
    source: (row.source === 'ledger' ? 'ledger' : 'member') satisfies DebtSource,
    item: row.item,
    note: row.note,
    category: isDebtCategory(row.category) ? row.category : 'other',
    amountCents: row.amountCents,
    claim: row.claim,
    createdAtMs: row.createdAt.getTime(),
    addedBy: row.addedBy
      ? {
          id: row.addedBy.id,
          name: row.addedBy.name,
          handle: row.addedBy.handle,
          image: row.addedBy.image,
        }
      : null,
  };
}

/* -------------------------------------------------------------------------- */
/* Totals                                                                     */
/* -------------------------------------------------------------------------- */

export interface DebtTotals {
  basisCents: number;
  principalCents: number;
  memberPrincipalCents: number;
  entryCount: number;
  memberEntryCount: number;
  contributorCount: number;
}

/**
 * How long a totals read is reused. Short enough that a page loaded seconds
 * after someone else's addition already includes it; long enough that a busy
 * counter aggregates once per interval rather than once per reader.
 *
 * The counter's *motion* does not depend on this at all — that is `e^(r·t)`
 * evaluated in the browser — so a stale basis costs a fraction of a cent of
 * accuracy, never a frozen display.
 */
const SNAPSHOT_TTL_MS = 5_000;

let totalsCache: { at: number; value: DebtTotals } | null = null;

/**
 * Every aggregate the page needs, in one round trip.
 *
 * The basis term is `Σ amountCents · e^(−r · max(0, age in years))`. The `max(0)`
 * mirrors `secondsSinceEpoch`'s floor and is what makes the pre-epoch generated
 * receipts contribute their face value: without it, a receipt dated 2019 would
 * be *inflated* by three years of reverse compounding and one page of scrolling
 * would add more to the counter than the whole seed.
 *
 * Written as raw SQL rather than assembled from `groupBy` calls because it is
 * four aggregates over one scan, and because `EXP()` has no Prisma expression.
 */
async function readTotals(): Promise<DebtTotals> {
  const rows = await prisma.$queryRaw<
    {
      basis: number | null;
      principal: bigint | null;
      member_principal: bigint | null;
      entries: bigint;
      member_entries: bigint;
      contributors: bigint;
    }[]
  >`
    SELECT
      SUM(
        "amountCents"::double precision
        * EXP(
            -${ANNUAL_INTEREST_RATE}::double precision
            * GREATEST(
                0,
                EXTRACT(EPOCH FROM ("createdAt" - ${new Date(DEBT_EPOCH_MS)}::timestamp))
              ) / (365.2425 * 24 * 60 * 60)
          )
      )                                                                  AS basis,
      SUM("amountCents")::bigint                                         AS principal,
      SUM("amountCents") FILTER (WHERE "source" = 'member')::bigint      AS member_principal,
      COUNT(*)::bigint                                                   AS entries,
      COUNT(*) FILTER (WHERE "source" = 'member')::bigint                AS member_entries,
      COUNT(DISTINCT "addedById")::bigint                                AS contributors
    FROM kaikai_debt_entry
  `;

  const row = rows[0];
  return {
    // The seed is folded in HERE and nowhere else, so there is exactly one
    // answer to "what was he already down before anyone was counting".
    basisCents: SEED_DEBT_CENTS + Number(row?.basis ?? 0),
    principalCents: Number(row?.principal ?? 0),
    memberPrincipalCents: Number(row?.member_principal ?? 0),
    entryCount: Number(row?.entries ?? 0),
    memberEntryCount: Number(row?.member_entries ?? 0),
    contributorCount: Number(row?.contributors ?? 0),
  };
}

/** Totals, from the short-lived cache when it is warm. */
export async function getTotals(force = false): Promise<DebtTotals> {
  const now = Date.now();
  if (!force && totalsCache && now - totalsCache.at < SNAPSHOT_TTL_MS) return totalsCache.value;
  const value = await readTotals();
  totalsCache = { at: now, value };
  return value;
}

/** Drop the cache. Called on write so the author sees their own line immediately. */
export function invalidateTotals(): void {
  totalsCache = null;
}

/* -------------------------------------------------------------------------- */
/* Reading the ledger                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Cursor format: the `createdAt` epoch-millis of the last row of the previous
 * page, as a decimal string.
 *
 * A timestamp alone is a total order here because the generated rows are spaced
 * a fixed stride apart and member rows land at `now()` — collisions would need
 * two members inserting in the same millisecond, so `id` is carried as the
 * tiebreaker in the index and in the ORDER BY. Parsing is defensive because this
 * value round-trips through a URL.
 */
function parseCursor(cursor: string | null | undefined): Date | null {
  if (!cursor) return null;
  const ms = Number(cursor);
  return Number.isFinite(ms) ? new Date(ms) : null;
}

async function readPage(before: Date | null, take: number): Promise<EntryRow[]> {
  return prisma.kaikaiDebtEntry.findMany({
    where: before ? { createdAt: { lt: before } } : undefined,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    select: entrySelect,
  });
}

/* -------------------------------------------------------------------------- */
/* Extending the ledger                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Arbitrary but stable 64-bit key for the generation lock. Any two processes
 * that agree on this integer are mutually excluded; nothing else in the database
 * uses it.
 */
const GENERATION_LOCK_KEY = 8_314_921_774_055_301n;

/** Items shown to the model as "already used", so a batch does not repeat the last one. */
const AVOID_SAMPLE_SIZE = 40;

/**
 * Generate and persist one more page of history, oldest-first from the current
 * frontier.
 *
 * Returns `[]` — never throws — when it cannot extend right now: the lock is
 * held, DeepSeek is unconfigured, or the call failed. Every one of those is
 * "ask again later", and the scroll's contract (`nextCursor: null`) already
 * expresses that. A model outage must not turn scrolling a joke page into a 500.
 */
async function extendLedger(userId: string | null): Promise<EntryRow[]> {
  if (!isAiConfigured()) return [];

  try {
    return await prisma.$transaction(async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(${GENERATION_LOCK_KEY}::bigint) AS locked
      `;
      // Someone else is already buying this stretch of history. Let them.
      if (!locked) return [];

      // The frontier: the oldest row on the books. New history is written
      // strictly before it, so the keyset walk stays total and a page can never
      // be inserted into the middle of a scroll someone is already partway down.
      const oldest = await tx.kaikaiDebtEntry.findFirst({
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { createdAt: true },
      });
      const frontierMs = Math.min(oldest?.createdAt.getTime() ?? DEBT_EPOCH_MS, DEBT_EPOCH_MS);

      const recentItems = await tx.kaikaiDebtEntry.findMany({
        orderBy: [{ createdAt: 'asc' }],
        take: AVOID_SAMPLE_SIZE,
        select: { item: true },
      });

      const lines = await generateReceipts(
        LEDGER_PAGE_SIZE,
        recentItems.map((r) => r.item),
        { userId },
      );
      if (lines.length === 0) return [];

      await tx.kaikaiDebtEntry.createMany({
        data: lines.map((line, i) => ({
          source: 'ledger',
          item: line.item,
          note: line.note,
          category: line.category,
          amountCents: line.amountCents,
          claim: null,
          addedById: null,
          // Walk backwards a fixed stride per line. Deterministic spacing is
          // what guarantees distinct timestamps, and distinct timestamps are
          // what keep the cursor from dropping or repeating a row.
          createdAt: new Date(frontierMs - (i + 1) * RECEIPT_STRIDE_MS),
        })),
      });

      return tx.kaikaiDebtEntry.findMany({
        where: { createdAt: { lt: new Date(frontierMs) } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: lines.length,
        select: entrySelect,
      });
    });
  } catch (err) {
    console.error('[kaikai-debt] ledger extension failed:', (err as Error)?.message);
    return [];
  }
}

/**
 * One page of the infinite ledger, generating more history when the cache runs
 * dry at the frontier.
 *
 * `canGenerate` is the caller's answer to "is this reader allowed to spend a
 * model call" — signed in, inside their budget. An anonymous reader still scrolls
 * the entire cached history, which after any real traffic is most of it; they
 * simply do not get to be the one who conjures the next page. That is the whole
 * cost story of an infinite AI-generated feed: **generated once, for everyone,
 * ever**, and only ever by an attributable account.
 */
export async function getLedgerPage(opts: {
  cursor?: string | null;
  userId?: string | null;
  canGenerate?: boolean;
}): Promise<DebtLedgerPage> {
  const before = parseCursor(opts.cursor);
  let rows = await readPage(before, LEDGER_PAGE_SIZE);
  let generated = false;

  // Short page = the reader has reached the end of what has ever been written.
  if (rows.length < LEDGER_PAGE_SIZE && opts.canGenerate) {
    const fresh = await extendLedger(opts.userId ?? null);
    if (fresh.length > 0) {
      generated = true;
      invalidateTotals();
      // Re-read rather than concatenating: `fresh` is everything past the old
      // frontier, which is not necessarily the continuation of THIS cursor (the
      // reader may be several pages above it). One more indexed read is cheaper
      // than the class of off-by-one bugs the concatenation invites.
      rows = await readPage(before, LEDGER_PAGE_SIZE);
    }
  }

  const totals = await getTotals();
  const last = rows[rows.length - 1];

  return {
    entries: rows.map(toDto),
    // A full page always offers a cursor. A short one only does when the reader
    // could not have extended it themselves — so a signed-out reader at the
    // frontier is told "sign in", while a signed-in reader who hit a held lock
    // is told "try again", and neither is told the debt is finite.
    nextCursor: rows.length === LEDGER_PAGE_SIZE && last ? String(last.createdAt.getTime()) : null,
    generated,
    basisCents: totals.basisCents,
    principalCents: totals.principalCents,
    entryCount: totals.entryCount,
  };
}

/* -------------------------------------------------------------------------- */
/* Snapshot                                                                   */
/* -------------------------------------------------------------------------- */

/** Everything the page boots from, in one call. */
export async function getSnapshot(opts: {
  userId?: string | null;
  canGenerate?: boolean;
}): Promise<DebtSnapshot> {
  const page = await getLedgerPage({ cursor: null, ...opts });
  const totals = await getTotals();

  return {
    basisCents: totals.basisCents,
    principalCents: totals.principalCents,
    memberPrincipalCents: totals.memberPrincipalCents,
    entryCount: totals.entryCount,
    memberEntryCount: totals.memberEntryCount,
    contributorCount: totals.contributorCount,
    // Read AFTER the queries, so a client that starts ticking from this instant
    // is never ahead of the basis it was handed.
    asOfMs: Date.now(),
    entries: page.entries,
    nextCursor: page.nextCursor,
    aiEnabled: isAiConfigured(),
  };
}

/** The context `answerDebtQuestion` is allowed to see. */
export async function getDebtFacts(): Promise<{
  totals: DebtTotals;
  recent: EntryRow[];
  largest: EntryRow[];
}> {
  const [totals, recent, largest] = await Promise.all([
    getTotals(),
    prisma.kaikaiDebtEntry.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 12,
      select: entrySelect,
    }),
    prisma.kaikaiDebtEntry.findMany({
      orderBy: [{ amountCents: 'desc' }],
      take: 5,
      select: entrySelect,
    }),
  ]);
  return { totals, recent, largest };
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/* -------------------------------------------------------------------------- */

export interface AddEntryInput {
  userId: string;
  claim: string;
  item: string;
  note: string;
  category: string;
  amountCents: number;
}

/**
 * Put a member's line on the books and tell everyone watching.
 *
 * The broadcast carries the post-insert totals rather than a delta, so a client
 * that missed an event — a reconnect, a tab asleep through three additions —
 * converges on the next one it does see instead of drifting further out with
 * every miss.
 */
export async function addEntry(input: AddEntryInput): Promise<DebtEntryDto> {
  const row = await prisma.kaikaiDebtEntry.create({
    data: {
      source: 'member',
      item: input.item,
      note: input.note,
      category: input.category,
      amountCents: input.amountCents,
      claim: input.claim,
      addedById: input.userId,
    },
    select: entrySelect,
  });

  invalidateTotals();
  const totals = await getTotals(true);
  const entry = toDto(row);

  debtBus.publish(DEBT_CHANNEL, {
    type: 'entry.added',
    entry,
    basisCents: totals.basisCents,
    principalCents: totals.principalCents,
    memberPrincipalCents: totals.memberPrincipalCents,
    entryCount: totals.entryCount,
    memberEntryCount: totals.memberEntryCount,
    contributorCount: totals.contributorCount,
  });

  return entry;
}

/** Exported for the tests: the same discounting the SQL does, in TypeScript. */
export const basisOf = basisContribution;
