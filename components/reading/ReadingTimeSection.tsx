/**
 * Reading time on "My reading" (sprint 07 18): the opt-in switch, the weekly
 * target, this week by day, the last four weeks, the month's most-read documents
 * and "Delete my reading time". Private to the member. Rows on rules, figures in
 * `t-meta` (D10's default: no chart).
 */

import {
  useState,
  type FormEvent,
} from 'react';
import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from '@/lib/toast';
import {
  api,
  apiQuery,
} from '@/lib/contract/client';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  deleteReadingTimeApi,
  readingTimeSummaryApi,
  setReadingTimePrefsApi,
} from '@/lib/reading/time.contract';
import {
  minutesOf,
  WEEKLY_TARGET_MAX,
  WEEKLY_TARGET_MIN,
} from '@/lib/reading/time';

function dayDate(
  day: string,
): Date {
  const [
    y,
    m,
    d,
  ] =
    day
      .split(
        '-',
      )
      .map(
        Number,
      );
  return new Date(
    Date.UTC(
      y ??
        1970,
      (m ??
        1) -
        1,
      d ??
        1,
    ),
  );
}

export default function ReadingTimeSection() {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'reading-time',
    );
  const {
    data: session,
  } =
    useSession();
  const queryClient =
    useQueryClient();
  const confirm =
    useConfirm();
  const lang =
    i18n.language;
  const tz =
    (() => {
      try {
        return Intl.DateTimeFormat().resolvedOptions()
          .timeZone;
      } catch {
        return undefined;
      }
    })();
  const summary =
    useQuery(
      {
        ...apiQuery(
          readingTimeSummaryApi,
          {
            query:
              {
                ...(tz
                  ? {
                      tz,
                    }
                  : {}),
                locale:
                  lang,
              },
          },
        ),
        enabled:
          !!session,
      },
    );
  const [
    target,
    setTarget,
  ] =
    useState<
      | string
      | null
    >(
      null,
    );
  const arrival =
    useArrival(
      !summary.isPending,
    );

  const refresh =
    () =>
      queryClient.invalidateQueries(
        {
          queryKey:
            [
              readingTimeSummaryApi.path,
            ],
        },
      );
  const savePrefs =
    useMutation(
      {
        mutationFn:
          (body: {
            trackTime?: boolean;
            weeklyMinutesTarget?:
              | number
              | null;
          }) =>
            api(
              setReadingTimePrefsApi,
              {
                body,
              },
            ),
        onSuccess:
          () => {
            void refresh();
            void queryClient.invalidateQueries(
              {
                queryKey:
                  [
                    setReadingTimePrefsApi.path,
                  ],
              },
            );
          },
        onError:
          () =>
            toast.error(
              t(
                'save-failed',
                {
                  defaultValue:
                    'Could not save that.',
                },
              ),
            ),
      },
    );

  if (
    !session
  )
    return null;
  if (
    summary.isPending
  )
    return (
      <Skeleton className="h-32 w-full" />
    );
  if (
    summary.isError ||
    !summary.data
  ) {
    return (
      <p
        className="t-body text-site-text-muted"
        role="status"
      >
        {t(
          'load-failed',
          {
            defaultValue:
              'Could not load your reading time.',
          },
        )}
      </p>
    );
  }
  const s =
    summary.data;
  const nf =
    new Intl.NumberFormat(
      lang,
    );
  const dayFmt =
    new Intl.DateTimeFormat(
      lang,
      {
        weekday:
          'short',
        month:
          'short',
        day: 'numeric',
        timeZone:
          'UTC',
      },
    );
  const hasData =
    s.weekSeconds >
      0 ||
    s.previousWeeks.some(
      (
        w,
      ) =>
        w.seconds >
        0,
    ) ||
    s
      .topThisMonth
      .length >
      0;
  const targetValue =
    target ??
    (s.weeklyMinutesTarget ===
    null
      ? ''
      : String(
          s.weeklyMinutesTarget,
        ));

  async function saveTarget(
    value:
      | number
      | null,
  ) {
    try {
      await savePrefs.mutateAsync(
        {
          weeklyMinutesTarget:
            value,
        },
      );
      setTarget(
        null,
      );
      toast.success(
        t(
          'target-saved',
          {
            defaultValue:
              'Weekly target saved.',
          },
        ),
      );
    } catch {
      /* the mutation's onError already said so */
    }
  }

  function submitTarget(
    e: FormEvent,
  ) {
    e.preventDefault();
    const n =
      Math.floor(
        Number(
          targetValue,
        ),
      );
    if (
      targetValue.trim() ===
        '' ||
      !Number.isFinite(
        n,
      ) ||
      n <
        WEEKLY_TARGET_MIN ||
      n >
        WEEKLY_TARGET_MAX
    ) {
      toast.error(
        t(
          'target-invalid',
          {
            min: WEEKLY_TARGET_MIN,
            max: nf.format(
              WEEKLY_TARGET_MAX,
            ),
            defaultValue:
              'Enter a target between {{min}} and {{max}} minutes.',
          },
        ),
      );
      return;
    }
    void saveTarget(
      n,
    );
  }

  async function deleteAll() {
    const ok =
      await confirm(
        {
          title:
            t(
              'delete-title',
              {
                defaultValue:
                  'Delete your reading time?',
              },
            ),
          description:
            t(
              'delete-body',
              {
                defaultValue:
                  'Every day and document total is removed. This cannot be undone.',
              },
            ),
          confirmLabel:
            t(
              'delete-confirm',
              {
                defaultValue:
                  'Delete',
              },
            ),
          danger: true,
        },
      );
    if (
      !ok
    )
      return;
    try {
      await api(
        deleteReadingTimeApi,
      );
      void refresh();
      toast.success(
        t(
          'deleted',
          {
            defaultValue:
              'Reading time deleted.',
          },
        ),
      );
    } catch {
      toast.error(
        t(
          'delete-failed',
          {
            defaultValue:
              'Could not delete your reading time.',
          },
        ),
      );
    }
  }

  const minutes =
    (
      seconds: number,
    ) =>
      t(
        'minutes-short',
        {
          count:
            minutesOf(
              seconds,
            ),
          defaultValue:
            '{{count}} min',
        },
      );

  return (
    <section
      className={`space-y-4 border-b border-site-border pb-6 ${arrival ?? ''}`}
      aria-labelledby="reading-time-title"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-64 flex-1">
          <h3
            id="reading-time-title"
            className="t-heading"
          >
            {t(
              'title',
              {
                defaultValue:
                  'Reading time',
              },
            )}
          </h3>
          <p
            id="reading-time-hint"
            className="t-body mt-1 text-site-text-muted"
          >
            {t(
              'hint',
              {
                defaultValue:
                  'Counted from scrolling, keys and page turns while a book or article is open. Only you can see it.',
              },
            )}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <span
            id="reading-time-switch-label"
            className="t-label"
          >
            {t(
              'track-label',
              {
                defaultValue:
                  'Keep track of my reading time',
              },
            )}
          </span>
          <Switch
            checked={
              s.trackTime
            }
            disabled={
              savePrefs.isPending
            }
            onCheckedChange={(
              on,
            ) =>
              savePrefs.mutate(
                {
                  trackTime:
                    on,
                },
              )
            }
            aria-labelledby="reading-time-switch-label"
            aria-describedby="reading-time-hint"
          />
        </span>
      </div>

      {s.trackTime ? (
        <form
          onSubmit={
            submitTarget
          }
          className="flex flex-wrap items-end gap-2"
        >
          <label className="flex flex-col gap-1">
            <span className="t-label">
              {t(
                'target-label',
                {
                  defaultValue:
                    'Weekly target (minutes)',
                },
              )}
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={
                WEEKLY_TARGET_MIN
              }
              max={
                WEEKLY_TARGET_MAX
              }
              value={
                targetValue
              }
              onChange={(
                e,
              ) =>
                setTarget(
                  e
                    .target
                    .value,
                )
              }
              className="w-40"
            />
          </label>
          <Button
            type="submit"
            disabled={
              savePrefs.isPending
            }
          >
            {t(
              'target-save',
              {
                defaultValue:
                  'Save target',
              },
            )}
          </Button>
          {s.weeklyMinutesTarget !==
          null ? (
            <Button
              type="button"
              variant="ghost"
              disabled={
                savePrefs.isPending
              }
              onClick={() =>
                void saveTarget(
                  null,
                )
              }
            >
              {t(
                'target-clear',
                {
                  defaultValue:
                    'Clear target',
                },
              )}
            </Button>
          ) : null}
        </form>
      ) : (
        <p className="t-meta">
          {t(
            'off-note',
            {
              defaultValue:
                'Tracking is off. Nothing is measured or sent.',
            },
          )}
        </p>
      )}

      {s.trackTime ||
      hasData ? (
        <>
          <div>
            <h4 className="t-label">
              {t(
                'this-week',
                {
                  defaultValue:
                    'This week',
                },
              )}
            </h4>
            {s.weeklyMinutesTarget !==
            null ? (
              <p className="t-body mt-1">
                {t(
                  'week-progress',
                  {
                    done: nf.format(
                      minutesOf(
                        s.weekSeconds,
                      ),
                    ),
                    target:
                      nf.format(
                        s.weeklyMinutesTarget,
                      ),
                    defaultValue:
                      '{{done}} of {{target}} minutes',
                  },
                )}
              </p>
            ) : (
              <p className="t-body mt-1">
                {minutes(
                  s.weekSeconds,
                )}
              </p>
            )}
            <ul className="mt-2">
              {s.days.map(
                (
                  d,
                ) => (
                  <li
                    key={
                      d.day
                    }
                    className="flex items-baseline justify-between gap-4 border-b border-site-border py-2"
                  >
                    <span className="t-body">
                      {dayFmt.format(
                        dayDate(
                          d.day,
                        ),
                      )}
                      {d.day ===
                      s.today ? (
                        <span className="t-meta ms-2">
                          {t(
                            'today',
                            {
                              defaultValue:
                                'Today',
                            },
                          )}
                        </span>
                      ) : null}
                    </span>
                    <span className="t-meta">
                      {minutes(
                        d.seconds,
                      )}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>

          <div>
            <h4 className="t-label">
              {t(
                'previous-weeks',
                {
                  defaultValue:
                    'Previous four weeks',
                },
              )}
            </h4>
            <ul className="mt-2">
              {s.previousWeeks.map(
                (
                  w,
                ) => (
                  <li
                    key={
                      w.weekStart
                    }
                    className="flex items-baseline justify-between gap-4 border-b border-site-border py-2"
                  >
                    <span className="t-body">
                      {t(
                        'week-of',
                        {
                          date: dayFmt.format(
                            dayDate(
                              w.weekStart,
                            ),
                          ),
                          defaultValue:
                            'Week of {{date}}',
                        },
                      )}
                    </span>
                    <span className="t-meta">
                      {minutes(
                        w.seconds,
                      )}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>

          <div>
            <h4 className="t-label">
              {t(
                'top-month',
                {
                  defaultValue:
                    'Most time this month',
                },
              )}
            </h4>
            {s
              .topThisMonth
              .length ===
            0 ? (
              <p className="t-meta mt-2">
                {t(
                  'top-empty',
                  {
                    defaultValue:
                      'Nothing read yet this month.',
                  },
                )}
              </p>
            ) : (
              <ul className="mt-2">
                {s.topThisMonth.map(
                  (
                    d,
                  ) => (
                    <li
                      key={`${d.kind}:${d.key}`}
                      className="flex items-baseline justify-between gap-4 border-b border-site-border py-2"
                    >
                      <span className="t-body min-w-0 truncate">
                        {
                          d.title
                        }
                      </span>
                      <span className="t-meta shrink-0">
                        {minutes(
                          d.seconds,
                        )}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </>
      ) : null}

      <div>
        <Button
          type="button"
          variant="ghost"
          onClick={() =>
            void deleteAll()
          }
        >
          {t(
            'delete',
            {
              defaultValue:
                'Delete my reading time',
            },
          )}
        </Button>
      </div>
    </section>
  );
}
