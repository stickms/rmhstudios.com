/** An in-memory `prisma.fanoutRun` for tests of the code that runs on a durable fan-out (s08-05). Not a test file. */
export interface FakeRun {
  id: string;
  kind: string;
  subjectId: string;
  cursor: string | null;
  sent: number;
  collapsed: number;
  scanned: number;
  status: 'RUNNING' | 'DONE' | 'FAILED';
  heartbeatAt: Date;
  reclaims: number;
  startedAt: Date;
  finishedAt: Date | null;
}

type Where = Record<string, unknown>;

function matches(r: FakeRun, where: Where): boolean {
  for (const [k, v] of Object.entries(where)) {
    const cur = (r as unknown as Record<string, unknown>)[k];
    if (v instanceof Date) {
      if (!(cur instanceof Date) || cur.getTime() !== v.getTime()) return false;
    } else if (v && typeof v === 'object' && 'lt' in v) {
      if (
        !(cur instanceof Date) ||
        !(
          cur.getTime() <
          (
            v as {
              lt: Date;
            }
          ).lt.getTime()
        )
      )
        return false;
    } else if (v && typeof v === 'object' && 'gte' in v) {
      if (
        !(
          (cur as number) >=
          (
            v as {
              gte: number;
            }
          ).gte
        )
      )
        return false;
    } else if (cur !== v) return false;
  }
  return true;
}

export function createFanoutRunFake(runs: FakeRun[] = []) {
  let seq = 0;
  return {
    runs,
    fanoutRun: {
      createMany: async ({ data }: { data: Partial<FakeRun>[] }) => {
        let count = 0;
        for (const d of data) {
          if (runs.some((r) => r.kind === d.kind && r.subjectId === d.subjectId)) continue;
          runs.push({
            id: `run${++seq}`,
            cursor: null,
            sent: 0,
            collapsed: 0,
            scanned: 0,
            reclaims: 0,
            finishedAt: null,
            status: 'RUNNING',
            heartbeatAt: new Date(),
            startedAt: new Date(),
            ...d,
          } as FakeRun);
          count++;
        }
        return {
          count,
        };
      },
      updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
        let count = 0;
        for (const r of runs) {
          if (!matches(r, where)) continue;
          const rec = r as unknown as Record<string, unknown>;
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && 'increment' in v)
              rec[k] =
                (rec[k] as number) +
                (
                  v as {
                    increment: number;
                  }
                ).increment;
            else rec[k] = v;
          }
          count++;
        }
        return {
          count,
        };
      },
      findUnique: async ({
        where,
      }: {
        where: {
          kind_subjectId: {
            kind: string;
            subjectId: string;
          };
        };
      }) => {
        const r = runs.find(
          (x) => x.kind === where.kind_subjectId.kind && x.subjectId === where.kind_subjectId.subjectId,
        );
        return r
          ? {
              ...r,
            }
          : null;
      },
      findMany: async ({ where, take }: { where: Where; take: number }) =>
        runs
          .filter((r) => matches(r, where))
          .slice(0, take)
          .map((r) => ({
            ...r,
          })),
      count: async () => 0,
    },
  };
}
