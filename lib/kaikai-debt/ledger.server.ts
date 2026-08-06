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
  GENERATE_AHEAD_ROWS,
  GENERATION_BATCH_SIZE,
  LEDGER_PAGE_SIZE,
  RECEIPT_STRIDE_MS,
  SEED_DEBT_CENTS,
  basisContribution,
  isDebtCategory,
  type DebtEntryDto,
  type DebtLedgerPage,
  type DebtPerson,
  type DebtSnapshot,
  type DebtSource,
  type DebtStreamEvent,
} from '@/lib/kaikai-debt/debt';
import { generateReceipts, isAiConfigured } from '@/lib/kaikai-debt/ai.server';
import { generateFallbackReceipts } from '@/lib/kaikai-debt/fallback';

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
  creditor: { select: { id: true, name: true, handle: true, image: true } },
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
function person(u: {
  id: string;
  name: string | null;
  handle: string | null;
  image: string | null;
}): DebtPerson {
  return { id: u.id, name: u.name, handle: u.handle, image: u.image };
}

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
    addedBy: row.addedBy ? person(row.addedBy) : null,
    // A member row's creditor is its author — they are the one out of pocket —
    // so it falls back rather than rendering "owed to nobody" on every line a
    // person added.
    creditor: row.creditor ? person(row.creditor) : row.addedBy ? person(row.addedBy) : null,
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

/** Items shown to the model as "already on the books", so a batch does not echo the last one. */
const AVOID_SAMPLE_SIZE = 30;

/** Real members a generated batch can be owed to. */
const CREDITOR_POOL_SIZE = 40;

/**
 * Shortest gap between two *speculative* generations, in ms.
 *
 * Generation is no longer gated on having an account — that gate is what made
 * the scroll dead-end for signed-out readers — so this is what bounds the bill
 * instead. It is deliberately a **global** throttle rather than a per-user rate
 * limit: the output is shared, since every batch is cached for everyone
 * forever, so the thing worth limiting is how often the *site* buys history,
 * not how often any one reader asks for it.
 *
 * It applies only to generate-ahead. A reader who has genuinely run out passes
 * `urgent` and skips it — see {@link extendLedger}. Throttling that case would
 * be throttling the page into a dead end, which is the whole bug being fixed:
 * the cooldown exists to stop the site buying history it does not need yet,
 * never to stop it buying history a reader is actively waiting on.
 *
 * Short, because prefetch is the cheap path and the expensive one is a reader
 * catching the frontier. The real ceiling on spend is the advisory lock (one
 * generation at a time site-wide) and the batch being cached forever.
 */
const GENERATION_COOLDOWN_MS = 3_000;

let lastGenerationAt = 0;

/**
 * Pick real members for a batch to be owed to.
 *
 * `ORDER BY random()` is a sequential scan, which is the wrong tool on a large
 * table — but it runs at most once per {@link GENERATION_COOLDOWN_MS}, behind
 * the generation lock, on a path that is already about to spend seconds in a
 * model call. Correct sampling matters more than speed here: `TABLESAMPLE` would
 * skew toward whatever happens to share a page, and a batch whose creditors are
 * all the same handful of accounts is exactly the tell to avoid.
 *
 * Bots and handle-less accounts are excluded — the point is that the archive
 * names people a reader might recognise.
 */
async function pickCreditors(
  tx: Prisma.TransactionClient,
): Promise<{ id: string; handle: string }[]> {
  return tx.$queryRaw<{ id: string; handle: string }[]>`
    SELECT id, handle
    FROM "user"
    WHERE handle IS NOT NULL
      AND "isBot" = false
      AND "deletionScheduledAt" IS NULL
    ORDER BY random()
    LIMIT ${CREDITOR_POOL_SIZE}
  `;
}

