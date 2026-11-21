/** s03-15 — the Insights tab: members, activity, top posts, busy hours and flair use of the community, for moderators. */
import {
  useMemo,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { apiQuery } from '@/lib/contract/client';
import { firstDayOfWeek } from '@/lib/locale-week';
import { heatLevel } from '@/lib/profile/activity';
import { Button } from '@/components/ui/button';
import { BarChart } from '@/components/ui/bar-chart';
import { EmptyState } from '@/components/ui/empty-state';
import { LineChart } from '@/components/ui/line-chart';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { getCommunityInsightsApi } from '@/lib/communities/insights.contract';
import {
  INSIGHT_RANGES,
  gridMax,
  type Compared,
  type InsightRange,
} from '@/lib/communities/insights';

/** Share of the ink mixed into the page ground per level. Kept low so the number in a cell stays readable in both editions. */
const LEVEL_MIX =
  [
    0,
    8,
    16,
    24,
    32,
  ] as const;

function viewerTimeZone():
  | string
  | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions()
      .timeZone;
  } catch {
    return undefined;
  }
}

/** The label of the Insights tab (the tab strip lives in `ModPanel`, which keeps one translation per tab). */
export function useInsightsTabLabel(): string {
  const {
    t,
  } =
    useTranslation(
      'community-insights',
    );
  return t(
    'mod-tab',
    {
      defaultValue:
        'Insights',
    },
  );
}

