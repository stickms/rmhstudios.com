/**
 * Secondary turnaround (owner 2026-11-23): the whole days between "secondary received" (`SECONDARY`) and "secondary
 * submitted" (`SECONDARY_SUBMITTED`) per school x program, from the private tracker rows of members who share. Written by
 * the forecast job after the wait curves, never by a request. Phase 5's rules carry over (R13):
 *
 *  - a figure exists only when at least `TURNAROUND_MIN_MEMBERS` (20) DISTINCT members have a valid pair of dates for the
 *    school x program; a member with several applications or cycles is one value (their own median), so one person is one
 *    point, and a pair that is negative or over `TURNAROUND_MAX_DAYS` is dropped before the floor, not after;
 *  - what is stored is a member count and three whole-day quantiles (25th, median, 75th, nearest rank): no date, row,
 *    member or application of any one contribution survives this module, and `SECONDARY_SUBMITTED` is never an event;
 *  - a stored figure is replaced only when the member count moved by at least `TURNAROUND_REFRESH_DELTA` (3), so one
 *    new member never shows as a changed figure the next day; a pair that fell under the floor loses its row at once;
 *  - hysteresis: a figure is CREATED only at `TURNAROUND_CREATE_MEMBERS` (23, the floor plus the refresh delta) while it
 *    is deleted below 20, so delete-then-recreate cannot produce a new figure one member away from the last one.
 *
 * The user id in a row lives in memory for one run and is never logged, stored or thrown; a failing query is reported
 * with a fixed message because a database error can carry bound values.
 */
import type { PrismaClient } from '@prisma/client';
import {
  TURNAROUND_CREATE_MEMBERS,
  TURNAROUND_MAX_DAYS,
  TURNAROUND_MIN_MEMBERS,
  TURNAROUND_REFRESH_DELTA,
} from '../engine/stats/constants';
import { dayIndex } from '../engine/stats/days';
import type { Logger, MedPrisma } from './types';

/** One flat row per application with both dates, in a cycle whose owner shares. */
export interface TurnaroundRow {
  schoolId: string;
  program: 'REG' | 'PHD';
  /** The user id: in memory for this run only. */
  member: string;
  receivedOn: string;
  submittedOn: string;
}

export interface TurnaroundResult {
  schoolId: string;
  program: 'REG' | 'PHD';
  members: number;
  p25Days: number;
  medianDays: number;
  p75Days: number;
}

export async function loadTurnaroundRows(db: Pick<PrismaClient, '$queryRaw'>): Promise<TurnaroundRow[]> {
  try {
    return await db.$queryRaw<TurnaroundRow[]>`
      SELECT a."schoolId" AS "schoolId",
             a."program"::text AS "program",
             c."userId" AS "member",
             to_char(rec."date", 'YYYY-MM-DD') AS "receivedOn",
             to_char(sub."date", 'YYYY-MM-DD') AS "submittedOn"
      FROM "med_tracker_cycle" c
      JOIN "med_tracker_application" a ON a."cycleId" = c."id"
      JOIN "med_school" s ON s."id" = a."schoolId" AND s."active" = true
      JOIN "med_tracker_milestone" rec
        ON rec."applicationId" = a."id" AND rec."type" = 'SECONDARY'::"MedMilestoneType"
      JOIN "med_tracker_milestone" sub
        ON sub."applicationId" = a."id" AND sub."type" = 'SECONDARY_SUBMITTED'::"MedMilestoneType"
      WHERE c."shareAnonymously" = true`;
  } catch {
    // A database error can carry bound values; say nothing about them.
    throw new Error('turnaround query failed');
  }
}

/** Nearest-rank quantile of an ascending list. */
const quantile = (sorted: readonly number[], p: number): number =>
  sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))] ?? 0;