/**
 * Write another stretch of Kaikai's history, oldest-first from the frontier.
 *
 * **This does not depend on DeepSeek succeeding.** The model is asked first, and
 * whatever it returns is used; the shortfall — a partial batch, or the whole
 * batch when the key is unset or the call failed — is composed procedurally by
 * `lib/kaikai-debt/fallback.ts`. The two are interleaved rather than
 * concatenated, so a degraded batch reads as a normal stretch of ledger with a
 * few plainer lines in it rather than as twenty good rows followed by an
 * obviously mechanical block.
 *
 * The only cases that return `[]` are "somebody else is already generating" and
 * "we generated very recently" — both meaning history is arriving from another
 * request, not that there is none to be had.
 */
async function extendLedger(
  userId: string | null,
  opts: { urgent?: boolean } = {},
): Promise<EntryRow[]> {
  // `urgent` means the reader's page came back EMPTY — they are staring at the
  // bottom of the list right now. Speculative top-ups wait their turn; this
  // does not, because the alternative is a visible dead end.
  if (!opts.urgent && Date.now() - lastGenerationAt < GENERATION_COOLDOWN_MS) return [];

  try {
    return await prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`
          SELECT pg_try_advisory_xact_lock(${GENERATION_LOCK_KEY}::bigint) AS locked
        `;
        // Someone else is already buying this stretch of history. Let them.
        if (!locked) return [];

        // The frontier: the oldest row on the books. New history is written
        // strictly before it, so the keyset walk stays total and a page can
        // never be inserted into the middle of a scroll already in progress.
        const oldest = await tx.kaikaiDebtEntry.findFirst({
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { createdAt: true },
        });
        const frontierMs = Math.min(oldest?.createdAt.getTime() ?? DEBT_EPOCH_MS, DEBT_EPOCH_MS);

        const [existing, creditors] = await Promise.all([
          tx.kaikaiDebtEntry.findMany({
            orderBy: [{ createdAt: 'asc' }],
            take: AVOID_SAMPLE_SIZE,
            select: { item: true },
          }),
          pickCreditors(tx),
        ]);

        const handles = creditors.map((c) => c.handle);
        const generated = await generateReceipts(
          GENERATION_BATCH_SIZE,
          { creditorHandles: handles, existingItems: existing.map((r) => r.item) },
          { userId },
        );

        // Top up whatever the model did not deliver. `lines` is always exactly
        // GENERATION_BATCH_SIZE long, which is what makes "the scroll never
        // stops" a property of the code rather than a hope about uptime.
        const shortfall = GENERATION_BATCH_SIZE - generated.length;
        const lines =
          shortfall > 0
            ? interleave(generated, generateFallbackReceipts(shortfall, handles))
            : generated;

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
            creditorId: creditorFor(line.note, i, creditors),
            // Walk backwards a fixed stride per line. Deterministic spacing is
            // what guarantees distinct timestamps, and distinct timestamps are
            // what keep the cursor from dropping or repeating a row.
            createdAt: new Date(frontierMs - (i + 1) * RECEIPT_STRIDE_MS),
          })),
        });

        lastGenerationAt = Date.now();

        return tx.kaikaiDebtEntry.findMany({
          where: { createdAt: { lt: new Date(frontierMs) } },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: lines.length,
          select: entrySelect,
        });
      },
      // A bulk batch waits on a model call inside the transaction. The default
      // 5s timeout would abort mid-generation and throw away work already paid
      // for; the provider's own timeout is the real bound.
      { timeout: 120_000, maxWait: 10_000 },
    );
  } catch (err) {
    console.error('[kaikai-debt] ledger extension failed:', (err as Error)?.message);
    return [];
  }
}

/**
 * Which member a generated line is owed to.
 *
 * **If the note names someone, that is the creditor.** Both generators like to
 * write "@vik covered it and never saw it again", and assigning the row to
 * somebody else round-robin produced lines that contradicted themselves on
 * screen — the note crediting one member while the byline read "owed to"
 * another. Reading the handle back out of the prose is what keeps the two
 * halves of the row telling the same story.
 *
 * Only handles from this batch's pool are honoured, so a hallucinated or
 * misspelled mention falls through to the round-robin rather than silently
 * attaching a debt to whoever happens to own that handle.
 *
 * Round-robin, not random, for the unnamed lines: random leaves some members
 * with nine debts and others with none over a 120-row batch, which reads as a
 * bug even though it is just variance.
 */
