/**
 * Ballot measures — statewide amendments, propositions and initiatives, and local questions (city and
 * county measures, charter amendments, bonds). Client-safe and pure.
 *
 * The free results feed publishes one page per measure (`results-<slug>.json`), listed in a "search" index.
 * Each page uses the same race schema as an office, with "yes" and "no" as the two candidates, a
 * `win_threshold` (some measures need 60%, not 50), a plain-language `long_description`, and `coverage`
 * ("state" or "county"). Everything here reads defensively: a missing field degrades one value, never the page.
 */

import { stateName } from './states';

type Json =
  Record<
    string,
    unknown
  >;
const isObj =
  (
    v: unknown,
  ): v is Json =>
    typeof v ===
      'object' &&
    v !==
      null &&
    !Array.isArray(
      v,
    );
const str =
  (
    v: unknown,
  ):
    | string
    | null =>
    typeof v ===
      'string' &&
    v.length >
      0
      ? v
      : null;
const num =
  (
    v: unknown,
  ):
    | number
    | null =>
    typeof v ===
      'number' &&
    Number.isFinite(
      v,
    )
      ? v
      : null;
const arr =
  (
    v: unknown,
  ): unknown[] =>
    Array.isArray(
      v,
    )
      ? v
      : [];

/** The index's `office` values that mean "a measure on the ballot". */
export const MEASURE_OFFICES: ReadonlySet<string> =
  new Set(
    [
      'Question',
      'Amendment',
      'Proposition',
      'Local Measure',
      'Constitutional Amendment',
      'Measure',
      'Initiative',
      'Issue',
      'Charter Amendment',
      'Advisory Question',
      'Bond Measure',
      'Referendum',
      'State Amendment',
      'Proposal',
      'Public Question',
      'Local Amendment',
      'Local Question',
      'Ballot Measure',
    ],
  );

export interface MeasureRef {
  /** Page slug, `results-…` (no extension). */
  slug: string;
  state: string;
  office: string;
  seat:
    | string
    | null;
  headline: string;
}

const SLUG =
  /(results-[a-z0-9-]+)\.html/i;

/** Offices with their own pages that are NOT "other offices" (they have dedicated sections). */
const CORE_OFFICES: ReadonlySet<string> =
  new Set(
    [
      'President',
      'U.S. Senate',
      'U.S. House',
      'Governor',
    ],
  );

/**
 * The pages for statewide and local offices below the headline races (attorney general, secretary of state,
 * treasurer, lieutenant governor, supreme court, mayor, …): everything in the index that is neither a core
 * office nor a measure.
 */
export function parseOtherOfficeIndex(
  feed: unknown,
): MeasureRef[] {
  return parseIndexBy(
    feed,
    (
      office,
    ) =>
      !CORE_OFFICES.has(
        office,
      ) &&
      !MEASURE_OFFICES.has(
        office,
      ),
  );
}

/** The measures listed in a "search" index feed (`{ data: [...] }`). */
export function parseMeasureIndex(
  feed: unknown,
): MeasureRef[] {
  return parseIndexBy(
    feed,
    (
      office,
    ) =>
      MEASURE_OFFICES.has(
        office,
      ),
  );
}

function parseIndexBy(
  feed: unknown,
  wanted: (
    office: string,
  ) => boolean,
): MeasureRef[] {
  const data =
    isObj(
      feed,
    )
      ? arr(
          feed.data,
        )
      : [];
  const out: MeasureRef[] =
    [];
  const seen =
    new Set<string>();
  for (const x of data) {
    if (
      !isObj(
        x,
      )
    )
      continue;
    const office =
      str(
        x.office,
      );
    const url =
      str(
        x.publishUrl,
      );
    const state =
      str(
        x.statePostal,
      );
    if (
      !office ||
      !wanted(
        office,
      ) ||
      !url ||
      !state
    )
      continue;
    const slug =
      SLUG.exec(
        url,
      )?.[1];
    if (
      !slug ||
      seen.has(
        slug,
      )
    )
      continue;
    seen.add(
      slug,
    );
    out.push(
      {
        slug,
        state,
        office,
        seat: str(
          x.seat,
        ),
        headline:
          str(
            x.headline,
          ) ??
          slug,
      },
    );
  }
  return out;
}

export type MeasureStatus =
  | 'upcoming'
  | 'counting'
  | 'called';

