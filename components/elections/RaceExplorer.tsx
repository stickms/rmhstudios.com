import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type {
  Office,
  Race,
  RaceStatus,
} from '@/lib/elections/types';
import { OFFICE_NAME } from '@/lib/elections/types';
import { RaceCard } from './RaceCard';

type StatusFilter =
  | 'all'
  | RaceStatus;
type Sort =
  | 'close'
  | 'state'
  | 'rating';

const PAGE = 24;

const RATING_RANK: Record<
  string,
  number
> =
  {
    tossup: 0,
    'lean-dem': 1,
    'lean-rep': 1,
    'likely-dem': 2,
    'likely-rep': 2,
    'solid-dem': 3,
    'solid-rep': 3,
  };

function sortRaces(
  rs: Race[],
  sort: Sort,
): Race[] {
  const out =
    [
      ...rs,
    ];
  if (
    sort ===
    'state'
  )
    return out.sort(
      (
        a,
        b,
      ) =>
        a.label.localeCompare(
          b.label,
          'en',
          {
            numeric: true,
          },
        ),
    );
  if (
    sort ===
    'rating'
  ) {
    return out.sort(
      (
        a,
        b,
      ) =>
        (RATING_RANK[
          a.rating ??
            ''
        ] ??
          4) -
          (RATING_RANK[
            b.rating ??
              ''
          ] ??
            4) ||
        a.label.localeCompare(
          b.label,
          'en',
          {
            numeric: true,
          },
        ),
    );
  }
  // "close": counting races by margin, then uncalled-with-no-votes by rating, then called.
  const tier =
    (
      r: Race,
    ) =>
      r.status ===
      'counting'
        ? 0
        : r.status ===
            'upcoming'
          ? 1
          : 2;
  return out.sort(
    (
      a,
      b,
    ) =>
      tier(
        a,
      ) -
        tier(
          b,
        ) ||
      (a.margin ??
        99) -
        (b.margin ??
          99) ||
      (RATING_RANK[
        a.rating ??
          ''
      ] ??
        4) -
        (RATING_RANK[
          b.rating ??
            ''
        ] ??
          4) ||
      a.label.localeCompare(
        b.label,
        'en',
        {
          numeric: true,
        },
      ),
  );
}

