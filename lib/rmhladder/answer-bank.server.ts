/**
 * RMHLadder — answer-bank persistence (server-only).
 *
 * One row per user (`LadderAnswerBank`, PK `userId`), so every read is a point
 * lookup and every write an upsert. There is no history and no versioning by
 * design: this is a set of current answers, not a document, and keeping old
 * salary expectations around would be storing sensitive data for no user.
 *
 * ─────────────────────────── export / delete ────────────────────────────────
 * `exportAnswerBank` and `deleteAnswerBank` exist so the account data-export
 * and account-delete flows can include this table with one call each. Salary
 * expectation, work authorization and sponsorship need are sensitive personal
 * data (`SENSITIVE_FIELDS` in `answer-bank.ts`); they belong in both flows from
 * day one. NOTE: `api/account/delete.ts` ANONYMIZES the user row rather than
 * deleting it, so the `onDelete: Cascade` on this table's `user` relation never
 * fires — the delete flow has to call `deleteAnswerBank` explicitly.
 */

import { prisma } from '@/lib/prisma.server';
import {
  answerBankSchema,
  coerceEssays,
  coerceStories,
  EMPTY_ANSWER_BANK,
  type AnswerBank,
} from './answer-bank';

/** Shape of the columns this module reads. */
type AnswerBankRow = {
  workAuthorization: string | null;
  needsSponsorship: boolean | null;
  noticePeriod: string | null;
  salaryExpectation: string | null;
  locationPreference: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  essays: unknown;
  stories: unknown;
};

/** Row → DTO. The two `Json` columns are coerced, never trusted. */
export function toAnswerBank(row: AnswerBankRow | null): AnswerBank {
  if (!row) return { ...EMPTY_ANSWER_BANK };
  return {
    workAuthorization: row.workAuthorization,
    needsSponsorship: row.needsSponsorship,
    noticePeriod: row.noticePeriod,
    salaryExpectation: row.salaryExpectation,
    locationPreference: row.locationPreference,
    linkedinUrl: row.linkedinUrl,
    portfolioUrl: row.portfolioUrl,
    essays: coerceEssays(row.essays),
    stories: coerceStories(row.stories),
  };
}

/** The user's answer bank, or an empty one when they have never saved. */
export async function getAnswerBank(userId: string): Promise<AnswerBank> {
  const row = await prisma.ladderAnswerBank.findUnique({ where: { userId } });
  return toAnswerBank(row);
}

/**
 * Replace the whole bank. Full-document semantics rather than a patch: the
 * editor sends everything it has, and a partial write would silently keep an
 * essay the user deleted.
 *
 * `input` is re-parsed here even though the API route already validated it —
 * this function is also reachable from workers and server functions, and the
 * parse is what guarantees the values fit the column widths.
 */
export async function saveAnswerBank(userId: string, input: AnswerBank): Promise<AnswerBank> {
  const data = answerBankSchema.parse(input);
  const row = await prisma.ladderAnswerBank.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return toAnswerBank(row);
}

/**
 * The bank as it should appear in the account data export. Returns `null` when
 * the user never created one, so the export can omit the key entirely rather
 * than shipping a block of nulls that looks like data loss.
 */
export async function exportAnswerBank(userId: string): Promise<AnswerBank | null> {
  const row = await prisma.ladderAnswerBank.findUnique({ where: { userId } });
  return row ? toAnswerBank(row) : null;
}

/**
 * Remove the bank. `deleteMany` rather than `delete` so calling it for a user
 * who never had one is a no-op instead of a thrown `P2025` — the delete flow
 * runs this inside a transaction with a dozen siblings.
 */
export function deleteAnswerBank(userId: string) {
  return prisma.ladderAnswerBank.deleteMany({ where: { userId } });
}
