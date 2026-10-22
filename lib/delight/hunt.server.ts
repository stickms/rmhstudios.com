/** Z2 — site-wide hunt. A member sees only their current clue's pointer; answers never leave the server. */
import { prisma } from '@/lib/prisma.server';
import { grantAchievement } from '@/lib/achievements/engine.server';
import { dropDelightConfigCache } from '@/lib/delight/config.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import { normalizeAnswer, type HuntInput } from '@/lib/delight/schema';

export interface HuntState {
  huntId: string;
  title: string;
  total: number;
  solved: number;
  finished: boolean;
  durationMs: number | null;
  /** The pointer for the clue the member is on (null once finished). */
  hint: string | null;
  position: number | null;
}

export async function activeHunt() {
  return prisma.hunt.findFirst({
    where: { active: true },
    select: { id: true, title: true, _count: { select: { clues: true } } },
  });
}

/** The member's state, starting their clock on first look. Null when no hunt is live. */
export async function getHuntState(userId: string): Promise<HuntState | null> {
  const hunt = await activeHunt();
  if (!hunt) return null;
  const progress = await prisma.huntProgress.upsert({
    where: { huntId_userId: { huntId: hunt.id, userId } },
    create: { huntId: hunt.id, userId },
    update: {},
  });
  const finished = progress.finishedAt != null;
  const clue = finished
    ? null
    : await prisma.huntClue.findUnique({
        where: { huntId_position: { huntId: hunt.id, position: progress.solved + 1 } },
        select: { hint: true, position: true },
      });
  return {
    huntId: hunt.id,
    title: hunt.title,
    total: hunt._count.clues,
    solved: progress.solved,
    finished,
    durationMs: progress.durationMs,
    hint: clue?.hint ?? null,
    position: clue?.position ?? null,
  };
}

export type AnswerResult = { correct: false } | { correct: true; finished: boolean };

export async function submitAnswer(userId: string, answer: string): Promise<AnswerResult | null> {
  const hunt = await activeHunt();
  if (!hunt) return null;
  const progress = await prisma.huntProgress.findUnique({
    where: { huntId_userId: { huntId: hunt.id, userId } },
  });
  if (!progress || progress.finishedAt) return null;
  const clue = await prisma.huntClue.findUnique({
    where: { huntId_position: { huntId: hunt.id, position: progress.solved + 1 } },
    select: { answer: true },
  });
  if (!clue || normalizeAnswer(answer) !== clue.answer) return { correct: false };

  const solved = progress.solved + 1;
  const finished = solved >= hunt._count.clues;
  const now = new Date();
  // The `solved` guard makes a double submit advance once.
  const res = await prisma.huntProgress.updateMany({
    where: { id: progress.id, solved: progress.solved, finishedAt: null },
    data: finished
      ? {
          solved,
          finishedAt: now,
          durationMs: Math.min(2_000_000_000, now.getTime() - progress.startedAt.getTime()),
        }
      : { solved },
  });
  if (res.count === 0) return { correct: true, finished: false };
  if (finished) void grantAchievement(userId, 'special.site_hunter');
  return { correct: true, finished };
}

/** The clue text for `path`, only if it is the member's current clue's hiding place. */
export async function markerFor(userId: string, path: string): Promise<{ text: string } | null> {
  const hunt = await activeHunt();
  if (!hunt) return null;
  const progress = await prisma.huntProgress.findUnique({
    where: { huntId_userId: { huntId: hunt.id, userId } },
    select: { solved: true, finishedAt: true },
  });
  if (!progress || progress.finishedAt) return null;
  const clue = await prisma.huntClue.findUnique({
    where: { huntId_position: { huntId: hunt.id, position: progress.solved + 1 } },
    select: { clueText: true, hiddenPath: true },
  });
  if (!clue || clue.hiddenPath !== path) return null;
  return { text: clue.clueText };
}

export async function huntLeaderboard() {
  const hunt = await activeHunt();
  if (!hunt) return null;
  const rows = await prisma.huntProgress.findMany({
    where: { huntId: hunt.id, durationMs: { not: null } },
    orderBy: { durationMs: 'asc' },
    take: 25,
    select: {
      durationMs: true,
      user: { select: userDisplaySelect },
    },
  });
  return {
    title: hunt.title,
    rows: rows.map((r) => ({ durationMs: r.durationMs, user: resolveUser(r.user) })),
  };
}

/* ── admin ── */

export async function listHunts() {
  return prisma.hunt.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      title: true,
      active: true,
      createdAt: true,
      _count: { select: { progress: { where: { finishedAt: { not: null } } } } },
      clues: {
        orderBy: { position: 'asc' },
        select: { position: true, clueText: true, hint: true, answer: true, hiddenPath: true },
      },
    },
  });
}

export async function createHunt(input: HuntInput) {
  return prisma.hunt.create({
    data: {
      title: input.title,
      clues: {
        create: input.clues.map((c, i) => ({
          position: i + 1,
          clueText: c.clueText,
          hint: c.hint,
          answer: normalizeAnswer(c.answer),
          hiddenPath: c.hiddenPath,
        })),
      },
    },
    select: { id: true },
  });
}

export async function setHuntActive(id: string, active: boolean): Promise<boolean> {
  const found = await prisma.hunt.findUnique({ where: { id }, select: { id: true } });
  if (!found) return false;
  await prisma.$transaction([
    ...(active
      ? [prisma.hunt.updateMany({ where: { active: true }, data: { active: false } })]
      : []),
    prisma.hunt.update({ where: { id }, data: { active } }),
  ]);
  dropDelightConfigCache();
  return true;
}

export async function deleteHunt(id: string): Promise<void> {
  await prisma.hunt.deleteMany({ where: { id } });
  dropDelightConfigCache();
}
