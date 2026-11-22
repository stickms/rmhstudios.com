/**
 * RMHType saved texts (s10-05) — persistence. Every read and write is scoped to the owner: a text id that is
 * not the caller's is "not found", never "forbidden", so an id says nothing about whose it is.
 *
 * A text run is the member's own record on a private text. It is saved here and its curve becomes the text's
 * ghost through `ghost-save.server`; it never calls the writers for XP, streaks, the daily board, profiles or
 * achievements (`texts.test.ts` scans this file for them).
 */
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { saveGhostIfBest, type GhostDb } from '@/lib/rmhtype/ghost-save.server';
import { textPassageId } from '@/lib/rmhtype/ghost';
import {
  MAX_RUNS_PER_TEXT,
  MAX_TEXTS_PER_MEMBER,
  normaliseTextBody,
  normaliseTextTitle,
  validateTextRun,
  type TextDetail,
  type TextRunFigures,
  type TextRunRow,
  type TextSummary,
} from '@/lib/rmhtype/texts';

interface TextRow {
  id: string;
  title: string;
  body?: string;
  bestWpm: number | null;
  bestAccuracy: number | null;
  runs: number;
  lastRunAt: Date | null;
  updatedAt: Date;
}

const SUMMARY_SELECT = {
  id: true,
  title: true,
  bestWpm: true,
  bestAccuracy: true,
  runs: true,
  lastRunAt: true,
  updatedAt: true,
} as const;

const DETAIL_SELECT = { ...SUMMARY_SELECT, body: true } as const;

function toSummary(row: TextRow): TextSummary {
  return {
    id: row.id,
    title: row.title,
    bestWpm: row.bestWpm,
    bestAccuracy: row.bestAccuracy,
    runs: row.runs,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toDetail(row: TextRow & { body: string }): TextDetail {
  return { ...toSummary(row), body: row.body };
}

/** The caller's texts, most recently changed first. Bodies are left out: the list does not need them. */
export async function listTexts(userId: string): Promise<TextSummary[]> {
  const rows = await prisma.rmhTypeText.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: MAX_TEXTS_PER_MEMBER,
    select: SUMMARY_SELECT,
  });
  return (Array.isArray(rows) ? rows : []).map(toSummary);
}

