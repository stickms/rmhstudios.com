/**
 * The aggregate wait curves of phase 5 (D5-D7): a Kaplan-Meier "complete to interview invite" step function per school x
 * program, from the private tracker rows of members who share. Written by the forecast job, never by a request.
 *
 * Anonymity: a curve exists only when at least `KM_MIN_MEMBERS` (20) DISTINCT members have a valid observation for that
 * school x program (one member with two cycles counts once). What is stored is a count of members, a count of invites and
 * the step function; no row, member, application or date of any one contribution survives this module. The member id in
 * a `TrackerObservationRow` lives in memory for one run and is never logged, stored or thrown; a failing query is
 * reported with a fixed message because a database error can carry bound values.
 */
import type { PrismaClient } from '@prisma/client';
import { KM_MIN_MEMBERS } from '../engine/stats/constants';
import { kaplanMeier, maxDayOf, observationOf, type Obs, type SurvivalCurve } from '../engine/stats/km';
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
 * One statement. Sharing cycles only (`"shareAnonymously" = true`), active schools only; COMPLETE is required, the
 * INTERVIEW date is the event, and the earliest REJECTION, WITHDRAWN or ACCEPTANCE date is the censoring date.
 */
export async function loadObservationRows(db: Pick<PrismaClient, '$queryRaw'>): Promise<TrackerObservationRow[]> {
  try {
    return await db.$queryRaw<TrackerObservationRow[]>`
      SELECT a."schoolId" AS "schoolId",
             a."program"::text AS "program",
             c."userId" AS "member",
             to_char(comp."date", 'YYYY-MM-DD') AS "completeOn",
             to_char(inv."date", 'YYYY-MM-DD') AS "inviteOn",
             to_char(en."endDate", 'YYYY-MM-DD') AS "endOn"
      FROM "med_tracker_cycle" c
      JOIN "med_tracker_application" a ON a."cycleId" = c."id"
      JOIN "med_school" s ON s."id" = a."schoolId" AND s."active" = true
      JOIN "med_tracker_milestone" comp
        ON comp."applicationId" = a."id" AND comp."type" = 'COMPLETE'::"MedMilestoneType"
      LEFT JOIN "med_tracker_milestone" inv
        ON inv."applicationId" = a."id" AND inv."type" = 'INTERVIEW'::"MedMilestoneType"
      LEFT JOIN LATERAL (
        SELECT min(e."date") AS "endDate"
        FROM "med_tracker_milestone" e
        WHERE e."applicationId" = a."id"
          AND e."type" IN ('REJECTION'::"MedMilestoneType", 'WITHDRAWN'::"MedMilestoneType", 'ACCEPTANCE'::"MedMilestoneType")
      ) en ON true
      WHERE c."shareAnonymously" = true`;
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
    const curve = kaplanMeier(g.obs);
    out.push({
      schoolId: g.schoolId,
      program: g.program,
      members: g.members.size,
      invited: g.obs.filter((o) => o.event).length,
      maxDay: maxDayOf(curve, g.obs),
      curve,
    });
  }
  return out;
}

export async function runWaitCurves(deps: {
  prisma: MedPrisma;
  db: Pick<PrismaClient, '$queryRaw'>;
  asOf: string;
  log: Logger;
}): Promise<{ curves: number; removed: number }> {
  const { prisma, db, asOf, log } = deps;
  const curves = buildWaitCurves(await loadObservationRows(db), asOf);
  const asOfDate = new Date(`${asOf}T00:00:00.000Z`);
  const keep = new Set(curves.map((c) => `${c.schoolId}|${c.program}`));
  const removed = await prisma.$transaction(async (tx) => {
    for (const c of curves) {
      const data = { asOf: asOfDate, members: c.members, invited: c.invited, maxDay: c.maxDay, curve: c.curve };
      await tx.medWaitCurve.upsert({
        where: { schoolId_program: { schoolId: c.schoolId, program: c.program } },
        create: { schoolId: c.schoolId, program: c.program, ...data },
        update: { ...data, computedAt: new Date() },
      });
    }
    // A pair that fell under the floor (a member turned sharing off, or left) loses its row at this run.
    const stored = await tx.medWaitCurve.findMany({ select: { schoolId: true, program: true } });
    let gone = 0;
    for (const s of stored) {
      if (keep.has(`${s.schoolId}|${s.program}`)) continue;
      gone += (await tx.medWaitCurve.deleteMany({ where: { schoolId: s.schoolId, program: s.program } })).count;
    }
    return gone;
  });
  log.info(`wait-curves: curves=${curves.length} removed=${removed}`);
  return { curves: curves.length, removed };
}
