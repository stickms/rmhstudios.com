/**
 * PracticeList — the practice log's recent activity: the member's entries, newest first, 30 a
 * page with Load more, filtered by kind with the shared Tabs. Song rows link to the song's
 * Progress view. Pages by id cursor, so an entry written while paging never repeats a row. A real
 * list on rules, no boxes.
 */
import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs } from '@/components/ui/tabs';
import { ARRIVE, useArrival, useArrivingKeys } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';
import type { PracticeFilter } from '@/lib/rmhmusic/history';
import { listPracticeApi } from '@/lib/rmhmusic/history.contract';
import { SECONDARY_BUTTON, TEXT_BUTTON } from '../buttons';
import { entryName, formatDuration, songModeName } from './history-text';

const TABS_ID = 'rmm-history-filter';

export function PracticeList() {
  const { t, i18n } = useTranslation('music-history');
  const { t: tLevel } = useTranslation('c-rmhmusic');
  const locale = i18n.language;
  const [filter, setFilter] = useState<PracticeFilter>('all');

  const query = useInfiniteQuery({
    queryKey: ['rmhmusic', 'history', 'entries', filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(listPracticeApi, {
        query: {
          ...(filter === 'all'
            ? {}
            : {
                kind: filter,
              }),
          ...(pageParam
            ? {
                cursor: pageParam,
              }
            : {}),
        },
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });
  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.entries) ?? [], [query.data]);
  const arrived = useArrivingKeys(rows.map((r) => r.id));
  const arrival = useArrival(!query.isPending);
  const when = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);

  const signedOut = query.error instanceof HttpError && query.error.status === 401;

  return (
    <section className="space-y-3" aria-labelledby="rmm-history-recent">
      <h2 id="rmm-history-recent" className="text-lg font-semibold text-app-text">
        {t('recent-heading', {
          defaultValue: 'Recent activity',
        })}
      </h2>
      <Tabs
        idBase={TABS_ID}
        tabs={[
          {
            id: 'all',
            label: t('filter-all', {
              defaultValue: 'All',
            }),
          },
          {
            id: 'lesson',
            label: t('filter-lessons', {
              defaultValue: 'Lessons',
            }),
          },
          {
            id: 'song',
            label: t('filter-songs', {
              defaultValue: 'Songs',
            }),
          },
          {
            id: 'sprint',
            label: t('filter-sprints', {
              defaultValue: 'Sprints',
            }),
          },
          {
            id: 'cards',
            label: t('filter-cards', {
              defaultValue: 'Cards',
            }),
          },
        ]}
        value={filter}
        onChange={(id) => setFilter(id as PracticeFilter)}
        aria-label={t('filter-label', {
          defaultValue: 'Filter by kind',
        })}
      />
      <div role="tabpanel" id={`${TABS_ID}-panel-${filter}`} aria-labelledby={`${TABS_ID}-tab-${filter}`}>
        {query.isError ? (
          <div role="alert" className="space-y-2">
            <p className="text-sm text-app-text-muted">
              {signedOut
                ? t('signed-out', {
                    defaultValue: 'Your session ended. Sign in again to see your history.',
                  })
                : t('list-error', {
                    defaultValue: 'Could not load your recent activity.',
                  })}
            </p>
            {signedOut ? (
              <Link
                to="/login"
                search={{
                  callbackURL: '/rmhmusic/history',
                }}
                className={TEXT_BUTTON}
              >
                {t('sign-in', {
                  defaultValue: 'Sign in',
                })}
              </Link>
            ) : (
              <button type="button" onClick={() => void query.refetch()} className={SECONDARY_BUTTON}>
                {t('retry', {
                  defaultValue: 'Try again',
                })}
              </button>
            )}
          </div>
        ) : query.isPending ? (
          <div aria-busy className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <p className="py-4 text-sm text-app-text-muted">
            {filter === 'all'
              ? t('list-empty', {
                  defaultValue:
                    'No practice yet. Finish a lesson, a song, a sprint or a card review and it appears here.',
                })
              : t('list-empty-kind', {
                  defaultValue: 'Nothing of this kind yet.',
                })}
          </p>
        ) : (
          <ul className={arrival}>
            {rows.map((r) => {
              const name = entryName(t, tLevel, r);
              return (
                <li
                  key={r.id}
                  className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-app-border py-3 ${arrived(r.id) ? ARRIVE : ''}`}
                >
                  <div className="min-w-0">
                    {r.kind === 'song' ? (
                      <Link
                        to="/rmhmusic/history"
                        search={{
                          song: r.refId,
                        }}
                        className="font-medium break-words text-app-text underline decoration-1 underline-offset-4"
                      >
                        {name}
                      </Link>
                    ) : (
                      <span className="font-medium break-words text-app-text">{name}</span>
                    )}
                    <p className="text-sm text-app-text-muted">
                      {[r.kind === 'song' ? songModeName(t, r.mode) : null, when.format(new Date(r.createdAt))]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <p className="text-sm text-app-text-muted">
                    {[
                      r.score !== null
                        ? t('row-score', {
                            defaultValue: 'Score {{score}}',
                            score: number.format(r.score),
                          })
                        : null,
                      r.durationMs !== null ? formatDuration(r.durationMs, locale) : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
        {query.hasNextPage ? (
          <div className="pt-3">
            <button
              type="button"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
              className={SECONDARY_BUTTON}
            >
              {t('load-more', {
                defaultValue: 'Load more',
              })}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