export function RaceExplorer({
  races,
  offices,
  focusRaceId,
}: {
  races: Race[];
  offices: Office[];
  focusRaceId?:
    | string
    | null;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-elections',
    );
  const [
    office,
    setOffice,
  ] =
    useState<
      | Office
      | 'all'
    >(
      'all',
    );
  const [
    status,
    setStatus,
  ] =
    useState<StatusFilter>(
      'all',
    );
  const [
    sort,
    setSort,
  ] =
    useState<Sort>(
      'close',
    );
  const [
    q,
    setQ,
  ] =
    useState(
      '',
    );
  const [
    shown,
    setShown,
  ] =
    useState(
      PAGE,
    );
  const dq =
    useDeferredValue(
      q
        .trim()
        .toLowerCase(),
    );

  const filtered =
    useMemo(() => {
      const rs =
        races.filter(
          (
            r,
          ) => {
            if (
              office !==
                'all' &&
              r.office !==
                office
            )
              return false;
            if (
              status !==
                'all' &&
              r.status !==
                status
            )
              return false;
            if (
              dq
            ) {
              const hay =
                `${r.label} ${r.stateName} ${r.candidates.map((c) => c.name).join(' ')}`.toLowerCase();
              if (
                !hay.includes(
                  dq,
                )
              )
                return false;
            }
            return true;
          },
        );
      return sortRaces(
        rs,
        sort,
      );
    }, [
      races,
      office,
      status,
      sort,
      dq,
    ]);

  // A deep link (?race=ID) pins that race to the top and scrolls to it once.
  const focus =
    focusRaceId
      ? races.find(
          (
            r,
          ) =>
            r.id ===
            focusRaceId,
        )
      : undefined;
  useEffect(() => {
    if (
      !focus
    )
      return;
    document
      .getElementById(
        `race-${focus.id}`,
      )
      ?.scrollIntoView(
        {
          block:
            'center',
        },
      );
  }, [
    focus,
  ]);

  useEffect(
    () =>
      setShown(
        PAGE,
      ),
    [
      office,
      status,
      sort,
      dq,
    ],
  );

  const visible =
    filtered.slice(
      0,
      shown,
    );
  const statuses: {
    id: StatusFilter;
    label: string;
  }[] =
    [
      {
        id: 'all',
        label:
          t(
            'races.all',
            {
              defaultValue:
                'All',
            },
          ),
      },
      {
        id: 'called',
        label:
          t(
            'races.called',
            {
              defaultValue:
                'Called',
            },
          ),
      },
      {
        id: 'counting',
        label:
          t(
            'races.counting',
            {
              defaultValue:
                'Counting',
            },
          ),
      },
      {
        id: 'upcoming',
        label:
          t(
            'races.upcoming',
            {
              defaultValue:
                'Not started',
            },
          ),
      },
    ];

  return (
    <div>
      <div
        className="el-filters"
        role="group"
        aria-label={t(
          'races.filters',
          {
            defaultValue:
              'Filter races',
          },
        )}
      >
        <button
          type="button"
          className="el-btn el-btn--sm"
          aria-pressed={
            office ===
            'all'
          }
          onClick={() =>
            setOffice(
              'all',
            )
          }
        >
          {t(
            'races.everything',
            {
              defaultValue:
                'Every office',
            },
          )}
        </button>
        {offices.map(
          (
            o,
          ) => (
            <button
              key={
                o
              }
              type="button"
              className="el-btn el-btn--sm"
              aria-pressed={
                office ===
                o
              }
              onClick={() =>
                setOffice(
                  o,
                )
              }
            >
              {
                OFFICE_NAME[
                  o
                ]
              }
            </button>
          ),
        )}
      </div>
      <div className="el-filters">
        {statuses.map(
          (
            s,
          ) => (
            <button
              key={
                s.id
              }
              type="button"
              className="el-btn el-btn--sm el-btn--pink"
              aria-pressed={
                status ===
                s.id
              }
              onClick={() =>
                setStatus(
                  s.id,
                )
              }
            >
              {
                s.label
              }
            </button>
          ),
        )}
        <label
          className="el-sr"
          htmlFor="el-search"
        >
          {t(
            'races.search',
            {
              defaultValue:
                'Search races or candidates',
            },
          )}
        </label>
        <input
          id="el-search"
          className="el-input"
          type="search"
          inputMode="search"
          placeholder={t(
            'races.searchPh',
            {
              defaultValue:
                'Search state or candidate…',
            },
          )}
          value={
            q
          }
          onChange={(
            e,
          ) =>
            setQ(
              e
                .target
                .value,
            )
          }
          style={{
            flex: '1 1 220px',
          }}
        />
        <label
          className="el-sr"
          htmlFor="el-sort"
        >
          {t(
            'races.sort',
            {
              defaultValue:
                'Sort',
            },
          )}
        </label>
        <select
          id="el-sort"
          className="el-input"
          value={
            sort
          }
          onChange={(
            e,
          ) =>
            setSort(
              e
                .target
                .value as Sort,
            )
          }
        >
          <option value="close">
            {t(
              'races.sortClose',
              {
                defaultValue:
                  'Closest first',
              },
            )}
          </option>
          <option value="rating">
            {t(
              'races.sortRating',
              {
                defaultValue:
                  'Toss-ups first',
              },
            )}
          </option>
          <option value="state">
            {t(
              'races.sortState',
              {
                defaultValue:
                  'A–Z',
              },
            )}
          </option>
        </select>
      </div>

      <p
        className="el-eyebrow"
        aria-live="polite"
      >
        {t(
          'races.count',
          {
            defaultValue:
              '{{shown}} of {{total}} races',
            shown:
              visible.length,
            total:
              filtered.length,
          },
        )}
      </p>

      {focus &&
      !visible.some(
        (
          r,
        ) =>
          r.id ===
          focus.id,
      ) ? (
        <div
          className="el-cards"
          style={{
            marginBottom: 18,
          }}
        >
          <RaceCard
            race={
              focus
            }
          />
        </div>
      ) : null}

      <div className="el-cards">
        {visible.map(
          (
            r,
          ) => (
            <RaceCard
              key={
                r.id
              }
              race={
                r
              }
            />
          ),
        )}
      </div>

      {filtered.length ===
      0 ? (
        <p
          className="el-h2"
          style={{
            fontSize: 32,
            marginTop: 24,
          }}
        >
          {t(
            'races.none',
            {
              defaultValue:
                'Nothing matches.',
            },
          )}
        </p>
      ) : null}

      {shown <
      filtered.length ? (
        <div
          style={{
            marginTop: 24,
            textAlign:
              'center',
          }}
        >
          <button
            type="button"
            className="el-btn"
            onClick={() =>
              setShown(
                (
                  n,
                ) =>
                  n +
                  PAGE *
                    2,
              )
            }
          >
            {t(
              'races.more',
              {
                defaultValue:
                  'Show more',
              },
            )}
          </button>
        </div>
      ) : null}
    </div>
  );
}
