import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/contract/client';
import { Button } from '@/components/ui/button';
import { useArrivingKeys } from '@/components/ui/arrive';
import { formatMinutes } from '@/lib/rmhstudy/history';
import { getFocusSessionsApi } from '@/lib/rmhstudy/history.contract';

/** The member's focus runs, newest first, 20 a page. Pages by keyset cursor, so no row repeats. */
export default function FocusSessions({ timeZone }: { timeZone: string | undefined }) {
  const { t, i18n } = useTranslation('rmhstudy-focus');
  const locale = i18n.language;

  const query = useInfiniteQuery({
    queryKey: [getFocusSessionsApi.path, 'pages'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api(getFocusSessionsApi, {
        query: pageParam
          ? {
              cursor: pageParam,
            }
          : {},
        signal,
      }),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    retry: false,
  });

  const rows = useMemo(() => query.data?.pages.flatMap((p) => p.sessions) ?? [], [query.data]);
  const arrived = useArrivingKeys(rows.map((r) => r.id));
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        ...(timeZone
          ? {
              timeZone,
            }
          : {}),
      }),
    [locale, timeZone],
  );
  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        timeStyle: 'short',
        ...(timeZone
          ? {
              timeZone,
            }
          : {}),
      }),
    [locale, timeZone],
  );

  return (
    <section className="space-y-3" aria-labelledby="focus-sessions">
      <h2 id="focus-sessions" className="text-lg font-semibold">
        {t('sessions-heading', {
          defaultValue: 'Sessions',
        })}
      </h2>

      {query.isError ? (
        <div className="space-y-2">
          <p className="text-sm text-app-text-muted">
            {t('sessions-error', {
              defaultValue: 'Could not load your sessions.',
            })}
          </p>
          <Button variant="default" onClick={() => void query.refetch()}>
            {t('retry', {
              defaultValue: 'Try again',
            })}
          </Button>
        </div>
      ) : query.isPending ? (
        <p className="text-sm text-app-text-muted" aria-busy>
          {t('sessions-loading', {
            defaultValue: 'Loading sessions',
          })}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-app-text-muted">
          {t('sessions-empty', {
            defaultValue: 'No sessions yet. Finish a focus run and it appears here.',
          })}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-start text-sm">
              <thead>
                <tr className="border-b border-app-border">
                  <th scope="col" className="py-2 pe-3 text-start font-semibold">
                    {t('col-date', {
                      defaultValue: 'Date',
                    })}
                  </th>
                  <th scope="col" className="px-2 py-2 text-start font-semibold">
                    {t('col-time', {
                      defaultValue: 'Start time',
                    })}
                  </th>
                  <th scope="col" className="px-2 py-2 text-end font-semibold">
                    {t('col-focus', {
                      defaultValue: 'Focus',
                    })}
                  </th>
                  <th scope="col" className="px-2 py-2 text-end font-semibold">
                    {t('col-break', {
                      defaultValue: 'Break',
                    })}
                  </th>
                  <th scope="col" className="px-2 py-2 text-end font-semibold">
                    {t('col-pomodoros', {
                      defaultValue: 'Pomodoros',
                    })}
                  </th>
                  <th scope="col" className="py-2 ps-3 text-start font-semibold">
                    {t('col-room', {
                      defaultValue: 'Room',
                    })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const at = new Date(r.startedAt);
                  return (
                    <tr key={r.id} className={`border-b border-app-border${arrived(r.id) ? ' arrive' : ''}`}>
                      <th scope="row" className="py-2 pe-3 text-start font-medium">
                        {dateFormat.format(at)}
                      </th>
                      <td className="px-2 py-2 text-app-text-muted">{timeFormat.format(at)}</td>
                      <td className="px-2 py-2 text-end">{formatMinutes(r.focusMinutes, locale)}</td>
                      <td className="px-2 py-2 text-end text-app-text-muted">
                        {r.breakMinutes > 0 ? formatMinutes(r.breakMinutes, locale) : '–'}
                      </td>
                      <td className="px-2 py-2 text-end">{r.pomodoros}</td>
                      <td className="py-2 ps-3 text-app-text-muted">{r.roomCode ?? '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {query.hasNextPage ? (
            <Button variant="default" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              {t('sessions-more', {
                defaultValue: 'Show more',
              })}
            </Button>
          ) : null}
        </>
      )}
    </section>
  );
}
