/**
 * A member's own applicant stats (phase D, owner 2026-11-24). Private only: every function takes the caller's `userId`
 * and reaches rows only through it, so another member's stats cannot be read or written. Nothing here is cached,
 * aggregated, counted or logged; no public reader imports this module (`api/builder/boundary.test.ts`). The list builder
 * reads the few figures it needs through `statsForBuilder`, and only when the member ticked "Use my stats".
 *
 * Reads are flat (profile, then children) with explicit selects. A save replaces the whole stats in one transaction under
 * the per-member advisory lock `med-stats:<user>`, so two tabs end equal to one of them, never a mix. Home state is the
 * preference (`MedUserPrefs.homeState`), written there.
 */
import { prisma } from '@/lib/prisma.server';
import {
  HOURS_CATEGORIES,
  MISSIONS,
  latestMcat,
  type ApplicantStats,
  type GraduateType,
  type HoursCategory,
  type Mission,
  type PostbaccType,
  type StatsHours,
} from '../engine/applicant';
import { normalizeHomeState } from '../engine/tracker';
import type { MedStatsRes } from '../medschools.contract';
import type { PutStatsBody } from './stats-schemas';

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function lock(tx: Tx, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`med-stats:${userId}`}, 0))`;
}

const pick = <T extends string>(list: readonly T[], v: unknown): T | null =>
  (list as readonly unknown[]).includes(v) ? (v as T) : null;

/** The caller's stats, or null when they have none; and whether the onboarding step is still to be offered. */
export async function getStats(userId: string): Promise<MedStatsRes> {
  const [row, prefs] = await Promise.all([
    prisma.medApplicantProfile.findUnique({
      where: { userId },
      select: {
        gpaCumulative: true,
        gpaScience: true,
        gpaPostbacc: true,
        postbaccType: true,
        gpaGraduate: true,
        graduateType: true,
        missions: true,
        publications: true,
        presentations: true,
        onboardedAt: true,
      },
    }),
    prisma.medUserPrefs.findUnique({ where: { userId }, select: { homeState: true } }),
  ]);
  const home = normalizeHomeState(prefs?.homeState ?? null);
  const homeState = home === 'invalid' ? null : home;
  if (!row) return { stats: null, onboarding: 'pending', homeState };
  const [attempts, hours, activities] = await Promise.all([
    prisma.medMcatAttempt.findMany({
      where: { profileId: userId },
      select: {
        year: true,
        month: true,
        day: true,
        total: true,
        cpbs: true,
        cars: true,
        bbls: true,
        psbb: true,
        position: true,
      },
    }),
    prisma.medApplicantHours.findMany({
      where: { profileId: userId },
      select: { category: true, hours: true, note: true },
    }),
    prisma.medApplicantActivity.findMany({
      where: { profileId: userId },
      select: { category: true, title: true, hours: true, note: true, position: true },
    }),
  ]);
  const byPos = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
  const rows: StatsHours[] = HOURS_CATEGORIES.flatMap((category): StatsHours[] => {
    const h = hours.find((x) => x.category === category);
    const acts = activities
      .filter((a) => a.category === category)
      .sort(byPos)
      .map((a) => ({ title: a.title, hours: a.hours ?? null, note: a.note ?? null }));
    if (!h && acts.length === 0) return [];
    return [{ category, hours: h?.hours ?? null, note: h?.note ?? null, activities: acts }];
  });
  const stats: ApplicantStats = {
    mcat: [...attempts]
      .sort(byPos)
      .map((a) => ({
        year: a.year,
        month: a.month,
        day: a.day ?? null,
        total: a.total ?? null,
        cpbs: a.cpbs ?? null,
        cars: a.cars ?? null,
        bbls: a.bbls ?? null,
        psbb: a.psbb ?? null,
      })),
    gpa: {
      cumulative: row.gpaCumulative ?? null,
      science: row.gpaScience ?? null,
      postbacc: row.gpaPostbacc ?? null,
      postbaccType: pick<PostbaccType>(['FORMAL', 'INFORMAL'], row.postbaccType),
      graduate: row.gpaGraduate ?? null,
      graduateType: pick<GraduateType>(['SMP', 'MASTERS', 'OTHER'], row.graduateType),
    },
    hours: rows,
    homeState,
    missions: (row.missions ?? []).filter((m): m is Mission => (MISSIONS as readonly string[]).includes(m)),
    publications: row.publications ?? null,
    presentations: row.presentations ?? null,
  };
  return { stats, onboarding: row.onboardedAt ? 'done' : 'pending', homeState };
}

/** Replace the caller's stats with the body (already validated by `putStatsBody`) and mark onboarding done. */
export async function putStats(userId: string, body: PutStatsBody, now: Date = new Date()): Promise<MedStatsRes> {
  const g = body.gpa ?? {};
  const data = {
    gpaCumulative: g.cumulative ?? null,
    gpaScience: g.science ?? null,
    gpaPostbacc: g.postbacc ?? null,
    postbaccType: g.postbaccType ?? null,
    gpaGraduate: g.graduate ?? null,
    graduateType: g.graduateType ?? null,
    missions: body.missions ?? [],
    publications: body.publications ?? null,
    presentations: body.presentations ?? null,
  };
  await prisma.$transaction(async (tx) => {
    await lock(tx, userId);
    const had = await tx.medApplicantProfile.findUnique({ where: { userId }, select: { onboardedAt: true } });
    await tx.medApplicantProfile.upsert({
      where: { userId },
      create: { userId, ...data, onboardedAt: now },
      update: { ...data, onboardedAt: had?.onboardedAt ?? now },
    });
    await tx.medMcatAttempt.deleteMany({ where: { profileId: userId } });
    await tx.medApplicantHours.deleteMany({ where: { profileId: userId } });
    await tx.medApplicantActivity.deleteMany({ where: { profileId: userId } });
    const attempts = body.mcat ?? [];
    if (attempts.length) {
      await tx.medMcatAttempt.createMany({
        data: attempts.map((a, position) => ({ profileId: userId, ...a, position })),
      });
    }
    const hours = (body.hours ?? []).filter((h) => h.hours !== null || h.note !== null);
    if (hours.length) {
      await tx.medApplicantHours.createMany({
        data: hours.map((h) => ({ profileId: userId, category: h.category, hours: h.hours, note: h.note })),
      });
    }
    const acts = (body.hours ?? []).flatMap((h) => h.activities.map((a) => ({ ...a, category: h.category })));
    if (acts.length) {
      await tx.medApplicantActivity.createMany({
        data: acts.map((a, position) => ({
          profileId: userId,
          category: a.category,
          title: a.title,
          hours: a.hours,
          note: a.note,
          position,
        })),
      });
    }
    if (body.homeState !== undefined) {
      const home = normalizeHomeState(body.homeState);
      if (home === 'invalid') throw new Error('homeState must be validated by the schema');
      await tx.medUserPrefs.upsert({ where: { userId }, create: { userId, homeState: home }, update: { homeState: home } });
    }
  });
  return getStats(userId);
}

/**
 * Remove every stat the caller entered (the row's figures and its children). The onboarding stays done, so the step is
 * not offered again; the home-state preference is left alone (it belongs to the preferences).
 */
export async function clearStats(userId: string, now: Date = new Date()): Promise<MedStatsRes> {
  await prisma.$transaction(async (tx) => {
    await lock(tx, userId);
    await tx.medApplicantProfile.deleteMany({ where: { userId } });
    await tx.medApplicantProfile.create({ data: { userId, onboardedAt: now } });
  });
  return getStats(userId);
}

/** "Skip for now": remembered on the account (a row with nothing in it but `onboardedAt`). */
export async function skipOnboarding(userId: string, now: Date = new Date()): Promise<MedStatsRes> {
  await prisma.$transaction(async (tx) => {
    await lock(tx, userId);
    const had = await tx.medApplicantProfile.findUnique({ where: { userId }, select: { onboardedAt: true } });
    await tx.medApplicantProfile.upsert({
      where: { userId },
      create: { userId, onboardedAt: now },
      update: { onboardedAt: had?.onboardedAt ?? now },
    });
  });
  return getStats(userId);
}

/** What the builder may send: the figures it needs, never a note or an activity title. */
export interface BuilderStats {
  mcat: { total: number; year: number; month: number } | null;
  gpaCumulative: number | null;
  gpaScience: number | null;
  homeState: string | null;
  hours: { category: HoursCategory; hours: number }[];
  missions: Mission[];
}

/** The caller's figures for one build; null when they have entered nothing the builder uses. */
export async function statsForBuilder(userId: string): Promise<BuilderStats | null> {
  const { stats, homeState } = await getStats(userId);
  if (!stats) {
    return homeState ? { mcat: null, gpaCumulative: null, gpaScience: null, homeState, hours: [], missions: [] } : null;
  }
  const m = latestMcat(stats.mcat);
  return {
    mcat: m && m.total !== null ? { total: m.total, year: m.year, month: m.month } : null,
    gpaCumulative: stats.gpa.cumulative,
    gpaScience: stats.gpa.science,
    homeState,
    hours: stats.hours.flatMap((h) => (h.hours !== null ? [{ category: h.category, hours: h.hours }] : [])),
    missions: stats.missions,
  };
}
