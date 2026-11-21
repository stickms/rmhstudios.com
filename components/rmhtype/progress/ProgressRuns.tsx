/**
 * Recent runs, newest first, 25 to a page. Opens at `start` (a personal best's cursor) when one is given, and the
 * `mode` filter is the page's, so Races hides solo runs here too.
 */
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { rmhTypeRunsQuery } from '@/lib/rmhtype/rmhtype.queries';
import type {
  ProgressMode,
  RunRow,
} from '@/lib/rmhtype/progress';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ARRIVE,
  useArrival,
} from '@/components/ui/arrive';
import { useStableListMotion } from '@/hooks/useStableListMotion';
import { useProgressLabels } from '@/components/rmhtype/progress/progress-labels';
import { cn } from '@/lib/utils';

export function ProgressRuns({
  mode,
  start,
  onBackToLatest,
}: {
  mode: ProgressMode;
  start:
    | string
    | null;
  onBackToLatest: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'rmhtype-progress',
    );
  const f =
    useProgressLabels();
  const list =
    useInfiniteQuery(
      rmhTypeRunsQuery(
        mode,
        start,
      ),
    );
  const runs: RunRow[] | null =
    list.data
      ? list.data.pages.flatMap(
          (
            page,
          ) =>
            page.runs,
        )
      : null;
  const next =
    list.hasNextPage;
  const more =
    list.isFetchingNextPage;
  const failed =
    list.isError;
  const arrival =
    useArrival(
      runs !==
        null,
    );
  const entering =
    useStableListMotion(
      (
        runs ??
        []
      ).map(
        (
          r,
        ) =>
          r.id,
      ),
      {
        skipFirstAddition: true,
      },
    );


  if (
    failed
  ) {
    return (
      <div>
        <p className="text-app-danger">
          {t(
            'runs-failed',
            {
              defaultValue:
                'Could not load your runs.',
            },
          )}
        </p>
        <button
          type="button"
          className="mt-2 underline hover:text-app-text"
          onClick={() =>
            void list.refetch()
          }
        >
          {t(
            'retry',
            {
              defaultValue:
                'Try again',
            },
          )}
        </button>
      </div>
    );
  }

  if (
    runs ===
    null
  ) {
    return (
      <div
        className="space-y-2"
        role="status"
        aria-label={t(
          'runs-loading',
          {
            defaultValue:
              'Loading your runs',
          },
        )}
      >
        {Array.from(
          {
            length: 5,
          },
          (
            _,
            i,
          ) => (
            <Skeleton
              key={
                i
              }
              className="h-9 w-full"
            />
          ),
        )}
      </div>
    );
  }

  if (
    runs.length ===
    0
  ) {
    return (
      <p
        className={cn(
          'text-sm text-app-text-muted',
          arrival,
        )}
      >
        {t(
          'runs-empty',
          {
            defaultValue:
              'No runs to show for this filter yet.',
          },
        )}
      </p>
    );
  }

  return (
    <div
      className={
        arrival
      }
    >
      {start ? (
        <p className="mb-2 text-sm text-app-text-muted">
          {t(
            'runs-from-best',
            {
              defaultValue:
                'Starting at a personal best.',
            },
          )}{' '}
          <button
            type="button"
            className="underline hover:text-app-text"
            onClick={
              onBackToLatest
            }
          >
            {t(
              'runs-latest',
              {
                defaultValue:
                  'Back to latest',
              },
            )}
          </button>
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">
            {t(
              'runs-title',
              {
                defaultValue:
                  'Recent runs',
              },
            )}
          </caption>
          <thead>
            <tr className="border-b border-app-border text-left text-app-text-muted">
              <th
                scope="col"
                className="py-2 pr-3 font-medium"
              >
                {t(
                  'col-date',
                  {
                    defaultValue:
                      'Date',
                  },
                )}
              </th>
              <th
                scope="col"
                className="py-2 pr-3 font-medium"
              >
                {t(
                  'col-mode',
                  {
                    defaultValue:
                      'Mode',
                  },
                )}
              </th>
              <th
                scope="col"
                className="py-2 pr-3 font-medium"
              >
                {t(
                  'col-length',
                  {
                    defaultValue:
                      'Length',
                  },
                )}
              </th>
              <th
                scope="col"
                className="py-2 pr-3 font-medium"
              >
                {t(
                  'col-difficulty',
                  {
                    defaultValue:
                      'Difficulty',
                  },
                )}
              </th>
              <th
                scope="col"
                className="py-2 pr-3 text-right font-medium"
              >
                {t(
                  'col-speed',
                  {
                    defaultValue:
                      'Speed',
                  },
                )}
              </th>
              <th
                scope="col"
                className="py-2 pr-3 text-right font-medium"
              >
                {t(
                  'col-accuracy',
                  {
                    defaultValue:
                      'Accuracy',
                  },
                )}
              </th>
              <th
                scope="col"
                className="py-2 text-right font-medium"
              >
                {t(
                  'col-rank',
                  {
                    defaultValue:
                      'Place',
                  },
                )}
              </th>
            </tr>
          </thead>
          <tbody>
            {runs.map(
              (
                r,
              ) => (
                <tr
                  key={
                    r.id
                  }
                  className={cn(
                    'border-b border-app-border',
                    entering.has(
                      r.id,
                    ) &&
                      ARRIVE,
                  )}
                >
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {f.dateTime(
                      r.at,
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {r.solo
                      ? t(
                          'mode-solo',
                          {
                            defaultValue:
                              'Solo',
                          },
                        )
                      : t(
                          'mode-race',
                          {
                            defaultValue:
                              'Race',
                          },
                        )}
                  </td>
                  <td className="py-2 pr-3">
                    {f.length(
                      r.passageLength,
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    {f.difficulty(
                      r.difficulty,
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {f.wpm(
                      r.wpm,
                    )}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono">
                    {f.accuracy(
                      r.accuracy,
                    )}
                  </td>
                  <td className="py-2 text-right font-mono">
                    {r.rank ===
                    null
                      ? '-'
                      : f.number(
                          r.rank,
                        )}
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {next ? (
        <div className="mt-3">
          <Button
            type="button"
            loading={
              more
            }
            onClick={() =>
              void list.fetchNextPage()
            }
          >
            {t(
              'runs-more',
              {
                defaultValue:
                  'Show more runs',
              },
            )}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
