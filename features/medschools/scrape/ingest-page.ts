/**
 * Writes one parsed CycleTrack school page into MedCycleCount.
 *
 * Only (program, cycleYear) tables that are present on the page are
 * reconciled. A table missing from the page is not zero: its stored rows stay
 * untouched. A table present with no rows is an observed empty table and may
 * delete stale rows for that program and cycle.
 */
import {
  diffCounts,
  type CountRow,
} from '../engine/diff';
import type { MedPrisma } from './types';
import type { ParsedSchoolPage } from './adapters/cycletrack';

const toDbDate =
  (
    date: string,
  ): Date =>
    new Date(
      `${date}T00:00:00.000Z`,
    );
const fromDbDate =
  (
    d: Date,
  ): string =>
    d
      .toISOString()
      .slice(
        0,
        10,
      );

export async function ingestSchoolPage(
  prisma: MedPrisma,
  schoolId: string,
  page: ParsedSchoolPage,
): Promise<{
  created: number;
  updated: number;
  deleted: number;
}> {
  let created = 0;
  let updated = 0;
  let deleted = 0;

  for (const table of page.tables) {
    const stored =
      await prisma.medCycleCount.findMany(
        {
          where:
            {
              schoolId,
              source:
                'CYCLETRACK',
              program:
                table.program,
              cycleYear:
                table.cycleYear,
            },
        },
      );
    const existing: CountRow[] =
      stored.map(
        (
          r,
        ) => ({
          id: r.id,
          program:
            r.program,
          cycleYear:
            r.cycleYear,
          date: fromDbDate(
            r.date,
          ),
          eventType:
            r.eventType,
          count:
            r.count,
        }),
      );
    const incoming: CountRow[] =
      table.counts.map(
        (
          c,
        ) => ({
          program:
            c.program,
          cycleYear:
            c.cycleYear,
          date: c.date,
          eventType:
            c.eventType,
          count:
            c.count,
        }),
      );
    const {
      toCreate,
      toUpdate,
      toDelete,
    } =
      diffCounts(
        existing,
        incoming,
      );

    if (
      toCreate.length >
      0
    ) {
      await prisma.medCycleCount.createMany(
        {
          data: toCreate.map(
            (
              r,
            ) => ({
              schoolId,
              program:
                r.program,
              cycleYear:
                r.cycleYear,
              date: toDbDate(
                r.date,
              ),
              eventType:
                r.eventType,
              source:
                'CYCLETRACK',
              count:
                r.count,
              contributors:
                null,
            }),
          ),
          // Defence in depth: two runs racing on the same keys must not fail on a unique violation.
          skipDuplicates: true,
        },
      );
      created +=
        toCreate.length;
    }
    for (const r of toUpdate) {
      await prisma.medCycleCount.update(
        {
          where:
            {
              id: r.id,
            },
          data: {
            count:
              r.count,
          },
        },
      );
      updated++;
    }
    if (
      toDelete.length >
      0
    ) {
      await prisma.medCycleCount.deleteMany(
        {
          where:
            {
              id: {
                in: toDelete,
              },
            },
        },
      );
      deleted +=
        toDelete.length;
    }
  }
  return {
    created,
    updated,
    deleted,
  };
}
