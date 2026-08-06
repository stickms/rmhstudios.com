/**
 * The DeepSeek half of the Kaikai Debt Counter. Server-only.
 *
 * Three calls, one per thing the page does with a model:
 *
 *  - {@link appraiseDebt}      — someone describes a debt; turn it into a line.
 *  - {@link answerDebtQuestion} — someone asks about the debt; stream an answer.
 *  - {@link generateReceipts}   — the ledger ran out; conjure more history.
 *
 * Everything goes through `lib/ai/provider.server.ts`, which is the one seam
 * that owns the DeepSeek client, the routing table and the `AiUsage` ledger, and
 * through `lib/ai/prompts/` so all three inherit the shared safety frame and the
 * `<user-content>` data region. Neither is optional: the input to all three is
 * text a stranger typed into a public page.
 *
 * ## The amount is not the model's decision
 *
 * `generateReceipts` samples its dollar figures **before** calling the model and
 * asks it to justify them, rather than asking it to pick. Models cluster hard on
 * round numbers — ask for two hundred prices under $250 and you get $5, $10, $20
 * and $25 forever — which would flatten the distribution the page is built on.
 * Sampling server-side ({@link sampleDebtCents}) puts the shape beyond the
 * model's reach and leaves it the part it is actually good at: inventing a
 * reason that a bus fare cost $6.30.
 *
 * `appraiseDebt` is the other way round — the human described something real, so
 * the figure has to follow the description — but the result is still clamped,
 * because a prompt is a request and a clamp is a guarantee.
 */

import { z } from 'zod';
import { isAiConfigured, runTaskJson, streamTask } from '@/lib/ai/provider.server';
import {
  asData,
  systemFor,
  KAIKAI_DEBT_ANSWER,
  KAIKAI_DEBT_APPRAISE,
  KAIKAI_DEBT_RECEIPTS,
} from '@/lib/ai/prompts';
import {
  clampEntryCents,
  formatDebt,
  GENERATION_BATCH_SIZE,
  isDebtCategory,
  sampleDebtCents,
  MAX_ITEM_CHARS,
  MAX_NOTE_CHARS,
  type DebtCategory,
} from '@/lib/kaikai-debt/debt';

export { isAiConfigured };

/* -------------------------------------------------------------------------- */
/* Shared shapes                                                              */
/* -------------------------------------------------------------------------- */

