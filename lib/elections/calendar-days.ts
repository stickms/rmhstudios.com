/**
 * The calendar of election days that are NOT general elections — primaries,
 * runoffs, specials — for the "browse an election day" picker. Pure, client-safe.
 *
 * Two sources, merged:
 *  1. DERIVED (keyless, verified): every candidate in the results feed carries a
 *     headshot URL embedding the id of the race that nominated them, e.g.
 *     `…/headshots/AL-R-S-2026-05-19-moore-b-99031.png` = Alabama, Republican
 *     primary, Senate, 2026-05-19. Reading those back reconstructs each state's
 *     primary dates from data we already fetch.
 *  2. FEC election dates (government, optional): `api.open.fec.gov/v1/election-dates`
 *     with a free `FEC_API_KEY`. Adds runoffs and specials the nominees do not reveal.
 */

import { generalElectionDate } from './calendar';
import type { Race } from './types';

export interface ElectionDayEntry {
  /** YYYY-MM-DD. */
  date: string;
  /** USPS codes of the states holding contests that day. */
  states: string[];
  /** 'primary' | 'runoff' | 'special' — what the sources say it is. */
  kinds: (
    | 'primary'
    | 'runoff'
    | 'special'
  )[];
  /** True when we have a government results feed for at least one of the states (see OFFICIAL_STATES). */
  official: boolean;
  /** Which source(s) named this day. */
  from: (
    | 'feed'
    | 'fec'
  )[];
}

/** States whose election board we ingest directly (lib/elections/sources). */
export const OFFICIAL_STATES =
  [
    'NC',
  ] as const;

const HEADSHOT =
  /\/headshots\/([A-Z]{2})-([A-Za-z_]+)-([A-Z]+)(?:-\d+)?-(\d{4}-\d{2}-\d{2})-/;

/** Race-type letters in a headshot id that mean a PARTY PRIMARY (D, R, L…) or a special (S_*), not G (general) or APP (appointed). */
function kindOf(
  letters: string,
):
  | ElectionDayEntry['kinds'][number]
  | null {
  if (
    letters ===
      'G' ||
    letters ===
      'APP'
  )
    return null;
  if (
    letters.startsWith(
      'S_',
    )
  )
    return 'special';
  return /^[A-Z]{1,3}$/.test(
    letters,
  )
    ? 'primary'
    : null;
}

const add =
  (
    map: Map<
      string,
      ElectionDayEntry
    >,
    date: string,
    state: string,
    kind: ElectionDayEntry['kinds'][number],
    from:
      | 'feed'
      | 'fec',
  ) => {
    const e =
      map.get(
        date,
      ) ??
      ({
        date,
        states:
          [],
        kinds:
          [],
        official: false,
        from: [],
      } as ElectionDayEntry);
    if (
      !e.states.includes(
        state,
      )
    )
      e.states.push(
        state,
      );
    if (
      !e.kinds.includes(
        kind,
      )
    )
      e.kinds.push(
        kind,
      );
    if (
      !e.from.includes(
        from,
      )
    )
      e.from.push(
        from,
      );
    map.set(
      date,
      e,
    );
  };

function finish(
  map: Map<
    string,
    ElectionDayEntry
  >,
): ElectionDayEntry[] {
  return [
    ...map.values(),
  ]
    .map(
      (
        e,
      ) => ({
        ...e,
        states:
          e.states.sort(),
        official:
          e.states.some(
            (
              s,
            ) =>
              (
                OFFICIAL_STATES as readonly string[]
              ).includes(
                s,
              ),
          ),
      }),
    )
    .sort(
      (
        a,
        b,
      ) =>
        a.date.localeCompare(
          b.date,
        ),
    );
}

/** Primary/special days in `year` (before its general election) named by the feed's candidates. */
export function derivePrimaryDays(
  races: Race[],
  year: number,
): ElectionDayEntry[] {
  const general =
    generalElectionDate(
      year,
    );
  const map =
    new Map<
      string,
      ElectionDayEntry
    >();
  for (const r of races) {
    for (const c of r.candidates) {
      const m =
        c.imageUrl
          ? HEADSHOT.exec(
              c.imageUrl,
            )
          : null;
      if (
        !m
      )
        continue;
      const [
        ,
        state,
        letters,
        ,
        date,
      ] =
        m;
      const kind =
        kindOf(
          letters,
        );
      if (
        !kind ||
        !date.startsWith(
          String(
            year,
          ),
        ) ||
        date >=
          general
      )
        continue;
      add(
        map,
        date,
        state,
        kind,
        'feed',
      );
    }
  }
  return finish(
    map,
  );
}

/** FEC election-dates → entries. Defensive: unknown shapes yield []. */
export function parseFecDates(
  json: unknown,
  year: number,
): ElectionDayEntry[] {
  const results =
    (
      json as {
        results?: unknown;
      } | null
    )
      ?.results;
  if (
    !Array.isArray(
      results,
    )
  )
    return [];
  const general =
    generalElectionDate(
      year,
    );
  const map =
    new Map<
      string,
      ElectionDayEntry
    >();
  for (const row of results) {
    if (
      !row ||
      typeof row !==
        'object'
    )
      continue;
    const r =
      row as Record<
        string,
        unknown
      >;
    const date =
      typeof r.election_date ===
      'string'
        ? r.election_date.slice(
            0,
            10,
          )
        : '';
    const state =
      typeof r.election_state ===
      'string'
        ? r.election_state.toUpperCase()
        : '';
    const type =
      String(
        r.election_type_id ??
          '',
      ).toUpperCase();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        date,
      ) ||
      !/^[A-Z]{2}$/.test(
        state,
      )
    )
      continue;
    if (
      !date.startsWith(
        String(
          year,
        ),
      ) ||
      date >=
        general
    )
      continue;
    // FEC ids: P / PR = primary (and primary runoff), R = runoff, S / SG / SP = special…
    const kind:
      | ElectionDayEntry['kinds'][number]
      | null =
      type ===
        'G' ||
      type ===
        'C'
        ? null
        : type.startsWith(
              'S',
            )
          ? 'special'
          : type ===
                'R' ||
              type ===
                'PR'
            ? 'runoff'
            : type.startsWith(
                  'P',
                )
              ? 'primary'
              : null;
    if (
      kind
    )
      add(
        map,
        date,
        state,
        kind,
        'fec',
      );
  }
  return finish(
    map,
  );
}

/** Union of both lists by date: states and kinds merged, provenance kept. */
export function mergeDays(
  ...lists: ElectionDayEntry[][]
): ElectionDayEntry[] {
  const map =
    new Map<
      string,
      ElectionDayEntry
    >();
  for (const list of lists) {
    for (const e of list) {
      for (const s of e.states)
        for (const k of e.kinds)
          for (const f of e.from)
            add(
              map,
              e.date,
              s,
              k,
              f,
            );
    }
  }
  return finish(
    map,
  );
}
