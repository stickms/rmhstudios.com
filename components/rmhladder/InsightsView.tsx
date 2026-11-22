/**
 * RMH Ladder — the insights page body (sprint 03, feature 18). Presentational:
 * the route fetches and acts; this draws the numbers and owns every string.
 *
 * Every chart has a table alternative (the shared `BarChart` carries one), the
 * funnel is an ordered list with its numbers in text, and nothing is told by
 * colour: ink and muted only.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BarChart } from '@/components/ui/bar-chart';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Tabs } from '@/components/ui/tabs';
import { toast } from '@/lib/toast';
import {
  MIN_APPLICATIONS,
  MIN_GROUP_SIZE,
  RESPONSE_BUCKETS,
  type BreakdownDimension,
  type FunnelStepId,
  type InsightRange,
  type Insights,
  type QuietApplication,
} from '@/lib/rmhladder/insights';

export type QuietPatch =
  | {
      followUpDate: Date;
    }
  | {
      status: 'rejected';
    };

type QuietDays = '14' | '21' | '30';

const RANGES: InsightRange[] = ['90d', '1y', 'all'];
const QUIET_CHOICES: QuietDays[] = ['14', '21', '30'];

export function InsightsView({
  data,
  range,
  quietDays,
  onRangeChange,
  onQuietDaysChange,
  onPatch,
}: {
  data: Insights;
  range: InsightRange;
  quietDays: QuietDays;
  onRangeChange: (range: InsightRange) => void;
  onQuietDaysChange: (days: QuietDays) => void;
  /** Resolves true when the update was saved. */
  onPatch: (jobId: string, patch: QuietPatch) => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation('ladder-insights');
  const percent = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        style: 'percent',
        maximumFractionDigits: 0,
      }),
    [i18n.language],
  );
  const decimal = useMemo(
    () =>
      new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: 1,
      }),
    [i18n.language],
  );
  const whole = useMemo(() => new Intl.NumberFormat(i18n.language), [i18n.language]);

  const stepName: Record<FunnelStepId, string> = {
    applied: t('funnel.applied', {
      defaultValue: 'Applied',
    }),
    responded: t('funnel.responded', {
      defaultValue: 'Responded',
    }),
    interviewing: t('funnel.interviewing', {
      defaultValue: 'Interviewing',
    }),
    final_round: t('funnel.finalRound', {
      defaultValue: 'Final round',
    }),
    offer: t('funnel.offer', {
      defaultValue: 'Offer',
    }),
  };
  const days = (n: number) =>
    t('response.days', {
      count: n,
      n: decimal.format(n),
      defaultValue_one: '{{n}} day',
      defaultValue_other: '{{n}} days',
    });

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="t-body max-w-prose text-site-text-muted">
        {t('page.intro', {
          defaultValue: 'Your search as numbers, from the status changes you have recorded on the pipeline.',
        })}
      </p>
      <Tabs
        tabs={RANGES.map((id) => ({
          id,
          label:
            id === '90d'
              ? t('range.90d', {
                  defaultValue: '90 days',
                })
              : id === '1y'
                ? t('range.1y', {
                    defaultValue: '1 year',
                  })
                : t('range.all', {
                    defaultValue: 'All time',
                  }),
        }))}
        value={range}
        onChange={(id) => onRangeChange(id as InsightRange)}
        aria-label={t('range.label', {
          defaultValue: 'Time range',
        })}
        sheet={false}
      />
    </div>
  );

  if (data.applications < MIN_APPLICATIONS) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title={t('empty.title', {
            defaultValue: 'Not enough applications yet',
          })}
          description={t('empty.hint', {
            count: data.applications,
            n: whole.format(data.applications),
            defaultValue_one:
              'Insights start at {{min}} applications. You have {{n}} in this range. Try a longer range or mark more applications as applied on the pipeline.',
            defaultValue_other:
              'Insights start at {{min}} applications. You have {{n}} in this range. Try a longer range or mark more applications as applied on the pipeline.',
            min: MIN_APPLICATIONS,
          })}
        />
      </div>
    );
  }

  const bucketLabel = (index: number) =>
    index === RESPONSE_BUCKETS - 1
      ? t('response.bucketLast', {
          n: index + 1,
          defaultValue: 'Week {{n}} or later',
        })
      : t('response.bucket', {
          n: index + 1,
          defaultValue: 'Week {{n}}',
        });
  const weekFormat = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const weekLabel = (weekStart: string) => weekFormat.format(new Date(`${weekStart}T00:00:00Z`));
  const barColumns = (value: string) => ({
    label: t('chart.week', {
      defaultValue: 'Week starting',
    }),
    value,
  });

  return (
    <div className="space-y-10">
      {header}

      <section aria-labelledby="insights-funnel" className="space-y-2">
        <h2 id="insights-funnel" className="t-heading">
          {t('funnel.title', {
            defaultValue: 'Funnel',
          })}
        </h2>
        <ol>
          {data.funnel.map((step) => (
            <li
              key={step.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 border-b border-site-border py-3"
            >
              <span className="t-body">
                {stepName[step.id]}
                <span className="t-meta block">
                  {step.conversion === null
                    ? t('funnel.start', {
                        defaultValue: 'Every application you sent',
                      })
                    : t('funnel.conversion', {
                        defaultValue: '{{share}} of the step before',
                        share: percent.format(step.conversion),
                      })}
                </span>
              </span>
              <span className="t-heading">{whole.format(step.count)}</span>
            </li>
          ))}
        </ol>
        <p className="t-meta">
          {t('funnel.note', {
            defaultValue:
              'A step counts if the application ever reached it, so a rejection after an interview still counts as an interview.',
          })}
        </p>
      </section>

      <section aria-labelledby="insights-response" className="space-y-3">
        <h2 id="insights-response" className="t-heading">
          {t('response.title', {
            defaultValue: 'Time to first response',
          })}
        </h2>
        {data.response.count === 0 ? (
          <p className="t-body text-site-text-muted">
            {t('response.none', {
              defaultValue: 'No application in this range has a response yet.',
            })}
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-4 sm:max-w-md">
              <div>
                <dt className="t-label">
                  {t('response.median', {
                    defaultValue: 'Median',
                  })}
                </dt>
                <dd className="t-title m-0">{days(data.response.medianDays ?? 0)}</dd>
              </div>
              <div>
                <dt className="t-label">
                  {t('response.p75', {
                    defaultValue: '75th percentile',
                  })}
                </dt>
                <dd className="t-title m-0">{days(data.response.p75Days ?? 0)}</dd>
              </div>
            </dl>
            <BarChart
              bars={data.response.buckets.map((value, index) => ({
                label: bucketLabel(index),
                value,
              }))}
              label={t('response.chartLabel', {
                defaultValue: 'Responses by weeks waited',
              })}
              summary={t('response.chartSummary', {
                defaultValue: 'How many applications first heard back after each number of weeks.',
              })}
              columns={{
                label: t('response.chartWeeks', {
                  defaultValue: 'Weeks waited',
                }),
                value: t('response.chartCount', {
                  defaultValue: 'Applications',
                }),
              }}
            />
          </>
        )}
      </section>

      <section aria-labelledby="insights-weeks" className="space-y-4">
        <h2 id="insights-weeks" className="t-heading">
          {t('weeks.title', {
            defaultValue: 'Per week',
          })}
        </h2>
        {data.weeks.length === 0 ? (
          <p className="t-body text-site-text-muted">
            {t('weeks.none', {
              defaultValue: 'Nothing to chart in this range.',
            })}
          </p>
        ) : (
          <>
            <div>
              <h3 className="t-label mb-1">
                {t('weeks.applications', {
                  defaultValue: 'Applications sent',
                })}
              </h3>
              <BarChart
                bars={data.weeks.map((w) => ({
                  label: weekLabel(w.weekStart),
                  value: w.applications,
                }))}
                label={t('weeks.applicationsLabel', {
                  defaultValue: 'Applications sent per week',
                })}
                summary={t('weeks.applicationsSummary', {
                  defaultValue: 'Applications sent in each week of the range.',
                })}
                columns={barColumns(
                  t('weeks.applications', {
                    defaultValue: 'Applications sent',
                  }),
                )}
              />
            </div>
            <div>
              <h3 className="t-label mb-1">
                {t('weeks.responses', {
                  defaultValue: 'First responses',
                })}
              </h3>
              <BarChart
                bars={data.weeks.map((w) => ({
                  label: weekLabel(w.weekStart),
                  value: w.responses,
                }))}
                label={t('weeks.responsesLabel', {
                  defaultValue: 'First responses per week',
                })}
                summary={t('weeks.responsesSummary', {
                  defaultValue: 'Applications that first heard back in each week of the range.',
                })}
                columns={barColumns(
                  t('weeks.responses', {
                    defaultValue: 'First responses',
                  }),
                )}
              />
            </div>
          </>
        )}
      </section>

      <section aria-labelledby="insights-breakdown" className="space-y-4">
        <h2 id="insights-breakdown" className="t-heading">
          {t('breakdown.title', {
            defaultValue: 'What works',
          })}
        </h2>
        {data.breakdowns.length === 0 ? (
          <p className="t-body text-site-text-muted">
            {t('breakdown.none', {
              defaultValue: 'There is nothing to compare yet: the applications share one value.',
            })}
          </p>
        ) : (
          data.breakdowns.map(({ dimension, groups }) => {
            const dimensionName: Record<BreakdownDimension, string> = {
              referral: t('breakdown.referral', {
                defaultValue: 'Referral',
              }),
              source: t('breakdown.source', {
                defaultValue: 'Where the job was posted',
              }),
              program: t('breakdown.program', {
                defaultValue: 'Program type',
              }),
            };
            return (
              <div key={dimension} className="overflow-x-auto">
                <table className="w-full min-w-max border-collapse text-left">
                  <caption className="t-label pb-2 text-left">{dimensionName[dimension]}</caption>
                  <thead>
                    <tr className="border-b border-site-border">
                      <th scope="col" className="t-label py-2 pr-4">
                        {t('breakdown.group', {
                          defaultValue: 'Group',
                        })}
                      </th>
                      <th scope="col" className="t-label py-2 pr-4">
                        {t('breakdown.applications', {
                          defaultValue: 'Applications',
                        })}
                      </th>
                      <th scope="col" className="t-label py-2 pr-4">
                        {t('breakdown.response', {
                          defaultValue: 'Response rate',
                        })}
                      </th>
                      <th scope="col" className="t-label py-2 pr-4">
                        {t('breakdown.interview', {
                          defaultValue: 'Interview rate',
                        })}
                      </th>
                      <th scope="col" className="t-label py-2">
                        {t('breakdown.offer', {
                          defaultValue: 'Offer rate',
                        })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups.map((group) => (
                      <tr key={group.value} className="border-b border-site-border">
                        <th scope="row" className="t-body py-3 pr-4 font-normal">
                          {group.value === 'referral'
                            ? t('breakdown.withReferral', {
                                defaultValue: 'With a referral',
                              })
                            : group.value === 'no_referral'
                              ? t('breakdown.withoutReferral', {
                                  defaultValue: 'Without a referral',
                                })
                              : group.value}
                        </th>
                        <td className="t-body py-3 pr-4">{whole.format(group.applications)}</td>
                        {group.suppressed ? (
                          <td colSpan={3} className="t-meta py-3">
                            {t('breakdown.tooFew', {
                              min: MIN_GROUP_SIZE,
                              defaultValue: 'Too few to compare (under {{min}} applications)',
                            })}
                          </td>
                        ) : (
                          <>
                            <td className="t-body py-3 pr-4">{percent.format(group.responseRate ?? 0)}</td>
                            <td className="t-body py-3 pr-4">{percent.format(group.interviewRate ?? 0)}</td>
                            <td className="t-body py-3">{percent.format(group.offerRate ?? 0)}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })
        )}
      </section>

      <section aria-labelledby="insights-quiet" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="insights-quiet" className="t-heading">
            {t('quiet.title', {
              defaultValue: 'Quiet applications',
            })}
          </h2>
          <Select
            controlSize="sm"
            value={quietDays}
            aria-label={t('quiet.window', {
              defaultValue: 'Quiet after',
            })}
            onChange={(e) => onQuietDaysChange(e.target.value as QuietDays)}
          >
            {QUIET_CHOICES.map((choice) => (
              <option key={choice} value={choice}>
                {t('quiet.choice', {
                  n: Number(choice),
                  count: Number(Number(choice)),
                  defaultValue_one: '{{n}} day without news',
                  defaultValue: '{{n}} days without news',
                })}
              </option>
            ))}
          </Select>
        </div>
        {data.quiet.length === 0 ? (
          <p className="t-body text-site-text-muted">
            {t('quiet.none', {
              defaultValue: 'No application has gone quiet.',
            })}
          </p>
        ) : (
          <ul>
            {data.quiet.map((item) => (
              <QuietRow key={item.applicationId} item={item} onPatch={onPatch} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="insights-outcomes" className="space-y-2">
        <h2 id="insights-outcomes" className="t-heading">
          {t('outcomes.title', {
            defaultValue: 'Outcomes',
          })}
        </h2>
        <dl>
          {(
            [
              [
                'offers',
                t('outcomes.offers', {
                  defaultValue: 'Offers received',
                }),
              ],
              [
                'accepted',
                t('outcomes.accepted', {
                  defaultValue: 'Offers accepted',
                }),
              ],
              [
                'declined',
                t('outcomes.declined', {
                  defaultValue: 'Offers declined',
                }),
              ],
              [
                'withdrawn',
                t('outcomes.withdrawn', {
                  defaultValue: 'Withdrawn',
                }),
              ],
              [
                'rejected',
                t('outcomes.rejected', {
                  defaultValue: 'Rejected',
                }),
              ],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="flex items-baseline justify-between gap-4 border-b border-site-border py-3">
              <dt className="t-body">{label}</dt>
              <dd className="t-heading m-0">{whole.format(data.outcomes[key])}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function QuietRow({
  item,
  onPatch,
}: {
  item: QuietApplication;
  onPatch: (jobId: string, patch: QuietPatch) => Promise<boolean>;
}) {
  const { t } = useTranslation('ladder-insights');
  const [editing, setEditing] = useState(false);
  const [day, setDay] = useState(item.followUpDate ?? '');
  const [busy, setBusy] = useState(false);

  async function run(patch: QuietPatch, done: string) {
    setBusy(true);
    const ok = await onPatch(item.jobId, patch);
    setBusy(false);
    if (ok) {
      setEditing(false);
      toast.success(done);
    } else {
      toast.error(
        t('quiet.failed', {
          defaultValue: 'That did not save. Try again.',
        }),
      );
    }
  }

  return (
    <li className="border-b border-site-border py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="t-body">
          {item.title}
          <span className="t-meta block">
            {item.company}
            {item.appliedDate
              ? ` · ${t('quiet.applied', { date: item.appliedDate, defaultValue: 'applied {{date}}' })}`
              : ''}
            {` · ${t('quiet.quietFor', { count: item.daysQuiet, defaultValue_one: '{{count}} day quiet', defaultValue_other: '{{count}} days quiet' })}`}
            {item.followUpDate
              ? ` · ${t('quiet.followUp', { date: item.followUpDate, defaultValue: 'follow-up {{date}}' })}`
              : ''}
          </span>
        </span>
        <span className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="default"
            aria-expanded={editing}
            disabled={busy}
            onClick={() => setEditing((open) => !open)}
          >
            {t('quiet.setFollowUp', {
              defaultValue: 'Set follow-up',
            })}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="default"
            disabled={busy}
            onClick={() =>
              void run(
                {
                  status: 'rejected',
                },
                t('quiet.rejectedDone', {
                  defaultValue: 'Marked as rejected',
                }),
              )
            }
          >
            {t('quiet.markRejected', {
              defaultValue: 'Mark rejected',
            })}
          </Button>
        </span>
      </div>
      {editing && (
        <form
          className="mt-3 flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!day) return;
            void run(
              {
                followUpDate: new Date(`${day}T00:00:00Z`),
              },
              t('quiet.followUpDone', {
                defaultValue: 'Follow-up date saved',
              }),
            );
          }}
        >
          <Input
            type="date"
            className="w-auto"
            value={day}
            required
            aria-label={t('quiet.followUpDate', {
              defaultValue: 'Follow-up date',
            })}
            onChange={(e) => setDay(e.target.value)}
          />
          <Button type="submit" size="sm" variant="default" disabled={busy || !day}>
            {t('quiet.save', {
              defaultValue: 'Save',
            })}
          </Button>
        </form>
      )}
    </li>
  );
}
