/**
 * The aggregate wait curves of phase 5 (D5-D7): a Kaplan-Meier "complete to interview invite" step function per school x
 * program, from the private tracker rows of members who share. Written by the forecast job, never by a request.
 *
 * Anonymity (R13): a curve exists only when at least `KM_MIN_MEMBERS` (20) DISTINCT members have a valid observation for
 * that school x program (one member with two cycles counts once) and at least `KM_MIN_INVITES` (10) of the observations
 * are invites. Times are whole weeks, the steps carry their at-risk count, `maxDay` is the last week with at least 10 at
 * risk, and a stored curve is replaced only when invites or members moved by at least `KM_REFRESH_DELTA` (3), so one new
 * invite never shows up as a new step the next day. Hysteresis: a curve is CREATED only at `KM_CREATE_MEMBERS` (23) members and
 * `KM_CREATE_INVITES` (13) invites, while it is deleted below 20 and 10, so delete-then-recreate cannot yield a new curve one
 * member away from the last. What is stored is a count of members, a count of invites and
 * the step function; no row, member, application or date of any one contribution survives this module. The member id in
 * a `TrackerObservationRow` lives in memory for one run and is never logged, stored or thrown; a failing query is
 * reported with a fixed message because a database error can carry bound values.
 */
import type { PrismaClient } from '@prisma/client';
import {
  KM_CREATE_INVITES,
  KM_CREATE_MEMBERS,
  KM_MIN_INVITES,
  KM_MIN_MEMBERS,
  KM_REFRESH_DELTA,
} from '../engine/stats/constants';
import { binObs, kaplanMeier, maxDayOf, observationOf, type Obs, type SurvivalCurve } from '../engine/stats/km';
import type { Logger, MedPrisma } from './types';

/** One flat row per application with a COMPLETE date, in a cycle whose owner shares. */
export interface TrackerObservationRow {
  schoolId: string;
  program: 'REG' | 'PHD';
  /** The user id: in memory for this run only. */
  member: string;
  completeOn: string;
  inviteOn: string | null;
  endOn: string | null;
}

export interface WaitCurveResult {
  schoolId: string;
  program: 'REG' | 'PHD';
  members: number;
  invited: number;
  maxDay: number;
  curve: SurvivalCurve;
}

/**
 * One statement. Sharing cycles only (`"shareAnonymously" = true`), active schools only; a complete date is required (COMPLETE, or SECONDARY_SUBMITTED
 * when the member entered no COMPLETE, the chance line's rule, `completeDateOf`), the
 * INTERVIEW date is the event, and the earliest REJECTION, WITHDRAWN or ACCEPTANCE date is the censoring date.
 */
export async function loadObservationRows(db: Pick<PrismaClient, '$queryRaw'>): Promise<TrackerObservationRow[]> {
  try {
    return await db.$queryRaw<TrackerObservationRow[]>`
      SELECT a."schoolId" AS "schoolId",
             a."program"::text AS "program",
             c."userId" AS "member",
             to_char(COALESCE(comp."date", sec."date"), 'YYYY-MM-DD') AS "completeOn",
             to_char(inv."date", 'YYYY-MM-DD') AS "inviteOn",
             to_char(en."endDate", 'YYYY-MM-DD') AS "endOn"
      FROM "med_tracker_cycle" c
      JOIN "med_tracker_application" a ON a."cycleId" = c."id"
      JOIN "med_school" s ON s."id" = a."schoolId" AND s."active" = true
      LEFT JOIN "med_tracker_milestone" comp
        ON comp."applicationId" = a."id" AND comp."type" = 'COMPLETE'::"MedMilestoneType"
      LEFT JOIN "med_tracker_milestone" sec
        ON sec."applicationId" = a."id" AND sec."type" = 'SECONDARY_SUBMITTED'::"MedMilestoneType"
      LEFT JOIN "med_tracker_milestone" inv
        ON inv."applicationId" = a."id" AND inv."type" = 'INTERVIEW'::"MedMilestoneType"
      LEFT JOIN LATERAL (
        SELECT min(e."date") AS "endDate"
        FROM "med_tracker_milestone" e
        WHERE e."applicationId" = a."id"
          AND e."type" IN ('REJECTION'::"MedMilestoneType", 'WITHDRAWN'::"MedMilestoneType", 'ACCEPTANCE'::"MedMilestoneType")
      ) en ON true
      WHERE c."shareAnonymously" = true
        AND COALESCE(comp."date", sec."date") IS NOT NULL`;
  } catch {
    // A database error can carry bound values; say nothing about them.
    throw new Error('wait-curve query failed');
  }
}

