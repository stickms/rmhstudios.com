/**
 * Theme suggestions for game jams (s15-13), the write and read side. The pure rules are in `./jam-suggestions`.
 *
 * Visibility: a suggestion is seen by its suggester and by admins, never by another member. Whether a text reached the
 * shortlist is told to its suggester only once the vote has opened (`mayShowShortlisted`), because the shortlist is
 * secret until then and, through it, so is the theme (`GameJam.theme` is never sent before `startsAt`).
 *
 * The cap holds under concurrency: the count and the insert run in one transaction after the member's lock.
 * The `comment` timeout is checked in the route (`api/jams.$slug.suggestions.server.ts`) before this writes.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { userChipSelect } from '@/lib/user-display';
import type { ErrorCode } from '@/lib/errors/codes';
import {
  JAM_SUGGESTION_LIMIT,
  mayShowShortlisted,
  normaliseSuggestion,
  suggestionKey,
  suggestionsOpen,
} from './jam-suggestions';
import type { AdminSuggestionGroup, JamSuggestionsView, MySuggestionView } from './jam-suggestions.contract';

export const suggestionLockKey = (jamId: string, userId: string) => `jam-suggestions:${jamId}:${userId}`;

type Db = Prisma.TransactionClient | typeof prisma;

export type SuggestionOutcome<T = object> =
  ({ ok: true } & T) | { ok: false; code: ErrorCode; status: number; params?: { max: number } };

const refuse = (code: ErrorCode, status: number, params?: { max: number }) => ({
  ok: false as const,
  code,
  status,
  ...(params ? { params } : {}),
});

const JAM_WINDOW_SELECT = {
  id: true,
  createdById: true,
  startsAt: true,
  themeVoting: true,
  themeVoteOpensAt: true,
} as const;

/** The viewer's own suggestions and, for an admin, every suggestion grouped by text. Null for an unknown jam. */
export async function suggestionsView(
  slug: string,
  viewerId: string,
  isAdmin: boolean,
  now: Date = new Date(),
): Promise<JamSuggestionsView | null> {
  const jam = await prisma.gameJam.findUnique({ where: { slug }, select: JAM_WINDOW_SELECT });
  if (!jam) return null;
  const candidates = await prisma.gameJamThemeCandidate.findMany({
    where: { jamId: jam.id },
    select: { text: true },
  });
  const shortlist = new Set(candidates.map((c) => suggestionKey(c.text)));
  const showShortlisted = mayShowShortlisted(jam, now);
  const mine = await prisma.gameJamThemeSuggestion.findMany({
    where: { jamId: jam.id, userId: viewerId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, text: true, createdAt: true },
  });
  let all: AdminSuggestionGroup[] | null = null;
  if (isAdmin) {
    const rows = await prisma.gameJamThemeSuggestion.findMany({
      where: { jamId: jam.id },
      orderBy: { createdAt: 'asc' },
      select: { text: true, user: { select: userChipSelect } },
    });
    const groups = new Map<string, AdminSuggestionGroup>();
    for (const r of rows) {
      const key = suggestionKey(r.text);
      const g = groups.get(key) ?? { text: r.text, count: 0, suggesters: [], onShortlist: shortlist.has(key) };
      g.count += 1;
      g.suggesters.push({ id: r.user.id, name: r.user.name ?? r.user.handle ?? '' });
      groups.set(key, g);
    }
    all = [...groups.values()].sort((a, b) => b.count - a.count);
  }
  return {
    open: suggestionsOpen(jam, now),
    limit: JAM_SUGGESTION_LIMIT,
    mine: mine.map((m) => ({
      id: m.id,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
      shortlisted: showShortlisted && shortlist.has(suggestionKey(m.text)),
    })),
    all,
  };
}

