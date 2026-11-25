/**
 * Theme voting for game jams (s07-07), the write and read side. The pure rules are in `./jam-themes`.
 *
 * Secrecy: before `startsAt` no function here returns a count or the winner (`themeVoteView` sends `null`,
 * `effectiveThemes` returns nothing). Resolution is a compare-and-set on `themeResolvedAt`, so two cron runs act
 * once; reads never wait for it (`effectiveThemes` computes the same winner for a started, unresolved jam).
 */
import { notice } from '@/lib/notifications/notice-keys';
import type { PgBoss } from 'pg-boss';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { ERROR_CODES, type ErrorCode } from '@/lib/errors/codes';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import {
  CANDIDATE_PROBLEM_MESSAGE,
  normaliseMarks,
  themeVotingPhase,
  validateCandidates,
  winnerOf,
  type ThemeVotingPhase,
} from './jam-themes';
import type { JamThemeVoteView } from './jam-themes.contract';

export const JAM_THEME_QUEUE = 'jam.theme-resolve';
export const JAM_THEME_CRON = '* * * * *';
const RESOLVE_BATCH = 25;
const VOTER_PAGE = 200;

export const candidatesLockKey = (jamId: string) => `jam-theme-candidates:${jamId}`;
export const voteLockKey = (jamId: string, userId: string) => `jam-theme-vote:${jamId}:${userId}`;

type Db = Prisma.TransactionClient | typeof prisma;

/** A banned member's marks are not counted (a deleted account is a ban tombstone, and its votes are erased). */
function notBanned(now: Date): Prisma.UserWhereInput {
  return {
    OR: [
      {
        bannedUntil: null,
      },
      {
        bannedUntil: {
          lte: now,
        },
      },
    ],
  };
}

/** One grouped query: marks per candidate of a jam, banned voters filtered out. */
export async function countMarks(db: Db, jamId: string, now: Date): Promise<Map<string, number>> {
  const grouped = await db.gameJamThemeVote.groupBy({
    by: ['candidateId'],
    where: {
      jamId,
      user: notBanned(now),
    },
    _count: {
      _all: true,
    },
  });
  return new Map(grouped.map((g) => [g.candidateId, g._count._all]));
}

async function listCandidates(db: Db, jamId: string) {
  return db.gameJamThemeCandidate.findMany({
    where: {
      jamId,
    },
    orderBy: {
      position: 'asc',
    },
    select: {
      id: true,
      text: true,
      position: true,
    },
  });
}

/** The winning candidate of a jam right now (count, then listing order). */
export async function computeWinner(db: Db, jamId: string, now: Date) {
  const candidates = await listCandidates(db, jamId);
  if (candidates.length === 0) return null;
  const id = winnerOf(candidates, await countMarks(db, jamId, now));
  return candidates.find((c) => c.id === id) ?? null;
}

interface ThemedJam {
  id: string;
  theme: string;
  startsAt: Date;
  themeVoting: boolean;
  themeResolvedAt: Date | null;
}

/**
 * The theme each started voting jam shows when its claim has not run yet (the worker may be down). Empty for a
 * jam that has not started: nothing is computed, so nothing can leak.
 */
export async function effectiveThemes(
  jams: readonly ThemedJam[],
  now: Date = new Date(),
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    jams
      .filter((j) => j.themeVoting && !j.themeResolvedAt && j.startsAt.getTime() <= now.getTime())
      .map(async (j) => {
        const w = await computeWinner(prisma, j.id, now);
        if (w) out.set(j.id, w.text);
      }),
  );
  return out;
}

const JAM_VOTE_SELECT = {
  id: true,
  slug: true,
  title: true,
  theme: true,
  startsAt: true,
  themeVoting: true,
  themeVoteOpensAt: true,
  themeResolvedAt: true,
} as const;

/** The shortlist, the viewer's marks and, after the start only, counts and the winner. Null for an unknown jam. */
export async function themeVoteView(
  slug: string,
  viewerId: string | null,
  now: Date = new Date(),
): Promise<JamThemeVoteView | null> {
  const jam = await prisma.gameJam.findUnique({
    where: {
      slug,
    },
    select: JAM_VOTE_SELECT,
  });
  if (!jam) return null;
  const phase: ThemeVotingPhase = themeVotingPhase(jam, now);
  const base = {
    phase,
    opensAt: jam.themeVoteOpensAt?.toISOString() ?? null,
    closesAt: jam.startsAt.toISOString(),
  };
  if (phase === 'none') {
    return {
      enabled: false,
      ...base,
      candidates: [],
      mine: [],
      winnerId: null,
      locked: false,
    };
  }
  const candidates = await listCandidates(prisma, jam.id);
  const started = phase === 'closed';
  const counts = started ? await countMarks(prisma, jam.id, now) : null;
  let winnerId: string | null = null;
  if (started) {
    // After resolution the stored theme is the answer (a later ban must not change it); before it, compute.
    winnerId = jam.themeResolvedAt
      ? (candidates.find((c) => c.text === jam.theme)?.id ?? winnerOf(candidates, counts ?? new Map()))
      : winnerOf(candidates, counts ?? new Map());
  }
  const mine = viewerId
    ? (
        await prisma.gameJamThemeVote.findMany({
          where: {
            jamId: jam.id,
            userId: viewerId,
          },
          select: {
            candidateId: true,
          },
        })
      ).map((v) => v.candidateId)
    : [];
  // Whether any mark exists is itself a hint before the start, so it is only reported once the jam has started.
  const locked =
    started &&
    (await prisma.gameJamThemeVote.count({
      where: {
        jamId: jam.id,
      },
    })) > 0;
  return {
    enabled: true,
    ...base,
    candidates: candidates.map((c) => ({
      id: c.id,
      text: c.text,
      position: c.position,
      votes: counts ? (counts.get(c.id) ?? 0) : null,
    })),
    mine,
    winnerId,
    locked,
  };
}

