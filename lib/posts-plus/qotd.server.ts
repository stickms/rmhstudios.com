/**
 * X4 · Question of the day — server side.
 *
 * One prompt per UTC day. The admin queue (`qotd_prompt` rows with no `dayKey`)
 * is drained oldest-first as days are first read; an admin may also pin a prompt
 * to a specific future day. When there is nothing for a day the built-in rotation
 * answers (lib/posts-plus/qotd-builtin.ts), so the card never goes dark.
 *
 * Answers are ordinary RMHarks. `qotd_answer` is the only thing that ties a post
 * to a day. Answering counts as the day's streak check-in (see `afterQotdAnswer`).
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { checkIn } from '@/lib/streak.server';
import { getHiddenAuthorIds } from '@/lib/moderation.server';
import { mapRmharksWithBoundedReactions, rmharkIncludeLite } from '@/lib/feed/map-feed-item.server';
import type { FeedItem } from '@/lib/feed-types';
import { builtinPromptFor } from './qotd-builtin';
import {
  MAX_QOTD_ANSWERS_PER_DAY,
  QOTD_ARCHIVE_DAYS,
  DAY_MS,
  isValidDayKey,
  utcDayKey,
} from './constants';

export interface QotdPromptView {
  dayKey: string;
  text: string;
  source: 'curated' | 'builtin';
}

const PROMPT_CACHE_MS = 60_000;

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
}

/**
 * The prompt for a day. For *today* this also claims the oldest queued prompt if
 * the day has none yet; for any other day it only reads (a past day nobody opened
 * stays on the built-in rotation, a future day shows only what an admin pinned).
 */
export async function getPromptForDay(dayKey: string): Promise<QotdPromptView> {
  const existing = await prisma.qotdPrompt.findUnique({
    where: { dayKey },
    select: { text: true },
  });
  if (existing) return { dayKey, text: existing.text, source: 'curated' };

  if (dayKey === utcDayKey()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const next = await prisma.qotdPrompt.findFirst({
        where: { dayKey: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { id: true, text: true },
      });
      if (!next) break;
      try {
        // Conditional claim: two web workers racing for the same queue head both
        // run this; only one flips the row, the other loops and re-reads.
        const claimed = await prisma.qotdPrompt.updateMany({
          where: { id: next.id, dayKey: null },
          data: { dayKey },
        });
        if (claimed.count === 1) return { dayKey, text: next.text, source: 'curated' };
      } catch (e) {
        // Someone else stamped a different prompt for this day first.
        if (!isUniqueViolation(e)) throw e;
        const won = await prisma.qotdPrompt.findUnique({
          where: { dayKey },
          select: { text: true },
        });
        if (won) return { dayKey, text: won.text, source: 'curated' };
      }
    }
  }
  return { dayKey, text: builtinPromptFor(dayKey), source: 'builtin' };
}

export interface QotdToday extends QotdPromptView {
  answerCount: number;
  /** How many answers the viewer has already posted (0 when signed out). */
  myAnswers: number;
}

/** Today's prompt + answer count (cached 60s) + the viewer's own count (one indexed count). */
export async function getToday(viewerId: string | null): Promise<QotdToday> {
  const dayKey = utcDayKey();
  const cacheKey = `qotd:today:${dayKey}`;
  let base = apiCache.get<QotdPromptView & { answerCount: number }>(cacheKey);
  if (!base) {
    const [prompt, answerCount] = await Promise.all([
      getPromptForDay(dayKey),
      prisma.qotdAnswer.count({ where: { dayKey } }),
    ]);
    base = { ...prompt, answerCount };
    apiCache.set(cacheKey, base, PROMPT_CACHE_MS);
  }
  const myAnswers = viewerId
    ? await prisma.qotdAnswer.count({ where: { userId: viewerId, dayKey } })
    : 0;
  return { ...base, myAnswers };
}