/** Trim, strip wrapping quotes, hard-truncate. Applied to every string the model returns. */
function tidy(max: number) {
  return (value: unknown): string =>
    typeof value === 'string'
      ? value
          .trim()
          .replace(/^["']|["']$/g, '')
          .replace(/\s+/g, ' ')
          .slice(0, max)
      : '';
}

const itemField = z.preprocess(tidy(MAX_ITEM_CHARS), z.string().min(1).max(MAX_ITEM_CHARS));
const noteField = z.preprocess(tidy(MAX_NOTE_CHARS), z.string().min(1).max(MAX_NOTE_CHARS));

/**
 * Fall back to `other` rather than rejecting the line.
 *
 * The category is a filter chip. A model that answers `snacks` instead of `food`
 * has still done the useful part of the job, and throwing the whole appraisal
 * away over a taxonomy miss would turn a cosmetic miss into a user-visible
 * failure.
 */
const categoryField = z.preprocess(
  (v) => (isDebtCategory(v) ? v : 'other'),
  z.enum(['food', 'transit', 'rent', 'gear', 'gambling', 'emotional', 'temporal', 'other']),
);

/* -------------------------------------------------------------------------- */
/* Appraisal — one claim in, one ledger line out                              */
/* -------------------------------------------------------------------------- */

const appraisalSchema = z.union([
  z.object({
    ok: z.literal(true),
    item: itemField,
    note: noteField,
    category: categoryField,
    amountUsd: z.coerce.number().finite(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.preprocess(tidy(120), z.string().min(1).max(120)),
  }),
]);

export type DebtAppraisal =
  | { ok: true; item: string; note: string; category: DebtCategory; amountCents: number }
  | { ok: false; reason: string };

/**
 * Price a claim and write it up as a ledger line.
 *
 * The refusal path (`ok: false`) is a first-class answer, not an error: the
 * model is the only thing standing between "Kaikai owes me a coffee" and someone
 * using a public, permanent, author-attributed ledger to write something about a
 * real person. It is not a moderation system — the site's actual one still
 * applies to the author — but it is the cheapest place to catch the obvious
 * cases, and it catches them before a row exists.
 *
 * Throws `AppError('AI_UNAVAILABLE')` when DeepSeek is unreachable or returns
 * something that will not parse. The caller surfaces that as a 503; there is no
 * degraded path, because a debt counter that silently invents your entry for you
 * when the model is down is worse than one that says "try again".
 */
export async function appraiseDebt(claim: string, userId: string): Promise<DebtAppraisal> {
  const raw = await runTaskJson(
    KAIKAI_DEBT_APPRAISE.task,
    systemFor(KAIKAI_DEBT_APPRAISE),
    `A member of the public says Kaikai owes them this:\n\n${asData(claim)}`,
    (value) => appraisalSchema.parse(value),
    {
      userId,
      promptId: KAIKAI_DEBT_APPRAISE.id,
      promptVer: KAIKAI_DEBT_APPRAISE.version,
    },
  );

  if (!raw.ok) return { ok: false, reason: raw.reason };
  return {
    ok: true,
    item: raw.item,
    note: raw.note,
    category: raw.category,
    amountCents: clampEntryCents(raw.amountUsd * 100),
  };
}

/* -------------------------------------------------------------------------- */
/* Q&A — streamed, because a spinner on a joke is a joke that did not land     */
/* -------------------------------------------------------------------------- */

/** The live figures handed to the model. Everything it is allowed to know. */
export interface DebtFacts {
  totalCents: number;
  principalCents: number;
  memberPrincipalCents: number;
  entryCount: number;
  memberEntryCount: number;
  contributorCount: number;
  annualRatePercent: number;
  /** A sample of the log, newest first. Kept short — this is context, not the table. */
  recent: { item: string; note: string; amountCents: number; addedBy: string | null }[];
  /** The largest few, so "what's the worst one" has an answer. */
  largest: { item: string; amountCents: number }[];
}

/**
 * Render the facts as a labelled block.
 *
 * Deliberately not JSON. The figures are trustworthy platform data and belong in
 * the *instruction* turn where the model treats them as ground truth; only the
 * question goes in the `<user-content>` region. Mixing them into one JSON blob
 * would put our numbers and a stranger's text at the same level of authority,
 * which is exactly the boundary the safety frame exists to draw.
 */
function renderFacts(facts: DebtFacts): string {
  const lines = [
    `Total owed right now: ${formatDebt(facts.totalCents)}`,
    `Interest rate: ${facts.annualRatePercent}% a year, compounded continuously`,
    `Itemised on the books: ${formatDebt(facts.principalCents)} across ${facts.entryCount} lines`,
    `Added by members: ${formatDebt(facts.memberPrincipalCents)} across ${facts.memberEntryCount} lines from ${facts.contributorCount} people`,
  ];
  if (facts.largest.length) {
    lines.push(
      'Largest lines: ' +
        facts.largest.map((l) => `${l.item} (${formatDebt(l.amountCents)})`).join('; '),
    );
  }
  if (facts.recent.length) {
    lines.push('Most recent lines:');
    for (const r of facts.recent) {
      const who = r.addedBy ? ` — added by ${r.addedBy}` : '';
      lines.push(`  • ${r.item} — ${formatDebt(r.amountCents)} — ${r.note}${who}`);
    }
  }
  return lines.join('\n');
}

/**
 * Answer a question about the debt, token by token.
 *
 * Streams for the same reason the rest of the site's AI surfaces do: the whole
 * completion is two to five seconds and the joke dies in the wait. `streamTask`
 * meters what was generated even if the reader navigates away mid-sentence.
 */
export async function* answerDebtQuestion(
  question: string,
  facts: DebtFacts,
  userId: string,
): AsyncGenerator<string, void, undefined> {
  const system = `${systemFor(KAIKAI_DEBT_ANSWER)}\n\nTHE LIVE FIGURES (these are true; everything else you might recall is not):\n${renderFacts(facts)}`;
  yield* streamTask(
    KAIKAI_DEBT_ANSWER.task,
    system,
    `Someone reading the counter asks:\n\n${asData(question)}`,
    {
      userId,
      promptId: KAIKAI_DEBT_ANSWER.id,
      promptVer: KAIKAI_DEBT_ANSWER.version,
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Receipt generation — the infinite scroll's supply                          */
/* -------------------------------------------------------------------------- */

/**
 * The cap is derived from the batch size, never hardcoded.
 *
 * A fixed `.max(64)` is what silently disabled the model when batches grew to
 * 120: every response validated as too long, `runTaskJson` threw, the catch
 * below swallowed it, and the page filled itself entirely from the fallback
 * bank — working perfectly, costing nothing, and using none of the AI it was
 * paying for. Nothing failed loudly because the fallback is *supposed* to cover
 * failures. Tying the bound to `GENERATION_BATCH_SIZE` means raising the batch
 * can never quietly turn the model off again.
 *
 * The small allowance on top absorbs a model that overshoots by a line or two;
 * the slice in `generateReceipts` trims the excess.
 */
const receiptsSchema = z.object({
  lines: z
    .array(z.object({ item: itemField, note: noteField, category: categoryField }))
    .min(1)
    .max(GENERATION_BATCH_SIZE + 8),
});

export interface GeneratedReceipt {
  item: string;
  note: string;
  category: DebtCategory;
  amountCents: number;
}

/**
 * Tokens to allow per requested line, plus slack for the JSON envelope.
 *
 * A bulk batch needs far more than the `narrative` route's default 700, and the
 * failure mode of getting it wrong is silent: the model stops mid-array, the
 * JSON does not parse, and the batch is lost.
 */
const TOKENS_PER_LINE = 110;

/** Context handed to the model, capped so the prompt stays a fraction of the completion. */
const MAX_CONTEXT_ITEMS = 30;
const MAX_CONTEXT_HANDLES = 20;

export interface ReceiptContext {
  /** Handles of real members the lines may be owed to. */
  creditorHandles: readonly string[];
  /** Items already on the books, so the model can avoid repeating them. */
  existingItems: readonly string[];
}

/**
 * Conjure `count` more lines of Kaikai's history.
 *
 * **Never throws.** Returns `[]` on any failure — unconfigured key, timeout,
 * rate limit, unparseable JSON. That is the contract the infinite scroll is
 * built on: the caller responds to an empty array by composing the batch
 * procedurally instead (`lib/kaikai-debt/fallback.ts`), so a model outage
 * degrades the prose rather than stopping the page. Throwing here would make
 * DeepSeek a hard dependency of scrolling, which is exactly what it must not be.
 *
 * A short array is likewise fine and not an error: forty good lines out of a
 * hundred still fills two pages, and the caller tops the rest up from the
 * fallback bank.
 */
export async function generateReceipts(
  count: number,
  context: ReceiptContext,
  opts: { userId?: string | null; random?: () => number } = {},
): Promise<GeneratedReceipt[]> {
  if (count <= 0 || !isAiConfigured()) return [];

  const amounts = Array.from({ length: count }, () => sampleDebtCents(opts.random));
  const handles = context.creditorHandles.slice(0, MAX_CONTEXT_HANDLES);
  const avoid = context.existingItems.slice(0, MAX_CONTEXT_ITEMS);

  const brief = [
    `Write ${count} receipt lines, one for each amount below, in this exact order.`,
    '',
    ...amounts.map((cents, i) => `${i + 1}. ${formatDebt(cents)}`),
    ...(handles.length
      ? [
          '',
          'Real members he owes. Name one in roughly a third of the notes, as',
          '@handle, and spread them around rather than favouring the first:',
          ...handles.map((h) => `- @${h}`),
        ]
      : []),
    ...(avoid.length
      ? ['', 'Already on the books — do not repeat these:', ...avoid.map((a) => `- ${a}`)]
      : []),
  ].join('\n');

  try {
    const parsed = await runTaskJson(
      KAIKAI_DEBT_RECEIPTS.task,
      systemFor(KAIKAI_DEBT_RECEIPTS),
      brief,
      (value) => receiptsSchema.parse(value),
      {
        userId: opts.userId ?? null,
        promptId: KAIKAI_DEBT_RECEIPTS.id,
        promptVer: KAIKAI_DEBT_RECEIPTS.version,
        maxTokens: count * TOKENS_PER_LINE + 400,
        temperature: 1,
      },
    );

    // Zip against the amounts WE sampled, never against anything the model
    // echoed back. A model that renumbers, reorders or drops a line then costs
    // us a shorter batch, not a batch whose prices have drifted off the
    // distribution the page is built on.
    return parsed.lines.slice(0, count).map((line, i) => ({
      item: line.item,
      note: line.note,
      category: line.category,
      amountCents: amounts[i]!,
    }));
  } catch (err) {
    // Logged, not raised. The caller has a fallback and the reader has a scroll
    // that must not stop; this is a quality event, not an outage.
    console.warn('[kaikai-debt] receipt generation failed, falling back:', (err as Error)?.message);
    return [];
  }
}