/** One of the caller's texts and its newest runs, oldest first (the chart's order). Null when it is not theirs. */
export async function getText(
  userId: string,
  textId: string,
): Promise<{ text: TextDetail; runs: TextRunRow[] } | null> {
  const row = await prisma.rmhTypeText.findFirst({ where: { id: textId, userId }, select: DETAIL_SELECT });
  if (!row) return null;
  const runs = await prisma.rmhTypeTextRun.findMany({
    where: { textId, userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: MAX_RUNS_PER_TEXT,
    select: { id: true, wpm: true, accuracy: true, timeMs: true, createdAt: true },
  });
  const list = Array.isArray(runs) ? runs : [];
  return {
    text: toDetail(row),
    runs: list.reverse().map((r) => ({
      id: r.id,
      wpm: r.wpm,
      accuracy: r.accuracy,
      timeMs: r.timeMs,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

export type CreateTextOutcome = { ok: true; text: TextDetail } | { ok: false; reason: 'cap' | 'invalid' };

/** Save a text. The 50-text cap is check-then-insert, so it runs under a per-member lock. */
export async function createText(userId: string, input: { title: string; body: string }): Promise<CreateTextOutcome> {
  const title = normaliseTextTitle(input.title);
  const body = normaliseTextBody(input.body);
  if (!title.ok || !body.ok) return { ok: false, reason: 'invalid' };
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `rmhtype-texts:${userId}`);
    const count = await tx.rmhTypeText.count({ where: { userId } });
    if (count >= MAX_TEXTS_PER_MEMBER) return { ok: false as const, reason: 'cap' as const };
    const row = await tx.rmhTypeText.create({
      data: { userId, title: title.value, body: body.value },
      select: DETAIL_SELECT,
    });
    return { ok: true as const, text: toDetail(row) };
  });
}

export type UpdateTextOutcome =
  { ok: true; text: TextDetail; reset: boolean } | { ok: false; reason: 'not-found' | 'invalid' };

/**
 * Rename a text and/or change its body. A body that differs from the stored one resets the bests, the run count
 * and the last run, deletes the runs and deletes the `text:<id>` ghost, all in one transaction: the record
 * belonged to the old words.
 */
export async function updateText(
  userId: string,
  textId: string,
  input: { title?: string | undefined; body?: string | undefined },
): Promise<UpdateTextOutcome> {
  const title = input.title === undefined ? null : normaliseTextTitle(input.title);
  const body = input.body === undefined ? null : normaliseTextBody(input.body);
  if ((title && !title.ok) || (body && !body.ok)) return { ok: false, reason: 'invalid' };
  return prisma.$transaction(async (tx) => {
    const current = await tx.rmhTypeText.findFirst({ where: { id: textId, userId }, select: { id: true, body: true } });
    if (!current) return { ok: false as const, reason: 'not-found' as const };
    const bodyChanged = body !== null && body.ok && body.value !== current.body;
    const data: Record<string, unknown> = {};
    if (title && title.ok) data.title = title.value;
    if (bodyChanged && body && body.ok) {
      Object.assign(data, { body: body.value, bestWpm: null, bestAccuracy: null, runs: 0, lastRunAt: null });
      await tx.rmhTypeTextRun.deleteMany({ where: { textId, userId } });
      await tx.rmhTypeGhost.deleteMany({ where: { userId, passageId: textPassageId(textId) } });
    }
    const row = await tx.rmhTypeText.update({ where: { id: textId }, data, select: DETAIL_SELECT });
    return { ok: true as const, text: toDetail(row), reset: bodyChanged };
  });
}

/** Delete a text with its runs (cascade) and its ghost. False when it is not the caller's. */
export async function deleteText(userId: string, textId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.rmhTypeText.deleteMany({ where: { id: textId, userId } });
    if (count === 0) return false;
    await tx.rmhTypeGhost.deleteMany({ where: { userId, passageId: textPassageId(textId) } });
    return true;
  });
}

export type RecordRunOutcome =
  | { ok: true; text: TextSummary; newBest: boolean; ghost: Awaited<ReturnType<typeof saveGhostIfBest>> | 'none' }
  | { ok: false; reason: 'not-found' | 'invalid' };

/**
 * Record one finished run: re-check it against the stored body, store it (trimming to the newest 50), move the
 * bests with a compare-and-set, and keep its curve as the ghost when it is the best. One write per finished run.
 */
export async function recordTextRun(
  userId: string,
  textId: string,
  run: TextRunFigures & { samples?: number[] | undefined },
): Promise<RecordRunOutcome> {
  const stored = await prisma.$transaction(async (tx) => {
    const text = await tx.rmhTypeText.findFirst({ where: { id: textId, userId }, select: { id: true, body: true } });
    if (!text) return { ok: false as const, reason: 'not-found' as const };
    if (!validateTextRun(run, text.body.length)) return { ok: false as const, reason: 'invalid' as const };

    await tx.rmhTypeTextRun.create({
      data: { textId, userId, wpm: run.wpm, accuracy: run.accuracy, timeMs: run.timeMs },
    });
    // Trim to the newest 50 on insert.
    const surplus = await tx.rmhTypeTextRun.findMany({
      where: { textId, userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: MAX_RUNS_PER_TEXT,
      select: { id: true },
    });
    const stale = Array.isArray(surplus) ? surplus.map((r) => r.id) : [];
    if (stale.length > 0) await tx.rmhTypeTextRun.deleteMany({ where: { id: { in: stale } } });

    // Compare-and-set on each best: two finishes at once cannot lower either.
    const best = await tx.rmhTypeText.updateMany({
      where: { id: textId, userId, OR: [{ bestWpm: null }, { bestWpm: { lt: run.wpm } }] },
      data: { bestWpm: run.wpm },
    });
    await tx.rmhTypeText.updateMany({
      where: { id: textId, userId, OR: [{ bestAccuracy: null }, { bestAccuracy: { lt: run.accuracy } }] },
      data: { bestAccuracy: run.accuracy },
    });
    const row = await tx.rmhTypeText.update({
      where: { id: textId },
      data: { runs: { increment: 1 }, lastRunAt: new Date() },
      select: SUMMARY_SELECT,
    });
    return { ok: true as const, summary: toSummary(row), newBest: best.count > 0, bodyLength: text.body.length };
  });
  if (!stored.ok) return stored;

  // The ghost keeps the best curve through the shared save (its accuracy, plausibility and 500-cap checks apply).
  const ghost =
    run.samples === undefined
      ? ('none' as const)
      : await saveGhostIfBest(prisma as unknown as GhostDb, {
          userId,
          passageId: textPassageId(textId),
          aiPassage: false,
          passageLength: stored.bodyLength,
          wpm: run.wpm,
          accuracy: run.accuracy,
          timeMs: run.timeMs,
          samples: run.samples,
        });
  return { ok: true, text: stored.summary, newBest: stored.newBest, ghost };
}

/** Whether a text is the caller's: the ghost endpoint asks before it reads a `text:<id>` passage. */
export async function ownsText(userId: string, textId: string): Promise<boolean> {
  const row = await prisma.rmhTypeText.findFirst({ where: { id: textId, userId }, select: { id: true } });
  return !!row;
}

/** The member's texts and their runs, for the data export. */
export async function exportRmhTypeTexts(userId: string) {
  const texts = await prisma.rmhTypeText.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    take: MAX_TEXTS_PER_MEMBER,
    select: {
      id: true,
      title: true,
      body: true,
      bestWpm: true,
      bestAccuracy: true,
      runs: true,
      lastRunAt: true,
      createdAt: true,
    },
  });
  const runs = await prisma.rmhTypeTextRun.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { textId: true, wpm: true, accuracy: true, timeMs: true, createdAt: true },
  });
  const byText = new Map<string, Array<{ wpm: number; accuracy: number; timeMs: number; createdAt: Date }>>();
  for (const r of Array.isArray(runs) ? runs : []) {
    const list = byText.get(r.textId) ?? [];
    list.push({ wpm: r.wpm, accuracy: r.accuracy, timeMs: r.timeMs, createdAt: r.createdAt });
    byText.set(r.textId, list);
  }
  return (Array.isArray(texts) ? texts : []).map(({ id, ...text }) => ({ ...text, recentRuns: byText.get(id) ?? [] }));
}

/** Account deletion anonymises in place, so the texts and runs are deleted explicitly (runs first). Ghosts go with every ghost row. */
export function typeTextErasureOps(userId: string) {
  return [
    prisma.rmhTypeTextRun.deleteMany({ where: { userId } }),
    prisma.rmhTypeText.deleteMany({ where: { userId } }),
  ];
}