/** Why a compose request tagged with `qotdDay` is refused, or null when it is fine. */
export async function qotdAnswerError(userId: string, qotdDay: string): Promise<string | null> {
  if (qotdDay !== utcDayKey())
    return "That question is no longer open - only today's can be answered";
  const mine = await prisma.qotdAnswer.count({ where: { userId, dayKey: qotdDay } });
  if (mine >= MAX_QOTD_ANSWERS_PER_DAY) {
    return `You can post at most ${MAX_QOTD_ANSWERS_PER_DAY} answers to one question`;
  }
  return null;
}

/** Inside the post-create transaction. */
export async function recordQotdAnswer(
  tx: Prisma.TransactionClient,
  postId: string,
  userId: string,
  dayKey: string,
): Promise<void> {
  await tx.qotdAnswer.create({ data: { postId, userId, dayKey } });
  apiCache.invalidate(`qotd:today:${dayKey}`);
}

/**
 * After the post exists: answering counts as the day's streak check-in.
 *
 * `checkIn` is idempotent within a UTC day (it books the day atomically), so a
 * member who already checked in gets nothing extra and a second answer is a no-op.
 * Best-effort - a streak hiccup must never fail a post that was already created.
 */
export async function afterQotdAnswer(userId: string): Promise<void> {
  try {
    await checkIn(userId);
  } catch (e) {
    console.error('[qotd] streak check-in failed:', (e as Error)?.message);
  }
}

/* ------------------------------ answers + archive ------------------------ */

export interface QotdAnswersPage {
  items: FeedItem[];
  nextCursor: string | null;
}

/** One page of a day's answers, newest first. Public, live, visible-author posts only. */
export async function listAnswers(
  dayKey: string,
  viewerId: string | null,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<QotdAnswersPage> {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 30);
  const hidden = await getHiddenAuthorIds(viewerId);
  const now = new Date();
  const links = await prisma.qotdAnswer.findMany({
    where: {
      dayKey,
      post: {
        deletedAt: null,
        audience: 'PUBLIC',
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        ...(hidden.length ? { userId: { notIn: hidden } } : {}),
      },
    },
    orderBy: [{ createdAt: 'desc' }, { postId: 'desc' }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { postId: opts.cursor }, skip: 1 } : {}),
    select: { postId: true, post: { include: rmharkIncludeLite(viewerId) } },
  });
  const hasMore = links.length > limit;
  const page = hasMore ? links.slice(0, limit) : links;
  const items = await mapRmharksWithBoundedReactions(
    page.map((l) => l.post),
    viewerId,
  );
  return { items, nextCursor: hasMore ? page[page.length - 1].postId : null };
}

export interface QotdArchiveRow extends QotdPromptView {
  answerCount: number;
}

/**
 * Today's and the last `QOTD_ARCHIVE_DAYS - 1` days' prompts with answer counts.
 * Two bounded queries (curated rows for the window, grouped answer counts) -
 * days with no curated row resolve to the built-in rotation without a query.
 */
export async function listArchive(): Promise<QotdArchiveRow[]> {
  const cacheKey = `qotd:archive:${utcDayKey()}`;
  const cached = apiCache.get<QotdArchiveRow[]>(cacheKey);
  if (cached) return cached;

  const today = utcDayKey();
  // Make sure today's prompt is claimed before reading the window.
  await getPromptForDay(today);
  const keys: string[] = [];
  const startMs = Date.parse(`${today}T00:00:00Z`);
  for (let i = 0; i < QOTD_ARCHIVE_DAYS; i++) keys.push(utcDayKey(new Date(startMs - i * DAY_MS)));

  const [curated, counts] = await Promise.all([
    prisma.qotdPrompt.findMany({
      where: { dayKey: { in: keys } },
      select: { dayKey: true, text: true },
    }),
    prisma.qotdAnswer.groupBy({
      by: ['dayKey'],
      where: { dayKey: { in: keys } },
      _count: { _all: true },
    }),
  ]);
  const curatedBy = new Map(curated.map((c) => [c.dayKey as string, c.text]));
  const countBy = new Map(counts.map((c) => [c.dayKey, c._count._all]));
  const rows = keys.map<QotdArchiveRow>((dayKey) => {
    const text = curatedBy.get(dayKey);
    return {
      dayKey,
      text: text ?? builtinPromptFor(dayKey),
      source: text ? 'curated' : 'builtin',
      answerCount: countBy.get(dayKey) ?? 0,
    };
  });
  apiCache.set(cacheKey, rows, PROMPT_CACHE_MS);
  return rows;
}

