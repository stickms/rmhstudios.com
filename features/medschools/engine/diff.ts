import type {
  MedEventType,
  MedProgram,
} from './types';

export interface CountRow {
  id?: string;
  program: MedProgram;
  cycleYear: number;
  /** YYYY-MM-DD */
  date: string;
  eventType: MedEventType;
  count: number;
}

const keyOf =
  (
    r: CountRow,
  ) =>
    `${r.program}|${r.cycleYear}|${r.date}|${r.eventType}`;

/** Reconcile stored rows with a fresh scrape: the incoming value always wins, so a lowered count updates rather than adds. */
export function diffCounts(
  existing: CountRow[],
  incoming: CountRow[],
): {
  toCreate: CountRow[];
  toUpdate: Array<
    CountRow & {
      id: string;
    }
  >;
  toDelete: string[];
} {
  const byKey =
    new Map<
      string,
      CountRow
    >();
  for (const e of existing)
    byKey.set(
      keyOf(
        e,
      ),
      e,
    );

  const seen =
    new Set<string>();
  const toCreate: CountRow[] =
    [];
  const toUpdate: Array<
    CountRow & {
      id: string;
    }
  > =
    [];
  for (const row of incoming) {
    const k =
      keyOf(
        row,
      );
    if (
      seen.has(
        k,
      )
    )
      throw new Error(
        `Duplicate incoming count key: ${k}`,
      );
    seen.add(
      k,
    );
    const prior =
      byKey.get(
        k,
      );
    if (
      !prior
    )
      toCreate.push(
        row,
      );
    else if (
      prior.count !==
        row.count &&
      prior.id !==
        undefined
    )
      toUpdate.push(
        {
          ...row,
          id: prior.id,
        },
      );
  }
  const toDelete: string[] =
    [];
  for (const [
    k,
    e,
  ] of byKey)
    if (
      !seen.has(
        k,
      ) &&
      e.id !==
        undefined
    )
      toDelete.push(
        e.id,
      );
  return {
    toCreate,
    toUpdate,
    toDelete,
  };
}