export function ModInsights({
  slug,
}: {
  slug: string;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'community-insights',
    );
  const locale =
    i18n.language;
  const [
    range,
    setRange,
  ] =
    useState<InsightRange>(
      28,
    );
  const timeZone =
    useMemo(
      () =>
        viewerTimeZone(),
      [],
    );

  const query =
    useQuery(
      {
        ...apiQuery(
          getCommunityInsightsApi,
          {
            params:
              {
                slug,
              },
            query:
              {
                range:
                  String(
                    range,
                  ) as
                    | '28'
                    | '90'
                    | '365',
                ...(timeZone
                  ? {
                      tz: timeZone,
                    }
                  : {}),
              },
          },
        ),
        retry: false,
      },
    );
  const data =
    query.data;
  const arrival =
    useArrival(
      !!data,
    );

  const number =
    useMemo(
      () =>
        new Intl.NumberFormat(
          locale,
        ),
      [
        locale,
      ],
    );
  const signed =
    useMemo(
      () =>
        new Intl.NumberFormat(
          locale,
          {
            signDisplay:
              'exceptZero',
          },
        ),
      [
        locale,
      ],
    );
  const shortDay =
    useMemo(() => {
      const f =
        new Intl.DateTimeFormat(
          locale,
          {
            month:
              'short',
            day: 'numeric',
            timeZone:
              'UTC',
          },
        );
      return (
        key: string,
      ) =>
        f.format(
          new Date(
            `${key}T00:00:00Z`,
          ),
        );
    }, [
      locale,
    ]);
  const longDay =
    useMemo(() => {
      const f =
        new Intl.DateTimeFormat(
          locale,
          {
            dateStyle:
              'medium',
            timeZone:
              'UTC',
          },
        );
      return (
        key: string,
      ) =>
        f.format(
          new Date(
            `${key}T00:00:00Z`,
          ),
        );
    }, [
      locale,
    ]);
  const weekdayName =
    useMemo(() => {
      const f =
        new Intl.DateTimeFormat(
          locale,
          {
            weekday:
              'short',
            timeZone:
              'UTC',
          },
        );
      // 2023-01-01 was a Sunday.
      return (
        weekday: number,
      ) =>
        f.format(
          new Date(
            Date.UTC(
              2023,
              0,
              1 +
                weekday,
            ),
          ),
        );
    }, [
      locale,
    ]);
  const hourName =
    useMemo(() => {
      const f =
        new Intl.DateTimeFormat(
          locale,
          {
            hour: 'numeric',
            timeZone:
              'UTC',
          },
        );
      return (
        hour: number,
      ) =>
        f.format(
          new Date(
            Date.UTC(
              2023,
              0,
              1,
              hour,
            ),
          ),
        );
    }, [
      locale,
    ]);

  const chartLabels =
    useMemo(
      () => ({
        showChart:
          t(
            'chart-show-chart',
            {
              defaultValue:
                'Show as chart',
            },
          ),
        showTable:
          t(
            'chart-show-table',
            {
              defaultValue:
                'Show as table',
            },
          ),
        day: t(
          'chart-table-day',
          {
            defaultValue:
              'Day',
          },
        ),
        points:
          t(
            'chart-points',
            {
              defaultValue:
                'Data points',
            },
          ),
        seriesSummary:
          (v: {
            label: string;
            first: string;
            last: string;
            min: string;
            max: string;
          }) =>
            t(
              'chart-series-summary',
              {
                defaultValue:
                  '{{label}}: from {{first}} to {{last}}, lowest {{min}}, highest {{max}}.',
                ...v,
              },
            ),
      }),
      [
        t,
      ],
    );

  const rangeSelect =
    (
      <Select
        aria-label={t(
          'range-label',
          {
            defaultValue:
              'Time range',
          },
        )}
        controlSize="sm"
        value={String(
          range,
        )}
        onChange={(
          e,
        ) =>
          setRange(
            Number(
              e
                .target
                .value,
            ) as InsightRange,
          )
        }
      >
        {INSIGHT_RANGES.map(
          (
            days,
          ) => (
            <option
              key={
                days
              }
              value={String(
                days,
              )}
            >
              {t(
                'range-option',
                {
                  defaultValue:
                    'Last {{days}} days',
                  days,
                },
              )}
            </option>
          ),
        )}
      </Select>
    );

  if (
    query.isError
  ) {
    return (
      <EmptyState
        title={t(
          'error-title',
          {
            defaultValue:
              'Could not load the insights',
          },
        )}
        description={t(
          'error-body',
          {
            defaultValue:
              'Try again in a moment.',
          },
        )}
        action={
          <Button
            variant="default"
            onClick={() =>
              void query.refetch()
            }
          >
            {t(
              'retry',
              {
                defaultValue:
                  'Try again',
              },
            )}
          </Button>
        }
      />
    );
  }

  if (
    !data
  ) {
    return (
      <div
        className="flex flex-col gap-4"
        aria-busy="true"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="t-heading">
            {t(
              'title',
              {
                defaultValue:
                  'Insights',
              },
            )}
          </h2>
          {
            rangeSelect
          }
        </div>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const figure =
    (
      label: string,
      value: number,
      c?: Compared,
    ) => (
      <div
        key={
          label
        }
        className="flex flex-col gap-0.5 border-b border-site-border py-2"
      >
        <dt className="t-label">
          {
            label
          }
        </dt>
        <dd className="t-title m-0">
          {number.format(
            value,
          )}
        </dd>
        {c ? (
          <dd className="t-meta m-0">
            {t(
              'vs-previous',
              {
                defaultValue:
                  'Previous {{days}} days: {{previous}} ({{change}})',
                days: data.range,
                previous:
                  number.format(
                    c.previous,
                  ),
                change:
                  signed.format(
                    c.change,
                  ),
              },
            )}
          </dd>
        ) : null}
      </div>
    );
  const compared =
    (
      label: string,
      c: Compared,
    ) =>
      figure(
        label,
        c.value,
        c,
      );

  const weekStartDay =
    firstDayOfWeek(
      locale,
    );
  const weekdays =
    Array.from(
      {
        length: 7,
      },
      (
        _,
        i,
      ) =>
        (weekStartDay +
          i) %
        7,
    );
  const max =
    gridMax(
      data.hours,
    );
  const noActivity =
    max ===
    0;

  const weekBars =
    (
      pick:
        | 'posts'
        | 'posters'
        | 'reactions',
    ) =>
      data.weekly.map(
        (
          w,
        ) => ({
          label:
            shortDay(
              w.week,
            ),
          value:
            w[
              pick
            ],
        }),
      );
  const barColumns =
    {
      label:
        t(
          'table-week',
          {
            defaultValue:
              'Week starting',
          },
        ),
      value:
        t(
          'table-value',
          {
            defaultValue:
              'Value',
          },
        ),
    };
  const barSummary =
    (
      label: string,
      values: number[],
    ) =>
      t(
        'bar-summary',
        {
          defaultValue:
            '{{label}}: {{total}} in total, up to {{max}} in one week.',
          label,
          total:
            number.format(
              values.reduce(
                (
                  a,
                  b,
                ) =>
                  a +
                  b,
                0,
              ),
            ),
          max: number.format(
            Math.max(
              0,
              ...values,
            ),
          ),
        },
      );
  const weekly =
    [
      {
        key: 'posts' as const,
        label:
          t(
            'weekly-posts',
            {
              defaultValue:
                'Posts per week',
            },
          ),
      },
      {
        key: 'posters' as const,
        label:
          t(
            'weekly-posters',
            {
              defaultValue:
                'People who posted, per week',
            },
          ),
      },
      {
        key: 'reactions' as const,
        label:
          t(
            'weekly-reactions',
            {
              defaultValue:
                'Reactions and likes per week',
            },
          ),
      },
    ];

  const memberLabel =
    t(
      'members-over-time',
      {
        defaultValue:
          'Members over time',
      },
    );

  return (
    <div
      className={`flex flex-col gap-6 ${arrival ?? ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="t-heading">
          {t(
            'title',
            {
              defaultValue:
                'Insights',
            },
          )}
        </h2>
        {
          rangeSelect
        }
      </div>

      <p className="t-meta">
        {data.lossesKnownFrom
          ? t(
              'losses-known-from',
              {
                defaultValue:
                  'People leaving are recorded from {{date}}. Before that only joins are known.',
                date: longDay(
                  data.lossesKnownFrom,
                ),
              },
            )
          : t(
              'losses-unknown',
              {
                defaultValue:
                  'People leaving are not recorded yet. For now only joins are known.',
              },
            )}
      </p>

      <dl className="m-0 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
        {figure(
          t(
            'figure-members',
            {
              defaultValue:
                'Members now',
            },
          ),
          data.members,
        )}
        {compared(
          t(
            'figure-net',
            {
              defaultValue:
                'Net change',
            },
          ),
          data.netChange,
        )}
        {compared(
          t(
            'figure-joins',
            {
              defaultValue:
                'Joined',
            },
          ),
          data.joins,
        )}
        {compared(
          t(
            'figure-leaves',
            {
              defaultValue:
                'Left',
            },
          ),
          data.leaves,
        )}
        {compared(
          t(
            'figure-removed',
            {
              defaultValue:
                'Removed',
            },
          ),
          data.removed,
        )}
        {compared(
          t(
            'figure-posts',
            {
              defaultValue:
                'Posts',
            },
          ),
          data.posts,
        )}
        {compared(
          t(
            'figure-posters',
            {
              defaultValue:
                'People who posted',
            },
          ),
          data.posters,
        )}
        {compared(
          t(
            'figure-reactors',
            {
              defaultValue:
                'People who reacted',
            },
          ),
          data.reactors,
        )}
      </dl>

      <section
        className="flex flex-col gap-2 border-t border-site-border pt-4"
        aria-labelledby="ins-members"
      >
        <h3
          id="ins-members"
          className="t-heading"
        >
          {
            memberLabel
          }
        </h3>
        <LineChart
          label={
            memberLabel
          }
          labels={
            chartLabels
          }
          formatX={
            shortDay
          }
          series={[
            {
              id: 'members',
              label:
                t(
                  'series-members',
                  {
                    defaultValue:
                      'Members',
                  },
                ),
              points:
                data.memberLine.map(
                  (
                    p,
                  ) => ({
                    x: p.day,
                    y: p.total,
                  }),
                ),
            },
          ]}
        />
      </section>

      <section
        className="flex flex-col gap-4 border-t border-site-border pt-4"
        aria-labelledby="ins-weekly"
      >
        <h3
          id="ins-weekly"
          className="t-heading"
        >
          {t(
            'weekly-heading',
            {
              defaultValue:
                'Activity by week',
            },
          )}
        </h3>
        {weekly.map(
          (
            w,
          ) => (
            <div
              key={
                w.key
              }
              className="flex flex-col gap-1"
            >
              <p className="t-label">
                {
                  w.label
                }
              </p>
              <BarChart
                label={
                  w.label
                }
                summary={barSummary(
                  w.label,
                  data.weekly.map(
                    (
                      x,
                    ) =>
                      x[
                        w
                          .key
                      ],
                  ),
                )}
                columns={
                  barColumns
                }
                bars={weekBars(
                  w.key,
                )}
              />
            </div>
          ),
        )}
      </section>

      <section
        className="flex flex-col gap-2 border-t border-site-border pt-4"
        aria-labelledby="ins-top"
      >
        <h3
          id="ins-top"
          className="t-heading"
        >
          {t(
            'top-heading',
            {
              defaultValue:
                'Top posts',
            },
          )}
        </h3>
        {data
          .topPosts
          .length ===
        0 ? (
          <p className="t-body text-site-text-muted">
            {t(
              'top-empty',
              {
                defaultValue:
                  'No post in this range has had a like, reaction or reply yet.',
              },
            )}
          </p>
        ) : (
          <ol className="m-0 list-none p-0">
            {data.topPosts.map(
              (
                p,
              ) => (
                <li
                  key={
                    p.id
                  }
                  className="flex flex-col gap-1 border-b border-site-border py-3"
                >
                  <Link
                    to={
                      `/u/${p.author}/post/${p.id}` as string
                    }
                    className="t-body line-clamp-3 underline"
                  >
                    {p.excerpt ||
                      t(
                        'top-no-text',
                        {
                          defaultValue:
                            'Post without text',
                        },
                      )}
                  </Link>
                  <p className="t-meta">
                    {p.likes !== null && p.reactions !== null && p.replies !== null
                      ? t(
                      'top-counts',
                      {
                        defaultValue:
                          '{{likes}} likes, {{reactions}} reactions, {{replies}} replies',
                        likes:
                          number.format(
                            p.likes,
                          ),
                        reactions:
                          number.format(
                            p.reactions,
                          ),
                        replies:
                          number.format(
                            p.replies,
                          ),
                      },
                    )
                      : null}
                    {p.likes !== null && ' · '}
                    {p.authorName ??
                      p.author}
                  </p>
                </li>
              ),
            )}
          </ol>
        )}
      </section>

      <section
        className="flex flex-col gap-2 border-t border-site-border pt-4"
        aria-labelledby="ins-hours"
      >
        <h3
          id="ins-hours"
          className="t-heading"
        >
          {t(
            'hours-heading',
            {
              defaultValue:
                'Activity by hour',
            },
          )}
        </h3>
        <p className="t-meta">
          {t(
            'hours-note',
            {
              defaultValue:
                'Posts, replies, reactions and likes, in your time zone ({{zone}}).',
              zone: data.timeZone,
            },
          )}
        </p>
        {noActivity ? (
          <p className="t-body text-site-text-muted">
            {t(
              'hours-empty',
              {
                defaultValue:
                  'No activity in this range yet.',
              },
            )}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-center">
              <caption className="sr-only">
                {t(
                  'hours-caption',
                  {
                    defaultValue:
                      'Activity by weekday and hour of day',
                  },
                )}
              </caption>
              <thead>
                <tr>
                  <td className="w-12" />
                  {Array.from(
                    {
                      length: 24,
                    },
                    (
                      _,
                      h,
                    ) => (
                      <th
                        key={
                          h
                        }
                        scope="col"
                        className="t-meta font-normal"
                        title={hourName(
                          h,
                        )}
                      >
                        {number.format(
                          h,
                        )}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {weekdays.map(
                  (
                    d,
                  ) => (
                    <tr
                      key={
                        d
                      }
                    >
                      <th
                        scope="row"
                        className="t-meta pe-3 text-start font-normal"
                      >
                        {weekdayName(
                          d,
                        )}
                      </th>
                      {(
                        data
                          .hours[
                          d
                        ] ??
                        []
                      ).map(
                        (
                          n,
                          h,
                        ) => (
                          <td
                            key={
                              h
                            }
                            className="t-meta border border-site-bg p-0.5 text-site-text"
                            style={{
                              background: `color-mix(in srgb, var(--site-text) ${LEVEL_MIX[heatLevel(n, max)]}%, var(--site-bg))`,
                            }}
                          >
                            {number.format(
                              n,
                            )}
                          </td>
                        ),
                      )}
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section
        className="flex flex-col gap-2 border-t border-site-border pt-4"
        aria-labelledby="ins-flairs"
      >
        <h3
          id="ins-flairs"
          className="t-heading"
        >
          {t(
            'flairs-heading',
            {
              defaultValue:
                'Flair use',
            },
          )}
        </h3>
        {data
          .flairs
          .length ===
        0 ? (
          <p className="t-body text-site-text-muted">
            {t(
              'flairs-empty',
              {
                defaultValue:
                  'No posts in this range.',
              },
            )}
          </p>
        ) : (
          <table className="w-full border-collapse">
            <caption className="sr-only">
              {t(
                'flairs-caption',
                {
                  defaultValue:
                    'Posts per flair',
                },
              )}
            </caption>
            <thead>
              <tr className="border-b border-site-border">
                <th
                  scope="col"
                  className="t-label py-2 text-start"
                >
                  {t(
                    'flairs-flair',
                    {
                      defaultValue:
                        'Flair',
                    },
                  )}
                </th>
                <th
                  scope="col"
                  className="t-label py-2 text-end"
                >
                  {t(
                    'flairs-posts',
                    {
                      defaultValue:
                        'Posts',
                    },
                  )}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.flairs.map(
                (
                  f,
                ) => (
                  <tr
                    key={
                      f.name ??
                      ''
                    }
                    className="border-b border-site-border"
                  >
                    <th
                      scope="row"
                      className="t-body py-2 text-start font-normal"
                    >
                      {f.name ??
                        t(
                          'flairs-none',
                          {
                            defaultValue:
                              'No flair',
                          },
                        )}
                    </th>
                    <td className="t-body py-2 text-end">
                      {number.format(
                        f.posts,
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
