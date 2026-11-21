import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EngagementHoursGrid } from '@/components/create/EngagementHoursGrid';
import { WeeklyNetBars } from '@/components/create/WeeklyNetBars';
import { UserAvatar } from '@/components/feed/UserAvatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { LineChart, type LineChartLabels } from '@/components/ui/line-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { apiQuery } from '@/lib/contract/client';
import { cn } from '@/lib/utils';
import { getAudienceApi } from '@/lib/social/audience.contract';
import type { AudienceRange } from '@/lib/social/audience';

const RANGES: AudienceRange[] = [30, 90, 365];

function viewerTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * The Audience section of /analytics: followers per day, gained / lost / net, net per week,
 * new followers, the hours the audience engages and the mutuals share. Owner-only data;
 * people who unfollowed are counted, never named.
 */
export function AudienceInsights() {
  const { t, i18n } = useTranslation('audience');
  const locale = i18n.language;
  const [range, setRange] = useState<AudienceRange>(30);

  const timeZone = viewerTimeZone();
  const query = useQuery({
    ...apiQuery(getAudienceApi, {
      query: {
        range: String(range) as '30' | '90' | '365',
        ...(timeZone
          ? {
              tz: timeZone,
            }
          : {}),
      },
    }),
    retry: false,
    placeholderData: (previous) => previous,
  });
  const data = query.data;
  const arrival = useArrival(!!data);

  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const signed = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        signDisplay: 'exceptZero',
      }),
    [locale],
  );
  const percent = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        style: 'percent',
        maximumFractionDigits: 0,
      }),
    [locale],
  );
  const shortDate = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
    return (key: string) => f.format(new Date(`${key}T00:00:00Z`));
  }, [locale]);
  const longDate = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeZone: 'UTC',
    });
    return (key: string) => f.format(new Date(`${key}T00:00:00Z`));
  }, [locale]);

  const heading = (
    <h2 id="audience-heading" className="t-heading text-site-text">
      {t('title', {
        defaultValue: 'Audience',
      })}
    </h2>
  );

  if (query.isError && !data) {
    return (
      <section aria-labelledby="audience-heading">
        {heading}
        <EmptyState
          title={t('error-title', {
            defaultValue: 'Could not load your audience',
          })}
          action={
            <Button variant="default" onClick={() => void query.refetch()}>
              {t('retry', {
                defaultValue: 'Try again',
              })}
            </Button>
          }
        />
      </section>
    );
  }
  if (!data) {
    return (
      <section aria-busy>
        {heading}
        <div className="mt-4 space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </section>
    );
  }

  const hasEngagement = data.engagement.some((row) => row.some((n) => n > 0));
  const nothingYet =
    data.followerCount === 0 && data.logStart === null && data.newFollowers.length === 0 && !hasEngagement;
  if (nothingYet) {
    return (
      <section>
        {heading}
        <EmptyState
          title={t('empty-title', {
            defaultValue: 'No audience yet',
          })}
          description={t('empty-desc', {
            defaultValue: 'When people follow you or engage with your posts, their numbers appear here.',
          })}
        />
      </section>
    );
  }

  const { totals } = data;
  const tiles = [
    {
      id: 'followers',
      label: t('followers', {
        defaultValue: 'Followers',
      }),
      value: number.format(data.followerCount),
    },
    {
      id: 'gained',
      label: t('gained', {
        defaultValue: 'Gained',
      }),
      value: signed.format(totals.gained),
    },
    {
      id: 'lost',
      label: t('lost', {
        defaultValue: 'Lost',
      }),
      value: number.format(totals.lost),
    },
    {
      id: 'net',
      label: t('net', {
        defaultValue: 'Net',
      }),
      value: signed.format(totals.net),
    },
  ];

  const first = data.days[0];
  const logNote =
    data.logStart === null
      ? t('log-not-started', {
          defaultValue: 'Losses are counted from your next follower change. Earlier days show gains only.',
        })
      : first && data.logStart > first.date
        ? t('log-started', {
            defaultValue: 'Losses are counted from {{date}}. Earlier days show gains only.',
            date: longDate(data.logStart),
          })
        : null;

  const chartLabels: LineChartLabels = {
    showChart: t('chart-show-chart', { defaultValue: 'Show as chart' }),
    showTable: t('chart-show-table', { defaultValue: 'Show as table' }),
    day: t('chart-table-day', { defaultValue: 'Day' }),
    points: t('chart-points', { defaultValue: 'Data points' }),
    seriesSummary: (v) =>
      t('chart-series-summary', {
        defaultValue: '{{label}}: from {{first}} to {{last}}, lowest {{min}}, highest {{max}}.',
        ...v,
      }),
  };

  const series = [
    {
      id: 'followers',
      label: t('followers', {
        defaultValue: 'Followers',
      }),
      points: data.days.map((d) => ({
        x: d.date,
        y: d.followers,
      })),
    },
  ];
  const rangeLabels: Record<AudienceRange, string> = {
    30: t('range-30', {
      defaultValue: 'Last 30 days',
    }),
    90: t('range-90', {
      defaultValue: 'Last 90 days',
    }),
    365: t('range-365', {
      defaultValue: 'Last 365 days',
    }),
  };

  return (
    <section aria-labelledby="audience-heading" className={cn('space-y-[var(--site-section-gap)]', arrival)}>
      <div className="space-y-3">
        {heading}
        <Tabs
          aria-label={t('range-label', {
            defaultValue: 'Time range',
          })}
          idBase="audience-range"
          value={String(range)}
          onChange={(id) => setRange(Number(id) as AudienceRange)}
          tabs={RANGES.map((r) => ({
            id: String(r),
            label: rangeLabels[r],
          }))}
        />
      </div>

      <div
        role="tabpanel"
        id={`audience-range-panel-${range}`}
        aria-labelledby={`audience-range-tab-${range}`}
        className="space-y-[var(--site-section-gap)]"
        aria-busy={query.isFetching}
      >
        <dl className="m-0 grid grid-cols-2 gap-x-4 sm:grid-cols-4">
          {tiles.map((tile) => (
            <div key={tile.id} className="border-b border-site-border py-3">
              <dt className="t-label">{tile.label}</dt>
              <dd className="t-title m-0 text-site-text">{tile.value}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-2">
          <LineChart
            series={series}
            label={t('chart-followers', {
              defaultValue: 'Followers per day',
            })}
            labels={chartLabels}
            formatX={shortDate}
          />
          {logNote ? <p className="t-meta">{logNote}</p> : null}
        </div>

        <div className="space-y-2">
          <h3 className="t-label">
            {t('weekly-title', {
              defaultValue: 'Net change per week',
            })}
          </h3>
          <WeeklyNetBars weeks={data.weeks} />
        </div>
      </div>

      <div>
        <h3 className="t-label mb-2">
          {t('new-title', {
            defaultValue: 'New followers',
          })}
        </h3>
        {data.newFollowers.length === 0 ? (
          <p className="t-body text-site-text-muted">
            {t('new-empty', {
              defaultValue: 'No new followers in this range.',
            })}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {data.newFollowers.map((f) => (
              <li key={f.id} className="flex items-center gap-3 border-b border-site-border py-2">
                <UserAvatar user={f} size="sm" linkToProfile={false} />
                <div className="min-w-0 flex-1">
                  <Link
                    to="/u/$userid"
                    params={{
                      userid: f.handle || f.id,
                    }}
                    className="t-body block truncate text-site-text"
                  >
                    {f.name ||
                      f.handle ||
                      t('unknown-member', {
                        defaultValue: 'Member',
                      })}
                  </Link>
                  <span className="t-meta">{longDate(f.followedAt.slice(0, 10))}</span>
                </div>
                <span className="t-meta shrink-0">
                  {f.followsBack
                    ? t('follows-back', {
                        defaultValue: 'You follow them',
                      })
                    : t('not-following-back', {
                        defaultValue: 'You do not follow them',
                      })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <h3 className="t-label">
          {t('hours-title', {
            defaultValue: 'When your audience engages',
          })}
        </h3>
        <p className="t-meta">
          {t('hours-note', {
            defaultValue: 'Likes, comments and reposts on your posts over the last 90 days, in your time zone.',
          })}
        </p>
        <EngagementHoursGrid grid={data.engagement} />
      </div>

      <div className="space-y-1">
        <h3 className="t-label">
          {t('mutuals-title', {
            defaultValue: 'Mutuals',
          })}
        </h3>
        {data.mutuals.followers === 0 ? (
          <p className="t-body text-site-text-muted">
            {t('mutuals-empty', {
              defaultValue: 'You have no followers yet.',
            })}
          </p>
        ) : (
          <p className="t-body text-site-text">
            {t('mutuals-share', {
              defaultValue: 'You follow back {{share}} of your followers ({{mutual}} of {{followers}}).',
              share: percent.format(data.mutuals.mutual / data.mutuals.followers),
              mutual: number.format(data.mutuals.mutual),
              followers: number.format(data.mutuals.followers),
            })}
          </p>
        )}
      </div>
    </section>
  );
}
