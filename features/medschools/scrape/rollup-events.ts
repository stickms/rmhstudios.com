/**
 * Inline roll-up of stored per-event rows into `MedCycleCount` (spec §4a): one count per
 * (school, program, cycle year, UTC day, event type) for a single source. Events with no
 * program are never counted, so MD and MD-PhD curves cannot be contaminated by unlabelled rows.
 * The count rows are recomputed from the stored events of each touched cell, so a re-run is a no-op.
 */
import { diffCounts, type CountRow } from '../engine/diff';
import type { MedProgram, MedSource } from '../engine/types';
import type { MedPrisma } from './types';

export interface TouchedCell {
  schoolId: string;
  program: MedProgram;
  cycleYear: number;
  /** YYYY-MM-DD, UTC. */
  date: string;
}

const DAY_MS = 86_400_000;
const dayOf = (d: Date): string => d.toISOString().slice(0, 10);
const cellKey = (c: { schoolId: string; program: MedProgram; cycleYear: number; date: string }): string =>
  `${c.schoolId}|${c.program}|${c.cycleYear}|${c.date}`;

/** Returns the number of count rows created plus updated. */
export async function rollupEventCounts(
  prisma: MedPrisma,
  args: {
    source: MedSource;
    touched: TouchedCell[];
  },
): Promise<number> {
  const { source, touched } = args;
  if (touched.length === 0) return 0;

  const cells = new Map<string, TouchedCell>();
  for (const c of touched) cells.set(cellKey(c), c);
  const schoolIds = [...new Set(touched.map((c) => c.schoolId))];
  const days = touched.map((c) => c.date).sort();
  const from = new Date(`${days[0]}T00:00:00.000Z`);
  const to = new Date(new Date(`${days[days.length - 1]}T00:00:00.000Z`).getTime() + DAY_MS);

  const events = await prisma.medCycleEvent.findMany({
    where: {
      schoolId: {
        in: schoolIds,
      },
      source,
      occurredAt: {
        gte: from,
        lt: to,
      },
      program: {
        not: null,
      },
    },
  });
  // school -> incoming rows, counted per (program, cycleYear, day, type) within touched cells only.
  const incoming = new Map<string, Map<string, CountRow>>();
  for (const e of events) {
    if (e.program === null) continue;
    const date = dayOf(e.occurredAt);
    if (
      !cells.has(
        cellKey({
          schoolId: e.schoolId,
          program: e.program,
          cycleYear: e.cycleYear,
          date,
        }),
      )
    )
      continue;
    const bySchool = incoming.get(e.schoolId) ?? new Map<string, CountRow>();
    incoming.set(e.schoolId, bySchool);
    const k = `${e.program}|${e.cycleYear}|${date}|${e.eventType}`;
    const row = bySchool.get(k);
    if (row) row.count++;
    else
      bySchool.set(k, {
        program: e.program,
        cycleYear: e.cycleYear,
        date,
        eventType: e.eventType,
        count: 1,
      });
  }

  const existing = await prisma.medCycleCount.findMany({
    where: {
      schoolId: {
        in: schoolIds,
      },
      source,
      date: {
        gte: from,
        lt: to,
      },
    },
  });

  let written = 0;
  for (const schoolId of schoolIds) {
    const prior: CountRow[] = existing
      .filter(
        (r) =>
          r.schoolId === schoolId &&
          cells.has(
            cellKey({
              schoolId,
              program: r.program,
              cycleYear: r.cycleYear,
              date: dayOf(r.date),
            }),
          ),
      )
      .map((r) => ({
        id: r.id,
        program: r.program,
        cycleYear: r.cycleYear,
        date: dayOf(r.date),
        eventType: r.eventType,
        count: r.count,
      }));
    const { toCreate, toUpdate } = diffCounts(prior, [...(incoming.get(schoolId)?.values() ?? [])]);
    if (toCreate.length > 0) {
      await prisma.medCycleCount.createMany({
        data: toCreate.map((r) => ({
          schoolId,
          program: r.program,
          cycleYear: r.cycleYear,
          date: new Date(`${r.date}T00:00:00.000Z`),
          eventType: r.eventType,
          source,
          count: r.count,
          contributors: null,
        })),
        skipDuplicates: true,
      });
      written += toCreate.length;
    }
    for (const r of toUpdate) {
      await prisma.medCycleCount.update({
        where: {
          id: r.id,
        },
        data: {
          count: r.count,
        },
      });
      written++;
    }
  }
  return written;
}
