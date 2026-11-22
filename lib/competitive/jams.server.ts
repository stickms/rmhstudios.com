import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import {
  canRate,
  canSubmit,
  JAM_CATEGORIES,
  jamPhase,
  overall,
  themeVisible,
  type Averages,
  type JamCategory,
} from './jam';
import {
  alreadyOnEntryMessage,
  conflictingPlacement,
  discountTeamRatings,
  mayRateEntry,
  resolveTeamState,
} from './jam-teams';
import { memberLockName, placementsOf } from './jam-teams.server';
import { FEEDBACK_MAX, FEEDBACK_MIN, feedbackIntent } from './jam-feedback';
import { effectiveThemes } from './jam-themes.server';
import { resolveVoteOpensAt, themeVotingPhase, validateCandidates, CANDIDATE_PROBLEM_MESSAGE } from './jam-themes';
import { feedbackCounts, myFeedbackFor, notifyTeamOfFeedback, saveFeedback, type FeedbackSaveOutcome } from './jam-feedback.server';

const ENTRY_CAP = 200;

function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${base || 'jam'}-${Math.random().toString(36).slice(2, 7)}`;
}

export async function createJam(
  userId: string,
  input: {
    title: string;
    description: string;
    theme: string;
    startsAt: Date;
    submitEndsAt: Date;
    ratingEndsAt: Date;
    /** s07-07: opt-in theme vote. */
    themeVoting?: boolean | undefined;
    themeCandidates?: string[] | undefined;
    themeVoteOpensAt?: Date | undefined;
  },
) {
  const { themeVoting, themeCandidates, themeVoteOpensAt, ...core } = input;
  if (!(core.startsAt < core.submitEndsAt && core.submitEndsAt < core.ratingEndsAt)) {
    return { ok: false as const, error: 'Dates must run start < submissions close < rating close' };
  }
  if (!themeVoting) {
    const jam = await prisma.gameJam.create({
      data: { ...core, slug: slugify(core.title), createdById: userId },
      select: { slug: true },
    });
    return { ok: true as const, slug: jam.slug };
  }
  const valid = validateCandidates(themeCandidates ?? []);
  if (!valid.ok) return { ok: false as const, error: CANDIDATE_PROBLEM_MESSAGE[valid.problem] };
  const opensAt = resolveVoteOpensAt(themeVoteOpensAt, core.startsAt);
  if (!opensAt) return { ok: false as const, error: 'Voting must open before the jam starts' };
  const jam = await prisma.gameJam.create({
    data: {
      ...core,
      // `theme` stays required: the first candidate stands in until the vote resolves at the start.
      theme: valid.texts[0]!,
      themeVoting: true,
      themeVoteOpensAt: opensAt,
      slug: slugify(core.title),
      createdById: userId,
      themeCandidates: { create: valid.texts.map((text, position) => ({ text, position })) },
    },
    select: { slug: true },
  });
  return { ok: true as const, slug: jam.slug };
}

function summary(j: {
  slug: string;
  title: string;
  description: string;
  theme: string;
  startsAt: Date;
  submitEndsAt: Date;
  ratingEndsAt: Date;
  themeVoting: boolean;
  themeVoteOpensAt: Date | null;
}, themeOverride?: string) {
  const now = new Date();
  return {
    slug: j.slug,
    title: j.title,
    description: j.description,
    // The theme never leaves the server before the jam starts.
    // (A voting jam whose claim has not run yet shows the computed winner: `themeOverride`, only ever set after the start.)
    theme: themeVisible(j, now) ? (themeOverride ?? j.theme) : null,
    // s07-07: a voting jam, and whether marks are being taken now. No count or winner is ever part of a summary.
    themeVoting: j.themeVoting,
    themeVoteOpen: themeVotingPhase(j, now) === 'open',
    startsAt: j.startsAt.toISOString(),
    submitEndsAt: j.submitEndsAt.toISOString(),
    ratingEndsAt: j.ratingEndsAt.toISOString(),
    phase: jamPhase(j, now),
  };
}

export async function listJams() {
  const rows = await prisma.gameJam.findMany({
    orderBy: { startsAt: 'desc' },
    take: 30,
  });
  const computed = await effectiveThemes(rows);
  return rows.map((r) => summary(r, computed.get(r.id)));
}

export async function getJam(slug: string, viewerId: string | null) {
  const jam = await prisma.gameJam.findUnique({ where: { slug } });
  if (!jam) return null;
  const phase = jamPhase(jam);
  const base = summary(jam, (await effectiveThemes([jam])).get(jam.id));
  if (phase === 'upcoming') {
    return {
      ...base,
      entries: [],
      myEntryId: null,
      teamEntryId: null,
      myRatings: {},
      myFeedback: {} as Awaited<ReturnType<typeof myFeedbackFor>>,
      myBuilds: [],
      results: false,
    };
  }

  const entries = await prisma.gameJamEntry.findMany({
    where: { jamId: jam.id },
    orderBy: { createdAt: 'asc' },
    take: ENTRY_CAP,
    select: {
      id: true,
      userId: true,
      build: { select: { slug: true, title: true, description: true, thumbnailUrl: true } },
      user: { select: userDisplaySelect },
    },
  });

  // Accepted teammates are credited on every entry; the viewer also reads their own pending invitation.
  const teamRows = await prisma.gameJamTeamMember.findMany({
    where: {
      jamId: jam.id,
      OR: [{ status: 'accepted' }, ...(viewerId ? [{ userId: viewerId }] : [])],
    },
    orderBy: [{ invitedAt: 'asc' }, { userId: 'asc' }],
    select: { entryId: true, userId: true, status: true, user: { select: userDisplaySelect } },
  });
  const acceptedByEntry = new Map<string, typeof teamRows>();
  const viewerStatus = new Map<string, string>();
  for (const r of teamRows) {
    if (r.status === 'accepted') {
      const list = acceptedByEntry.get(r.entryId) ?? [];
      list.push(r);
      acceptedByEntry.set(r.entryId, list);
    }
    if (r.userId === viewerId) viewerStatus.set(r.entryId, r.status);
  }

  const results = phase === 'done';
  const avgByEntry = new Map<string, { avg: Averages; count: number }>();
  if (results) {
    const grouped = await prisma.gameJamRating.groupBy({
      by: ['entryId'],
      where: { entry: { jamId: jam.id } },
      _sum: { fun: true, creativity: true, theme: true, polish: true },
      _count: { _all: true },
    });
    // A team never rates its own entry (`rateEntry` refuses it); the leaderboard drops any such rating regardless.
    const teamPairs = new Set<string>(entries.map((e) => `${e.id}:${e.userId}`));
    for (const r of teamRows) if (r.status === 'accepted') teamPairs.add(`${r.entryId}:${r.userId}`);
    const raterIds = [...new Set([...entries.map((e) => e.userId), ...teamRows.map((r) => r.userId)])];
    const own = await prisma.gameJamRating.findMany({
      where: { entry: { jamId: jam.id }, raterId: { in: raterIds } },
      select: { entryId: true, raterId: true, fun: true, creativity: true, theme: true, polish: true },
    });
    const discounted = discountTeamRatings(
      grouped.map((g) => ({
        entryId: g.entryId,
        count: g._count._all,
        sum: {
          fun: g._sum.fun ?? 0,
          creativity: g._sum.creativity ?? 0,
          theme: g._sum.theme ?? 0,
          polish: g._sum.polish ?? 0,
        },
      })),
      own,
      teamPairs,
    );
    for (const [entryId, v] of discounted) avgByEntry.set(entryId, v);
  }

  const mine = viewerId
    ? await prisma.gameJamRating.findMany({
        where: { raterId: viewerId, entry: { jamId: jam.id } },
        select: { entryId: true, fun: true, creativity: true, theme: true, polish: true },
      })
    : [];
  const myRatings: Record<string, Record<JamCategory, number>> = {};
  for (const r of mine) myRatings[r.entryId] = r;
  // s06-07: the viewer's own feedback (to re-open the form), and the count of feedback on the entry they are on
  // the team of. Nobody else's feedback, and no other entry's count, is ever read here.
  const myFeedback = viewerId ? await myFeedbackFor(viewerId, entries.map((e) => e.id)) : {};
  const teamEntryIds = entries
    .filter((e) => {
      const st = resolveTeamState(e.userId, viewerId, viewerStatus.get(e.id));
      return st === 'owner' || st === 'teammate';
    })
    .map((e) => e.id);
  const feedbackCountByEntry = viewerId ? await feedbackCounts(teamEntryIds) : new Map<string, number>();

  const myBuilds =
    viewerId && canSubmit(phase)
      ? await prisma.userBuild.findMany({
          where: { userId: viewerId, visibility: 'PUBLIC', createdAt: { gte: jam.startsAt } },
          orderBy: { createdAt: 'desc' },
          take: 50,
          select: { id: true, title: true },
        })
      : [];

  const rows = entries.map((e) => {
    const a = avgByEntry.get(e.id);
    const team = (acceptedByEntry.get(e.id) ?? []).map((r) => resolveUser(r.user));
    const viewerTeamState = resolveTeamState(e.userId, viewerId, viewerStatus.get(e.id));
    return {
      id: e.id,
      own: e.userId === viewerId,
      build: e.build,
      user: resolveUser(e.user),
      // Accepted teammates, credited beside the submitter.
      team,
      viewerTeamState,
      // The server's answer to "may the viewer rate this": the control is hidden when it is false, and `rateEntry` refuses regardless.
      rateable:
        canRate(phase) &&
        !!viewerId &&
        mayRateEntry({ userId: e.userId, acceptedIds: (acceptedByEntry.get(e.id) ?? []).map((r) => r.userId) }, viewerId),
      averages: a?.avg ?? null,
      ratingCount: a?.count ?? 0,
      score: overall(a?.avg ?? null),
      // null unless the viewer is the submitter or an accepted teammate: feedback is private to the team.
      feedbackCount: teamEntryIds.includes(e.id) ? (feedbackCountByEntry.get(e.id) ?? 0) : null,
    };
  });
  if (results) rows.sort((x, y) => y.score - x.score || y.ratingCount - x.ratingCount);

  return {
    ...base,
    entries: rows,
    myEntryId: rows.find((r) => r.own)?.id ?? null,
    // The entry the viewer is credited on as a teammate (they cannot submit their own).
    teamEntryId: rows.find((r) => r.viewerTeamState === 'teammate')?.id ?? null,
    myRatings,
    myFeedback,
    myBuilds,
    results,
  };
}

export async function submitEntry(slug: string, userId: string, buildId: string) {
  const jam = await prisma.gameJam.findUnique({ where: { slug } });
  if (!jam) return { ok: false as const, error: 'Jam not found', status: 404 };
  if (!canSubmit(jamPhase(jam))) {
    return { ok: false as const, error: 'Submissions are not open', status: 409 };
  }
  const build = await prisma.userBuild.findUnique({
    where: { id: buildId },
    select: { userId: true, visibility: true, createdAt: true },
  });
  if (!build || build.userId !== userId) {
    return { ok: false as const, error: 'Pick one of your own builds', status: 403 };
  }
  if (build.visibility !== 'PUBLIC') {
    return { ok: false as const, error: 'The build must be public', status: 400 };
  }
  if (build.createdAt < jam.startsAt) {
    return { ok: false as const, error: 'The build must be made during the jam', status: 400 };
  }
  try {
    const placed = await prisma.$transaction(async (tx) => {
      await lockKey(tx, memberLockName(jam.id, userId));
      const mine = await tx.gameJamEntry.findUnique({
        where: { jamId_userId: { jamId: jam.id, userId } },
        select: { id: true },
      });
      // One entry per member per jam: a member credited on someone else's entry cannot submit their own.
      const elsewhere = conflictingPlacement(await placementsOf(tx, jam.id, userId), mine?.id ?? null);
      if (elsewhere) return elsewhere.title;
      await tx.gameJamEntry.upsert({
        where: { jamId_userId: { jamId: jam.id, userId } },
        create: { jamId: jam.id, userId, buildId },
        update: { buildId },
      });
      // Their own entry makes any invitation they still held in this jam unanswerable.
      if (!mine) {
        await tx.gameJamTeamMember.deleteMany({ where: { jamId: jam.id, userId, status: 'invited' } });
      }
      return null;
    });
    if (placed !== null) {
      return { ok: false as const, error: alreadyOnEntryMessage(placed), status: 409 };
    }
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return { ok: false as const, error: 'That build is already entered', status: 409 };
    }
    throw err;
  }
  return { ok: true as const };
}

export async function rateEntry(
  slug: string,
  raterId: string,
  entryId: string,
  scores: Record<JamCategory, number>,
  extras: { feedback?: string | null | undefined; anonymous?: boolean | undefined } = {},
) {
  const entry = await prisma.gameJamEntry.findUnique({
    where: { id: entryId },
    select: {
      userId: true,
      jamId: true,
      jam: { select: { slug: true, startsAt: true, submitEndsAt: true, ratingEndsAt: true } },
    },
  });
  if (!entry || entry.jam.slug !== slug)
    return { ok: false as const, error: 'Entry not found', status: 404 };
  if (!canRate(jamPhase(entry.jam)))
    return { ok: false as const, error: 'Rating is closed', status: 409 };
  if (entry.userId === raterId)
    return { ok: false as const, error: 'You cannot rate your own entry', status: 403 };
  if (feedbackIntent(extras.feedback).kind === 'invalid')
    return {
      ok: false as const,
      error: `Feedback must be ${FEEDBACK_MIN} to ${FEEDBACK_MAX} characters`,
      status: 400,
    };
  const data = Object.fromEntries(JAM_CATEGORIES.map((c) => [c, scores[c]])) as Record<
    JamCategory,
    number
  >;
  // The same lock an accept takes, so a teammate cannot rate between "not on the team" and "on the team".
  let feedbackOutcome = 'unchanged' as FeedbackSaveOutcome;
  const teammate = await prisma.$transaction(async (tx) => {
    await lockKey(tx, memberLockName(entry.jamId, raterId));
    const row = await tx.gameJamTeamMember.findUnique({
      where: { entryId_userId: { entryId, userId: raterId } },
      select: { status: true },
    });
    if (!mayRateEntry({ userId: entry.userId, acceptedIds: row?.status === 'accepted' ? [raterId] : [] }, raterId)) {
      return true;
    }
    const rating = await tx.gameJamRating.upsert({
      where: { entryId_raterId: { entryId, raterId } },
      create: { entryId, raterId, ...data },
      update: data,
      select: { id: true },
    });
    // s06-07: the words are written with the scores, in this transaction.
    if (extras.feedback !== undefined || extras.anonymous !== undefined) {
      feedbackOutcome = await saveFeedback(tx, {
        entry: { id: entryId, userId: entry.userId },
        ratingId: rating.id,
        raterId,
        feedback: extras.feedback,
        anonymous: extras.anonymous,
        now: new Date(),
      });
    }
    return false;
  });
  if (teammate) {
    return { ok: false as const, error: 'You cannot rate your own entry', status: 403 };
  }
  if (feedbackOutcome === 'created') await notifyTeamOfFeedback(entryId, raterId).catch(() => false);
  return { ok: true as const, feedback: feedbackOutcome };
}