/** Prompt text for one archived day (any valid day inside the archive window). */
export async function getArchivedPrompt(dayKey: string): Promise<QotdPromptView | null> {
  if (!isValidDayKey(dayKey)) return null;
  const today = utcDayKey();
  if (dayKey > today) return null;
  const ageDays = Math.floor(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dayKey}T00:00:00Z`)) / DAY_MS,
  );
  if (ageDays >= QOTD_ARCHIVE_DAYS) return null;
  return getPromptForDay(dayKey);
}

/* --------------------------------- admin --------------------------------- */

export interface AdminQotdRow {
  id: string;
  text: string;
  dayKey: string | null;
  createdAt: string;
}

/** The admin view: pinned/future + queued prompts, plus the most recent used ones. */
export async function adminList(): Promise<{
  queue: AdminQotdRow[];
  recent: AdminQotdRow[];
  today: QotdPromptView;
}> {
  const today = utcDayKey();
  const [queue, upcoming, recent, todayPrompt] = await Promise.all([
    prisma.qotdPrompt.findMany({
      where: { dayKey: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 100,
    }),
    prisma.qotdPrompt.findMany({
      where: { dayKey: { gt: today } },
      orderBy: { dayKey: 'asc' },
      take: 100,
    }),
    prisma.qotdPrompt.findMany({
      where: { dayKey: { lte: today } },
      orderBy: { dayKey: 'desc' },
      take: 14,
    }),
    getPromptForDay(today),
  ]);
  const view = (r: (typeof queue)[number]): AdminQotdRow => ({
    id: r.id,
    text: r.text,
    dayKey: r.dayKey,
    createdAt: r.createdAt.toISOString(),
  });
  return { queue: [...upcoming, ...queue].map(view), recent: recent.map(view), today: todayPrompt };
}

export type AdminQotdResult =
  { ok: true; id: string } | { ok: false; status: number; error: string };

export async function adminAdd(
  adminId: string,
  input: { text: string; dayKey?: string },
): Promise<AdminQotdResult> {
  if (input.dayKey) {
    if (!isValidDayKey(input.dayKey)) return { ok: false, status: 400, error: 'Invalid date' };
    if (input.dayKey < utcDayKey()) {
      return { ok: false, status: 400, error: 'Pick today or a future day' };
    }
    const taken = await prisma.qotdPrompt.findUnique({
      where: { dayKey: input.dayKey },
      select: { id: true },
    });
    if (taken) return { ok: false, status: 409, error: 'That day already has a prompt' };
  }
  const queued = await prisma.qotdPrompt.count({ where: { dayKey: null } });
  if (queued >= 365) return { ok: false, status: 400, error: 'The queue is full' };
  try {
    const row = await prisma.qotdPrompt.create({
      data: { text: input.text.trim(), dayKey: input.dayKey ?? null, createdById: adminId },
      select: { id: true },
    });
    apiCache.invalidatePrefix('qotd:');
    return { ok: true, id: row.id };
  } catch (e) {
    if (isUniqueViolation(e))
      return { ok: false, status: 409, error: 'That day already has a prompt' };
    throw e;
  }
}

/**
 * Remove a prompt that has not run yet. A prompt whose day has arrived carries
 * answers, so it stays: deleting it would orphan the day's thread heading.
 */
export async function adminRemove(id: string): Promise<AdminQotdResult> {
  const row = await prisma.qotdPrompt.findUnique({ where: { id }, select: { dayKey: true } });
  if (!row) return { ok: false, status: 404, error: 'Not found' };
  if (row.dayKey && row.dayKey <= utcDayKey()) {
    return { ok: false, status: 409, error: 'That prompt has already run' };
  }
  await prisma.qotdPrompt.delete({ where: { id } });
  apiCache.invalidatePrefix('qotd:');
  return { ok: true, id };
}