export type ThemeOutcome<T = object> =
  | ({
      ok: true;
    } & T)
  | {
      ok: false;
      error: string;
      status: number;
      /** Set where the refusal has a registered code (the shortlist edit's refusals). */
      code?: ErrorCode;
    };

/** Replace a member's marks. Votes only during voting; the cap is re-checked under the member's lock. */
export async function castVotes(
  slug: string,
  userId: string,
  candidateIds: readonly string[],
  now: Date = new Date(),
): Promise<
  ThemeOutcome<{
    mine: string[];
  }>
> {
  const marks = normaliseMarks(candidateIds);
  if (!marks.ok)
    return {
      ok: false,
      error: 'You can mark up to 3 themes',
      status: 400,
    };
  const found = await prisma.gameJam.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
    },
  });
  if (!found)
    return {
      ok: false,
      error: 'Jam not found',
      status: 404,
    };
  return prisma.$transaction(
    async (
      tx,
    ): Promise<
      ThemeOutcome<{
        mine: string[];
      }>
    > => {
      // The shortlist lock first (an admin edit takes the same one), then the member's own.
      await lockKey(tx, candidatesLockKey(found.id));
      await lockKey(tx, voteLockKey(found.id, userId));
      const jam = await tx.gameJam.findUnique({
        where: {
          id: found.id,
        },
        select: JAM_VOTE_SELECT,
      });
      if (!jam)
        return {
          ok: false,
          error: 'Jam not found',
          status: 404,
        };
      const phase = themeVotingPhase(jam, now);
      if (phase === 'none')
        return {
          ok: false,
          error: 'This jam has no theme vote',
          status: 404,
        };
      if (phase === 'before')
        return {
          ok: false,
          error: 'Theme voting has not opened',
          status: 409,
        };
      if (phase === 'closed')
        return {
          ok: false,
          error: 'Theme voting is closed',
          status: 409,
        };
      const user = await tx.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          bannedUntil: true,
        },
      });
      if (user?.bannedUntil && user.bannedUntil.getTime() > now.getTime()) {
        return {
          ok: false,
          error: 'You cannot vote right now',
          status: 403,
        };
      }
      const valid = await tx.gameJamThemeCandidate.findMany({
        where: {
          jamId: jam.id,
          id: {
            in: marks.ids,
          },
        },
        select: {
          id: true,
        },
      });
      if (valid.length !== marks.ids.length)
        return {
          ok: false,
          error: 'Pick themes from the shortlist',
          status: 400,
        };
      await tx.gameJamThemeVote.deleteMany({
        where: {
          jamId: jam.id,
          userId,
          candidateId: {
            notIn: marks.ids,
          },
        },
      });
      if (marks.ids.length > 0) {
        await tx.gameJamThemeVote.createMany({
          data: marks.ids.map((candidateId) => ({
            jamId: jam.id,
            candidateId,
            userId,
          })),
          skipDuplicates: true,
        });
      }
      // Re-check the cap under the lock, in the same transaction as the write.
      const total = await tx.gameJamThemeVote.count({
        where: {
          jamId: jam.id,
          userId,
        },
      });
      if (total > 3) throw new Error('theme mark cap exceeded');
      return {
        ok: true,
        mine: marks.ids,
      };
    },
  );
}