function creditorFor(
  note: string,
  index: number,
  pool: { id: string; handle: string }[],
): string | null {
  if (pool.length === 0) return null;
  const mentioned = note.match(/@([\w-]+)/);
  if (mentioned) {
    const named = pool.find((c) => c.handle.toLowerCase() === mentioned[1]!.toLowerCase());
    if (named) return named.id;
  }
  return pool[index % pool.length]!.id;
}

/**
 * Blend two batches so the weaker one is not a visible block.
 *
 * Straight concatenation would put every fallback line together at one end,
 * which on a page whose whole point is scrolling means the reader hits a wall of
 * plainer prose and can see exactly where the model gave up. Alternating by
 * ratio hides the seam: a batch that is 70% generated reads as generated with
 * occasional terse entries.
 */
function interleave<T>(primary: T[], filler: T[]): T[] {
  if (primary.length === 0) return filler;
  if (filler.length === 0) return primary;

  const out: T[] = [];
  const step = (primary.length + filler.length) / filler.length;
  let nextFiller = 0;
  let f = 0;
  for (let i = 0; i < primary.length; i++) {
    while (f < filler.length && out.length >= nextFiller) {
      out.push(filler[f++]!);
      nextFiller += step;
    }
    out.push(primary[i]!);
  }
  while (f < filler.length) out.push(filler[f++]!);
  return out;
}

/**
 * One page of the infinite ledger, extending it when the reader gets close to
 * the end of what has ever been written.
 *
 * Two things make the scroll seamless rather than merely infinite:
 *
 *  - **Generate ahead, not on empty.** The trigger is how many rows remain past
 *    this page ({@link GENERATE_AHEAD_ROWS}), not whether this page came back
 *    short. Waiting for an empty page means the stall has already started by the
 *    time the work begins.
 *  - **Generate in bulk.** One call writes six pages, so the latency is paid
 *    once per few hundred rows rather than once per twenty.
 *
 * There is no `canGenerate` gate any more. Requiring a session to extend the
 * ledger is what made the scroll dead-end for signed-out readers — the common
 * case, and the one the page is most likely to be shared into. Spend is bounded
 * by the global cooldown and the batch size instead, both of which limit how
 * often the *site* buys history rather than how often any one reader asks.
 *
 * `nextCursor` is null only for a genuinely empty page, which now means
 * "generation is in flight elsewhere, ask again" and never "that is all of it".
 */
export async function getLedgerPage(opts: {
  cursor?: string | null;
  userId?: string | null;
}): Promise<DebtLedgerPage> {
  const before = parseCursor(opts.cursor);
  let rows = await readPage(before, LEDGER_PAGE_SIZE);
  let generated = false;

  // How much runway is left past this page. `take` caps the count so it stays
  // O(buffer) rather than O(table) — the answer only has to distinguish
  // "plenty" from "nearly out".
  const tailRow = rows[rows.length - 1];
  const remaining = tailRow
    ? await prisma.kaikaiDebtEntry.count({
        where: { createdAt: { lt: tailRow.createdAt } },
        take: GENERATE_AHEAD_ROWS,
      })
    : 0;

  // Empty page = the reader has caught the frontier and is waiting. Anything
  // else is a top-up with runway to spare.
  const starved = rows.length === 0;
  if (starved || remaining < GENERATE_AHEAD_ROWS) {
    const fresh = await extendLedger(opts.userId ?? null, { urgent: starved });
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
    // NEVER null while the reader has a position to resume from. A short or
    // even empty page means they caught up with generation, not that the
    // archive ended — so an empty page echoes back the cursor it was given and
    // the client retries the same spot. Dropping the cursor here was the dead
    // end: it threw away the reader's place and there was no way back.
    nextCursor: last ? String(last.createdAt.getTime()) : (opts.cursor ?? null),
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
export async function getSnapshot(opts: { userId?: string | null } = {}): Promise<DebtSnapshot> {
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
