import { prisma } from '@/lib/prisma.server';
import { REVIEWABLE_WHERE } from '@/lib/study/card-query.server';
import { TEST_KINDS, type TestKind } from '@/lib/study/practice-test';
import type { TestResultRow } from '@/lib/study/tests.contract';
import { MAX_TEST_DURATION_MS, TEST_HISTORY_LIMIT, type recordTestBody } from '@/lib/study/tests-schema';
import type { z } from 'zod';

type RecordInput = z.infer<typeof recordTestBody>;

export type TestStoreResult<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

const NOT_FOUND = { ok: false, status: 404, error: 'Not found' } as const;

/** A deck the viewer may test: their own, or any public deck. Anything else reads as missing. */
async function canTestDeck(userId: string, deckId: string): Promise<boolean> {
  const deck = await prisma.flashcardDeck.findUnique({
    where: { id: deckId },
    select: { userId: true, isPublic: true },
  });
  return !!deck && (deck.isPublic || deck.userId === userId);
}

function knownKinds(kinds: string[]): TestKind[] {
  return kinds.filter((k): k is TestKind => (TEST_KINDS as readonly string[]).includes(k));
}

/**
 * Store one finished test. The server keeps only what it can bound: the points are within the
 * schema's limits (`correct <= total`), every missed card belongs to the deck, the duration is
 * clamped to four hours.
 */
export async function recordTestResult(
  userId: string,
  deckId: string,
  input: RecordInput,
): Promise<TestStoreResult<{ id: number }>> {
  if (!(await canTestDeck(userId, deckId))) return NOT_FOUND;

  // A card is asked about at most once, so a test holds at most one point per reviewable card in the deck.
  const deckSize = await prisma.flashcard.count({ where: { deckId, ...REVIEWABLE_WHERE } });
  if (input.total > deckSize) return { ok: false, status: 400, error: 'Total exceeds the deck' };

  const missed = [...new Set(input.missedCardIds)];
  // Every missed card is one lost point.
  if (missed.length > input.total - input.correct) return { ok: false, status: 400, error: 'Too many missed cards' };
  if (missed.length > 0) {
    const owned = await prisma.flashcard.count({ where: { deckId, id: { in: missed }, ...REVIEWABLE_WHERE } });
    if (owned !== missed.length) return { ok: false, status: 400, error: 'Unknown card' };
  }

  const row = await prisma.flashcardTestResult.create({
    data: {
      userId,
      deckId,
      total: input.total,
      correct: input.correct,
      kinds: input.kinds,
      durationMs: Math.round(Math.min(input.durationMs, MAX_TEST_DURATION_MS)),
      missedCardIds: missed,
      seed: input.seed,
    },
    select: { id: true },
  });
  return { ok: true, value: { id: Number(row.id) } };
}

/** The viewer's last results on a deck, newest first. */
export async function listTestResults(userId: string, deckId: string): Promise<TestStoreResult<TestResultRow[]>> {
  if (!(await canTestDeck(userId, deckId))) return NOT_FOUND;
  const rows = await prisma.flashcardTestResult.findMany({
    where: { userId, deckId },
    orderBy: { createdAt: 'desc' },
    take: TEST_HISTORY_LIMIT,
    select: { id: true, total: true, correct: true, kinds: true, durationMs: true, seed: true, createdAt: true },
  });
  return {
    ok: true,
    value: rows.map((r) => ({
      id: Number(r.id),
      total: r.total,
      correct: r.correct,
      kinds: knownKinds(r.kinds),
      durationMs: r.durationMs,
      seed: r.seed,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

const EXPORT_CAP = 50_000;

/** The member's practice-test results, for `GET /api/account/export`. */
export async function exportStudyTestData(userId: string) {
  const rows = await prisma.flashcardTestResult.findMany({
    where: { userId },
    orderBy: { id: 'asc' },
    take: EXPORT_CAP,
    select: {
      id: true,
      deckId: true,
      total: true,
      correct: true,
      kinds: true,
      durationMs: true,
      missedCardIds: true,
      seed: true,
      createdAt: true,
    },
  });
  return { testResults: rows.map((r) => ({ ...r, id: Number(r.id) })) };
}