export interface BallotMeasure {
  id: string;
  slug: string;
  /** USPS code of the state it is on the ballot in. */
  state: string;
  stateName: string;
  /** "Fresno" for a county or city measure; the state's name for a statewide one. */
  place: string;
  scope:
    | 'statewide'
    | 'local';
  /** What the ballot calls it: Amendment, Proposition, Measure, Question, Charter Amendment… */
  kind: string;
  title: string;
  summary:
    | string
    | null;
  /** Share of the vote "yes" needs, in percent (50 unless the measure says otherwise). */
  threshold: number;
  yes: {
    votes: number;
    pct: number;
  };
  no: {
    votes: number;
    pct: number;
  };
  totalVotes: number;
  pctReporting:
    | number
    | null;
  status: MeasureStatus;
  /** Who won, once called. */
  outcome:
    | 'yes'
    | 'no'
    | null;
  /** At this count, would the measure pass? Null before any votes. */
  passing:
    | boolean
    | null;
  /** Yes minus no, in points; null before any votes. */
  margin:
    | number
    | null;
  calledBy: string[];
  url:
    | string
    | null;
  updatedAt:
    | string
    | null;
}

const round1 =
  (
    n: number,
  ) =>
    Math.round(
      n *
        10,
    ) /
    10;

/** "Fresno-S - Public safety…" → "Fresno"; statewide measures use the state. */
function placeOf(
  ref: MeasureRef,
  coverage:
    | string
    | null,
  seat:
    | string
    | null,
  state: string,
): string {
  if (
    coverage !==
    'county'
  )
    return stateName(
      state,
    );
  const head =
    (
      seat ??
      ref.seat ??
      ''
    )
      .split(
        /\s-\s|-/,
      )[0]
      ?.trim();
  return head &&
    head.length <=
      40
    ? head
    : stateName(
        state,
      );
}

export function normalizeMeasure(
  json: unknown,
  ref: MeasureRef,
): BallotMeasure | null {
  const page =
    isObj(
      json,
    )
      ? json
      : {};
  const raw =
    arr(
      page.races,
    ).find(
      isObj,
    );
  if (
    !raw
  )
    return null;
  const id =
    str(
      raw.nyt_id,
    );
  if (
    !id
  )
    return null;

  const unit =
    isObj(
      raw.top_reporting_unit,
    )
      ? raw.top_reporting_unit
      : {};
  const votesOf =
    new Map<
      string,
      number
    >();
  for (const c of arr(
    unit.candidates,
  )) {
    if (
      !isObj(
        c,
      )
    )
      continue;
    const cid =
      str(
        c.nyt_id,
      );
    if (
      cid
    )
      votesOf.set(
        cid,
        isObj(
          c.votes,
        )
          ? (num(
              c
                .votes
                .total,
            ) ??
              0)
          : 0,
      );
  }
  const yesV =
    votesOf.get(
      'yes',
    ) ??
    0;
  const noV =
    votesOf.get(
      'no',
    ) ??
    0;
  const total =
    yesV +
    noV;
  const yesPct =
    total >
    0
      ? round1(
          (yesV /
            total) *
            100,
        )
      : 0;
  const noPct =
    total >
    0
      ? round1(
          (noV /
            total) *
            100,
        )
      : 0;

  const outcome =
    isObj(
      raw.outcome,
    )
      ? raw.outcome
      : {};
  const won =
    arr(
      outcome.won,
    ).filter(
      (
        x,
      ): x is string =>
        typeof x ===
        'string',
    );
  const winner =
    won.includes(
      'yes',
    )
      ? 'yes'
      : won.includes(
            'no',
          )
        ? 'no'
        : null;
  const status: MeasureStatus =
    winner
      ? 'called'
      : total >
          0
        ? 'counting'
        : 'upcoming';

  const threshold =
    num(
      raw.win_threshold,
    ) ??
    50;
  const eevp =
    num(
      unit.eevp,
    );
  const pTot =
    num(
      unit.precincts_total,
    );
  const pRep =
    num(
      unit.precincts_reporting,
    );
  const pctReporting =
    total <=
      0 &&
    !winner
      ? null
      : eevp !=
            null &&
          eevp >
            0
        ? Math.min(
            100,
            Math.max(
              0,
              eevp,
            ),
          )
        : pTot &&
            pRep !=
              null
          ? Math.min(
              100,
              round1(
                (pRep /
                  pTot) *
                  100,
              ),
            )
          : null;

  const coverage =
    str(
      raw.coverage,
    );
  const state =
    ref.state;
  const title =
    (isObj(
      raw.title,
    )
      ? str(
          raw
            .title
            .default,
        )
      : null) ??
    str(
      raw.ballot_measure_text,
    ) ??
    ref.headline;

  return {
    id,
    slug: ref.slug,
    state,
    stateName:
      stateName(
        state,
      ),
    place:
      placeOf(
        ref,
        coverage,
        str(
          raw.seat,
        ),
        state,
      ),
    scope:
      coverage ===
      'county'
        ? 'local'
        : 'statewide',
    kind:
      str(
        raw.office,
      ) ??
      ref.office,
    title,
    summary:
      str(
        raw.long_description,
      ),
    threshold,
    yes: {
      votes:
        yesV,
      pct: yesPct,
    },
    no: {
      votes:
        noV,
      pct: noPct,
    },
    totalVotes:
      total,
    pctReporting,
    status,
    outcome:
      winner,
    passing:
      total >
      0
        ? yesPct >=
          threshold
        : null,
    margin:
      total >
      0
        ? round1(
            yesPct -
              noPct,
          )
        : null,
    calledBy:
      arr(
        outcome.called_by,
      ).filter(
        (
          x,
        ): x is string =>
          typeof x ===
          'string',
      ),
    url: str(
      raw.url,
    ),
    updatedAt:
      str(
        raw.updated_at,
      ),
  };
}