/** Add a suggestion. The window, the member's standing and the cap are all decided inside the locked transaction. */
export async function suggestTheme(
  slug: string,
  userId: string,
  rawText: string,
  now: Date = new Date(),
): Promise<SuggestionOutcome<{ suggestion: MySuggestionView }>> {
  const text = normaliseSuggestion(rawText);
  if (!text) return refuse('INVALID_INPUT', 400);
  const found = await prisma.gameJam.findUnique({ where: { slug }, select: { id: true } });
  if (!found) return refuse('NOT_FOUND', 404);
  return prisma.$transaction(async (tx): Promise<SuggestionOutcome<{ suggestion: MySuggestionView }>> => {
    await lockKey(tx, suggestionLockKey(found.id, userId));
    const jam = await tx.gameJam.findUnique({ where: { id: found.id }, select: JAM_WINDOW_SELECT });
    if (!jam) return refuse('NOT_FOUND', 404);
    if (!suggestionsOpen(jam, now)) return refuse('JAM_SUGGESTIONS_CLOSED', 409);
    const user = await tx.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
    if (user?.bannedUntil && user.bannedUntil.getTime() > now.getTime()) return refuse('FORBIDDEN', 403);
    const block = await tx.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: jam.createdById, blockedId: userId },
          { blockerId: userId, blockedId: jam.createdById },
        ],
      },
      select: { id: true },
    });
    if (block) return refuse('FORBIDDEN', 403);
    const existing = await tx.gameJamThemeSuggestion.findMany({
      where: { jamId: jam.id, userId },
      select: { text: true },
    });
    if (existing.some((e) => suggestionKey(e.text) === suggestionKey(text))) return refuse('CONFLICT', 409);
    if (existing.length >= JAM_SUGGESTION_LIMIT) {
      return refuse('JAM_SUGGESTION_LIMIT', 409, { max: JAM_SUGGESTION_LIMIT });
    }
    const row = await tx.gameJamThemeSuggestion.create({
      data: { jamId: jam.id, userId, text },
      select: { id: true, text: true, createdAt: true },
    });
    return {
      ok: true,
      // Never "on the shortlist" here: suggesting happens before the vote opens.
      suggestion: { id: row.id, text: row.text, createdAt: row.createdAt.toISOString(), shortlisted: false },
    };
  });
}

/** Withdraw your own suggestion while suggestions are open (under the same member lock as adding one). */
export async function withdrawSuggestion(
  slug: string,
  userId: string,
  suggestionId: string,
  now: Date = new Date(),
): Promise<SuggestionOutcome> {
  const found = await prisma.gameJam.findUnique({ where: { slug }, select: { id: true } });
  if (!found) return refuse('NOT_FOUND', 404);
  return prisma.$transaction(async (tx): Promise<SuggestionOutcome> => {
    await lockKey(tx, suggestionLockKey(found.id, userId));
    const jam = await tx.gameJam.findUnique({ where: { id: found.id }, select: JAM_WINDOW_SELECT });
    if (!jam) return refuse('NOT_FOUND', 404);
    if (!suggestionsOpen(jam, now)) return refuse('JAM_SUGGESTIONS_CLOSED', 409);
    const { count } = await tx.gameJamThemeSuggestion.deleteMany({
      where: { id: suggestionId, jamId: jam.id, userId },
    });
    return count === 1 ? { ok: true } : refuse('NOT_FOUND', 404);
  });
}

/** Account deletion: the member's suggestions go (anonymisation never fires the cascade). */
export function jamSuggestionErasureOps(userId: string) {
  return [prisma.gameJamThemeSuggestion.deleteMany({ where: { userId } })];
}

/** The account export: the member's suggestions (jam title, text, time, whether shortlisted once that is public). */
export async function exportJamSuggestions(userId: string, now: Date = new Date(), db: Db = prisma) {
  const rows = await db.gameJamThemeSuggestion.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      text: true,
      createdAt: true,
      jam: {
        select: {
          title: true,
          startsAt: true,
          themeVoting: true,
          themeVoteOpensAt: true,
          themeCandidates: { select: { text: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    jamTitle: r.jam.title,
    text: r.text,
    suggestedAt: r.createdAt.toISOString(),
    // The same rule as the member's own list: nothing about the shortlist before the vote has opened.
    shortlisted:
      mayShowShortlisted(r.jam, now) &&
      r.jam.themeCandidates.some((c) => suggestionKey(c.text) === suggestionKey(r.text)),
  }));
}