export function buildWaitCurves(rows: readonly TrackerObservationRow[], asOf: string): WaitCurveResult[] {
  const groups = new Map<string, { schoolId: string; program: 'REG' | 'PHD'; obs: Obs[]; members: Set<string> }>();
  for (const r of rows) {
    const o = observationOf({ completeOn: r.completeOn, inviteOn: r.inviteOn, endOn: r.endOn }, asOf);
    if (!o) continue; // a dropped observation neither feeds the curve nor counts toward the floor
    const key = `${r.schoolId}|${r.program}`;
    const g = groups.get(key) ?? { schoolId: r.schoolId, program: r.program, obs: [], members: new Set<string>() };
    g.obs.push(o);
    g.members.add(r.member);
    groups.set(key, g);
  }
  const out: WaitCurveResult[] = [];
  for (const g of [...groups.values()].sort((a, b) =>
    `${a.schoolId}|${a.program}`.localeCompare(`${b.schoolId}|${b.program}`),
  )) {
    if (g.members.size < KM_MIN_MEMBERS) continue;
    const binned = g.obs.map(binObs);
    const invited = binned.filter((o) => o.event).length;
    if (invited < KM_MIN_INVITES) continue;
    out.push({
      schoolId: g.schoolId,
      program: g.program,
      members: g.members.size,
      invited,
      maxDay: maxDayOf(binned),
      curve: kaplanMeier(binned),
    });
  }
  return out;
}

/** True when a stored row is in the current shape (steps carry `n`), so an old row is rebuilt rather than kept. */
const currentShape = (json: unknown): boolean => {
  const c = json as { t?: unknown; n?: unknown } | null;
  return !!c && Array.isArray(c.t) && Array.isArray(c.n) && c.t.length === c.n.length;
};

/** Delta k-anonymity (R13): replace only when at least 3 invites or members differ from the stored curve. */
/** A new curve (no stored row) needs the floors plus the refresh delta; a stored one follows `worthRefreshing` (hysteresis). */
export function worthCreating(next: { invited: number; members: number }): boolean {
  return next.members >= KM_CREATE_MEMBERS && next.invited >= KM_CREATE_INVITES;
}

export function worthRefreshing(
  stored: { invited: number; members: number; curve: unknown },
  next: { invited: number; members: number },
): boolean {
  if (!currentShape(stored.curve)) return true;
  return (
    Math.abs(next.invited - stored.invited) >= KM_REFRESH_DELTA ||
    Math.abs(next.members - stored.members) >= KM_REFRESH_DELTA
  );
}

export async function runWaitCurves(deps: {
  prisma: MedPrisma;
  db: Pick<PrismaClient, '$queryRaw'>;
  asOf: string;
  log: Logger;
}): Promise<{ curves: number; removed: number; kept: number }> {
  const { prisma, db, asOf, log } = deps;
  const curves = buildWaitCurves(await loadObservationRows(db), asOf);
  const asOfDate = new Date(`${asOf}T00:00:00.000Z`);
  // The interactive transaction reads every stored row and writes each changed one: more than Prisma's 5 s default.
  const { removed, kept } = await prisma.$transaction(
    async (tx) => {
      const stored = await tx.medWaitCurve.findMany({
        select: { schoolId: true, program: true, invited: true, members: true, curve: true },
      });
      const had = new Map(stored.map((s) => [`${s.schoolId}|${s.program}`, s] as const));
      let keptRows = 0;
      for (const c of curves) {
        const old = had.get(`${c.schoolId}|${c.program}`);
        if (!old && !worthCreating(c)) continue; // over the floors, not yet over the creation margin: no row
        if (old && !worthRefreshing(old, c)) {
          keptRows += 1; // unchanged on purpose: the stored curve stays exactly as the members last saw it
          continue;
        }
        const data = { asOf: asOfDate, members: c.members, invited: c.invited, maxDay: c.maxDay, curve: c.curve };
        await tx.medWaitCurve.upsert({
          where: { schoolId_program: { schoolId: c.schoolId, program: c.program } },
          create: { schoolId: c.schoolId, program: c.program, ...data },
          update: { ...data, computedAt: new Date() },
        });
      }
      // A pair that fell under a floor (a member turned sharing off, or left) loses its row at this run, at once.
      const gone = await tx.medWaitCurve.deleteMany({
        where: { NOT: curves.map((c) => ({ schoolId: c.schoolId, program: c.program })) },
      });
      return { removed: gone.count, kept: keptRows };
    },
    { timeout: 60000, maxWait: 10000 },
  );
  log.info(`wait-curves: curves=${curves.length} kept=${kept} removed=${removed}`);
  return { curves: curves.length, removed, kept };
}