/** Admin: replace the shortlist. Refused once a mark exists, after the start, and for a jam without voting. */
export async function setCandidates(adminId: string, slug: string, raw: readonly string[]): Promise<ThemeOutcome> {
  const valid = validateCandidates(raw);
  if (!valid.ok)
    return {
      ok: false,
      error: CANDIDATE_PROBLEM_MESSAGE[valid.problem],
      status: 400,
    };
  const found = await prisma.gameJam.findUnique({
    where: {
      slug,
    },
    select: {
      id: true,
    },
  });
  if (!found)
    return {
      ok: false,
      error: 'Jam not found',
      status: 404,
    };
  return prisma.$transaction(async (tx): Promise<ThemeOutcome> => {
    await lockKey(tx, candidatesLockKey(found.id));
    const jam = await tx.gameJam.findUnique({
      where: {
        id: found.id,
      },
      select: JAM_VOTE_SELECT,
    });
    if (!jam?.themeVoting)
      return {
        ok: false,
        error: 'This jam has no theme vote',
        status: 404,
      };
    if (jam.themeResolvedAt || jam.startsAt.getTime() <= Date.now()) {
      return {
        ok: false,
        error: ERROR_CODES.JAM_EDIT_LOCKED.text,
        status: 409,
        code: 'JAM_EDIT_LOCKED',
      };
    }
    if (
      (await tx.gameJamThemeVote.count({
        where: {
          jamId: jam.id,
        },
      })) > 0
    ) {
      return {
        ok: false,
        error: ERROR_CODES.JAM_SHORTLIST_LOCKED.text,
        status: 409,
        code: 'JAM_SHORTLIST_LOCKED',
      };
    }
    await tx.gameJamThemeCandidate.deleteMany({
      where: {
        jamId: jam.id,
      },
    });
    await tx.gameJamThemeCandidate.createMany({
      data: valid.texts.map((text, position) => ({
        jamId: jam.id,
        text,
        position,
      })),
    });
    await tx.gameJam.update({
      where: {
        id: jam.id,
      },
      data: {
        theme: valid.texts[0]!,
      },
    });
    await recordAdminActionIn(tx, adminId, 'jam.theme-candidates', {
      targetType: 'game_jam',
      targetId: jam.id,
      detail: `${valid.texts.length} candidates`,
    });
    return {
      ok: true,
    };
  });
}

/** Tell each member who marked a candidate what the theme is (once, after the claim). Best effort per member. */
async function notifyVoters(
  jam: {
    id: string;
    slug: string;
    title: string;
  },
  theme: string,
  now: Date,
): Promise<void> {
  let after: string | undefined;
  for (;;) {
    const page = await prisma.gameJamThemeVote.findMany({
      where: {
        jamId: jam.id,
        user: notBanned(now),
        ...(after
          ? {
              userId: {
                gt: after,
              },
            }
          : {}),
      },
      distinct: ['userId'],
      orderBy: {
        userId: 'asc',
      },
      take: VOTER_PAGE,
      select: {
        userId: true,
      },
    });
    if (page.length === 0) return;
    await Promise.allSettled(
      page.map((v) =>
        createNotification({
          userId: v.userId,
          type: 'SYSTEM',
          entityType: 'jam_theme',
          entityId: jam.id,
          preview: notice('jam-theme-revealed', { jam: jam.title, theme }),
          link: `/jams/${jam.slug}`,
        }),
      ),
    );
    after = page[page.length - 1]!.userId;
    if (page.length < VOTER_PAGE) return;
  }
}

/**
 * Resolve every voting jam whose start has passed. Each is claimed with a conditional `updateMany` (theme and
 * `themeResolvedAt` in one statement), so concurrent runs resolve and notify a jam once. Returns the claimed count.
 */
export async function resolveDueThemes(now: Date = new Date()): Promise<number> {
  const due = await prisma.gameJam.findMany({
    where: {
      themeVoting: true,
      themeResolvedAt: null,
      startsAt: {
        lte: now,
      },
    },
    orderBy: {
      startsAt: 'asc',
    },
    take: RESOLVE_BATCH,
    select: {
      id: true,
      slug: true,
      title: true,
      theme: true,
    },
  });
  let claimed = 0;
  for (const jam of due) {
    const winner = await computeWinner(prisma, jam.id, now);
    const theme = winner?.text ?? jam.theme;
    const { count } = await prisma.gameJam.updateMany({
      where: {
        id: jam.id,
        themeResolvedAt: null,
      },
      data: {
        theme,
        themeResolvedAt: now,
      },
    });
    if (count !== 1) continue;
    claimed += 1;
    await notifyVoters(jam, theme, now).catch(() => undefined);
  }
  return claimed;
}

/** Every minute, reveal the theme of each voting jam that has started. Registered from server/jobs/index.ts. */
export async function registerJamThemeCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(JAM_THEME_QUEUE);
  await boss.schedule(
    JAM_THEME_QUEUE,
    JAM_THEME_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(JAM_THEME_QUEUE, async () => {
    await resolveDueThemes();
  });
}

/** Account deletion: the member's marks go (anonymisation never fires the cascade). */
export function jamThemeErasureOps(userId: string) {
  return [
    prisma.gameJamThemeVote.deleteMany({
      where: {
        userId,
      },
    }),
  ];
}

/** The account export: the jams and themes the member marked. */
export async function exportJamThemeVotes(userId: string) {
  const rows = await prisma.gameJamThemeVote.findMany({
    where: {
      userId,
    },
    orderBy: {
      createdAt: 'asc',
    },
    select: {
      createdAt: true,
      jam: {
        select: {
          slug: true,
          title: true,
        },
      },
      candidate: {
        select: {
          text: true,
        },
      },
    },
  });
  return rows.map((r) => ({
    jamSlug: r.jam.slug,
    jamTitle: r.jam.title,
    theme: r.candidate.text,
    votedAt: r.createdAt.toISOString(),
  }));
}