const medianOf = (values: readonly number[]): number => {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] ?? 0) : Math.floor(((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2);
};

const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

export function buildTurnarounds(rows: readonly TurnaroundRow[]): TurnaroundResult[] {
  // school|program -> member -> that member's valid day counts
  const groups = new Map<string, { schoolId: string; program: 'REG' | 'PHD'; byMember: Map<string, number[]> }>();
  for (const r of rows) {
    if (!isDay(r.receivedOn) || !isDay(r.submittedOn) || (r.program !== 'REG' && r.program !== 'PHD')) continue;
    const days = dayIndex(r.submittedOn) - dayIndex(r.receivedOn);
    if (!Number.isInteger(days) || days < 0 || days > TURNAROUND_MAX_DAYS) continue; // dropped before the floor
    const key = `${r.schoolId}|${r.program}`;
    const g = groups.get(key) ?? { schoolId: r.schoolId, program: r.program, byMember: new Map<string, number[]>() };
    g.byMember.set(r.member, [...(g.byMember.get(r.member) ?? []), days]);
    groups.set(key, g);
  }
  const out: TurnaroundResult[] = [];
  for (const g of [...groups.values()].sort((a, b) =>
    `${a.schoolId}|${a.program}`.localeCompare(`${b.schoolId}|${b.program}`),
  )) {
    if (g.byMember.size < TURNAROUND_MIN_MEMBERS) continue;
    const perMember = [...g.byMember.values()].map(medianOf).sort((a, b) => a - b);
    out.push({
      schoolId: g.schoolId,
      program: g.program,
      members: perMember.length,
      p25Days: quantile(perMember, 0.25),
      medianDays: quantile(perMember, 0.5),
      p75Days: quantile(perMember, 0.75),
    });
  }
  return out;
}

/** A new figure (no stored row) needs the floor plus the refresh delta; a stored one follows `worthRefreshing`. */
export function worthCreating(next: { members: number }): boolean {
  return next.members >= TURNAROUND_CREATE_MEMBERS;
}

export function worthRefreshing(stored: { members: number }, next: { members: number }): boolean {
  return Math.abs(next.members - stored.members) >= TURNAROUND_REFRESH_DELTA;
}

export async function runTurnaround(deps: {
  prisma: MedPrisma;
  db: Pick<PrismaClient, '$queryRaw'>;
  asOf: string;
  log: Logger;
}): Promise<{ figures: number; removed: number; kept: number }> {
  const { prisma, db, asOf, log } = deps;
  const figures = buildTurnarounds(await loadTurnaroundRows(db));
  const asOfDate = new Date(`${asOf}T00:00:00.000Z`);
  const { removed, kept } = await prisma.$transaction(
    async (tx) => {
      const stored = await tx.medSecondaryTurnaround.findMany({
        select: { schoolId: true, program: true, members: true },
      });
      const had = new Map(stored.map((s) => [`${s.schoolId}|${s.program}`, s] as const));
      let keptRows = 0;
      for (const f of figures) {
        const old = had.get(`${f.schoolId}|${f.program}`);
        if (!old && !worthCreating(f)) continue; // over the floor, not yet over the creation margin: no row
        if (old && !worthRefreshing(old, f)) {
          keptRows += 1; // unchanged on purpose: the stored figure stays exactly as the members last saw it
          continue;
        }
        const data = {
          asOf: asOfDate,
          members: f.members,
          p25Days: f.p25Days,
          medianDays: f.medianDays,
          p75Days: f.p75Days,
        };
        await tx.medSecondaryTurnaround.upsert({
          where: { schoolId_program: { schoolId: f.schoolId, program: f.program } },
          create: { schoolId: f.schoolId, program: f.program, ...data },
          update: { ...data, computedAt: new Date() },
        });
      }
      // A pair that fell under the floor (a member turned sharing off, or left) loses its row at this run, at once.
      const gone =
        figures.length === 0
          ? await tx.medSecondaryTurnaround.deleteMany({ where: {} })
          : await tx.medSecondaryTurnaround.deleteMany({
              where: { NOT: figures.map((f) => ({ schoolId: f.schoolId, program: f.program })) },
            });
      return { removed: gone.count, kept: keptRows };
    },
    { timeout: 60000, maxWait: 10000 },
  );
  log.info(`turnaround: figures=${figures.length} kept=${kept} removed=${removed}`);
  return { figures: figures.length, removed, kept };
}