export interface MeasureStats {
  total: number;
  statewide: number;
  local: number;
  states: number;
  called: number;
  passed: number;
  failed: number;
  /** Counting now: would pass / would fail at this count. */
  passing: number;
  failing: number;
  /** Measures that need more than a simple majority. */
  supermajority: number;
  /** Counting measures with a thin margin, closest first. */
  closest: BallotMeasure[];
  totalVotes: number;
}

export function measureStats(
  ms: BallotMeasure[],
): MeasureStats {
  const called =
    ms.filter(
      (
        m,
      ) =>
        m.status ===
        'called',
    );
  const counting =
    ms.filter(
      (
        m,
      ) =>
        m.status ===
        'counting',
    );
  return {
    total:
      ms.length,
    statewide:
      ms.filter(
        (
          m,
        ) =>
          m.scope ===
          'statewide',
      )
        .length,
    local:
      ms.filter(
        (
          m,
        ) =>
          m.scope ===
          'local',
      )
        .length,
    states:
      new Set(
        ms.map(
          (
            m,
          ) =>
            m.state,
        ),
      )
        .size,
    called:
      called.length,
    passed:
      called.filter(
        (
          m,
        ) =>
          m.outcome ===
          'yes',
      )
        .length,
    failed:
      called.filter(
        (
          m,
        ) =>
          m.outcome ===
          'no',
      )
        .length,
    passing:
      counting.filter(
        (
          m,
        ) =>
          m.passing,
      )
        .length,
    failing:
      counting.filter(
        (
          m,
        ) =>
          m.passing ===
          false,
      )
        .length,
    supermajority:
      ms.filter(
        (
          m,
        ) =>
          m.threshold >
          50,
      )
        .length,
    closest:
      counting
        .filter(
          (
            m,
          ) =>
            m.margin !=
              null &&
            Math.abs(
              m.margin,
            ) <=
              6 &&
            (m.pctReporting ??
              0) >=
              5,
        )
        .sort(
          (
            a,
            b,
          ) =>
            Math.abs(
              a.margin ??
                99,
            ) -
            Math.abs(
              b.margin ??
                99,
            ),
        )
        .slice(
          0,
          5,
        ),
    totalVotes:
      ms.reduce(
        (
          s,
          m,
        ) =>
          s +
          m.totalVotes,
        0,
      ),
  };
}

export type MeasureFilter =
  {
    scope:
      | 'all'
      | 'statewide'
      | 'local';
    state:
      | string
      | 'all';
    q: string;
  };

export function filterMeasures(
  ms: BallotMeasure[],
  f: MeasureFilter,
): BallotMeasure[] {
  const q =
    f.q
      .trim()
      .toLowerCase();
  return ms.filter(
    (
      m,
    ) =>
      (f.scope ===
        'all' ||
        m.scope ===
          f.scope) &&
      (f.state ===
        'all' ||
        m.state ===
          f.state) &&
      (!q ||
        `${m.title} ${m.place} ${m.stateName} ${m.kind} ${m.summary ?? ''}`
          .toLowerCase()
          .includes(
            q,
          )),
  );
}
