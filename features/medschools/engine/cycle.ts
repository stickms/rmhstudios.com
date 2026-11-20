const DAY_MS = 86_400_000;

/** Entry year from a label: '2026-2027' -> 2027. */
export function cycleYearFromLabel(
  label: string,
): number {
  const m =
    /^(\d{4})-(\d{4})$/.exec(
      label.trim(),
    );
  if (
    !m
  )
    throw new Error(
      `Invalid cycle label: ${label}`,
    );
  const first =
    Number(
      m[1],
    );
  const second =
    Number(
      m[2],
    );
  if (
    second !==
    first +
      1
  )
    throw new Error(
      `Invalid cycle label: ${label}`,
    );
  return second;
}

export function defaultDayZero(
  cycleYear: number,
): string {
  return `${cycleYear - 1}-06-01`;
}

function utcDay(
  date: string,
): number {
  const m =
    /^(\d{4})-(\d{2})-(\d{2})$/.exec(
      date,
    );
  if (
    !m
  )
    throw new Error(
      `Invalid date: ${date}`,
    );
  return (
    Date.UTC(
      Number(
        m[1],
      ),
      Number(
        m[2],
      ) -
        1,
      Number(
        m[3],
      ),
    ) /
    DAY_MS
  );
}

/** Whole days from `dayZeroOn` to `date` (both YYYY-MM-DD), computed in UTC so no timezone can shift it. */
export function dayOfCycle(
  date: string,
  dayZeroOn: string,
): number {
  return (
    utcDay(
      date,
    ) -
    utcDay(
      dayZeroOn,
    )
  );
}
