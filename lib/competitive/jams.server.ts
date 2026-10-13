import { prisma } from '@/lib/prisma.server';
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
  },
) {
  if (!(input.startsAt < input.submitEndsAt && input.submitEndsAt < input.ratingEndsAt)) {
    return { ok: false as const, error: 'Dates must run start < submissions close < rating close' };
  }
  const jam = await prisma.gameJam.create({
    data: { ...input, slug: slugify(input.title), createdById: userId },
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
}) {
  const now = new Date();
  return {
    slug: j.slug,
    title: j.title,
    description: j.description,
    // The theme never leaves the server before the jam starts.
    theme: themeVisible(j, now) ? j.theme : null,
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
  return rows.map(summary);
}

export async function getJam(slug: string, viewerId: string | null) {
  const jam = await prisma.gameJam.findUnique({ where: { slug } });
  if (!jam) return null;
  const phase = jamPhase(jam);
  const base = summary(jam);
  if (phase === 'upcoming') {
    return { ...base, entries: [], myEntryId: null, myRatings: {}, myBuilds: [], results: false };
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

  const results = phase === 'done';
  const avgByEntry = new Map<string, { avg: Averages; count: number }>();
  if (results) {
    const grouped = await prisma.gameJamRating.groupBy({
      by: ['entryId'],
      where: { entry: { jamId: jam.id } },
      _avg: { fun: true, creativity: true, theme: true, polish: true },
      _count: { _all: true },
    });
    for (const g of grouped) {
      avgByEntry.set(g.entryId, {
        avg: {
          fun: g._avg.fun ?? 0,
          creativity: g._avg.creativity ?? 0,
          theme: g._avg.theme ?? 0,
          polish: g._avg.polish ?? 0,
        },
        count: g._count._all,
      });
    }
  }

  const mine = viewerId
    ? await prisma.gameJamRating.findMany({
        where: { raterId: viewerId, entry: { jamId: jam.id } },
        select: { entryId: true, fun: true, creativity: true, theme: true, polish: true },
      })
    : [];
  const myRatings: Record<string, Record<JamCategory, number>> = {};
  for (const r of mine) myRatings[r.entryId] = r;

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
    return {
      id: e.id,
      own: e.userId === viewerId,
      build: e.build,
      user: resolveUser(e.user),
      averages: a?.avg ?? null,
      ratingCount: a?.count ?? 0,
      score: overall(a?.avg ?? null),
    };
  });
  if (results) rows.sort((x, y) => y.score - x.score || y.ratingCount - x.ratingCount);

  return {
    ...base,
    entries: rows,
    myEntryId: rows.find((r) => r.own)?.id ?? null,
    myRatings,
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
    await prisma.gameJamEntry.upsert({
      where: { jamId_userId: { jamId: jam.id, userId } },
      create: { jamId: jam.id, userId, buildId },
      update: { buildId },
    });
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
) {
  const entry = await prisma.gameJamEntry.findUnique({
    where: { id: entryId },
    select: {
      userId: true,
      jam: { select: { slug: true, startsAt: true, submitEndsAt: true, ratingEndsAt: true } },
    },
  });
  if (!entry || entry.jam.slug !== slug)
    return { ok: false as const, error: 'Entry not found', status: 404 };
  if (!canRate(jamPhase(entry.jam)))
    return { ok: false as const, error: 'Rating is closed', status: 409 };
  if (entry.userId === raterId)
    return { ok: false as const, error: 'You cannot rate your own entry', status: 403 };
  const data = Object.fromEntries(JAM_CATEGORIES.map((c) => [c, scores[c]])) as Record<
    JamCategory,
    number
  >;
  await prisma.gameJamRating.upsert({
    where: { entryId_raterId: { entryId, raterId } },
    create: { entryId, raterId, ...data },
    update: data,
  });
  return { ok: true as const };
}
