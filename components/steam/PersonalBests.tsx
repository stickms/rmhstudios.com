import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LineChart } from '@/components/ui/line-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery } from '@/lib/contract/client';
import { clearPersonalBestsApi, getPersonalBestsApi } from '@/lib/game/personal-bests.contract';
import { changeOf, formatBest, formatChange, improvementOver, stepSeries } from '@/lib/game/personal-bests';
import { toast } from '@/lib/toast';

const RECENT = 10;
const WINDOW_DAYS = 30;

/**
 * "Your bests" on a game's page: how the signed-in player's best moved over time. Nothing is
 * rendered while loading beyond a still skeleton, on an error, or when the player has no records;
 * the history is private to the player, so a signed-out viewer never reaches this component.
 */
export function PersonalBests({ gameId }: { gameId: string }) {
  const { t, i18n } = useTranslation('personal-bests');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);

  const input = {
    params: {
      id: gameId,
    },
  };
  const query = useQuery({
    ...apiQuery(getPersonalBestsApi, input),
    retry: false,
  });
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const lowerIsBetter = query.data?.lowerIsBetter ?? false;
  const arrival = useArrival(!query.isPending);

  const clear = useMutation({
    mutationFn: () => api(clearPersonalBestsApi, input),
    onSuccess: () => {
      setShowAll(false);
      queryClient.setQueryData(apiQuery(getPersonalBestsApi, input).queryKey, {
        lowerIsBetter,
        rows: [],
      });
      toast.success(
        t('cleared', {
          defaultValue: 'History cleared',
        }),
      );
    },
    onError: () =>
      toast.error(
        t('clear-failed', {
          defaultValue: 'Could not clear your history',
        }),
      ),
  });

  const locale = i18n.language;
  const date = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
      }),
    [locale],
  );
  const best = (n: number) => formatBest(n, lowerIsBetter, locale);
  const shortDate = (iso: string) => date.format(new Date(iso));

  const chartLabels = useMemo(
    () => ({
      showChart: t('chart-show-chart', {
        defaultValue: 'Show as chart',
      }),
      showTable: t('chart-show-table', {
        defaultValue: 'Show as table',
      }),
      day: t('chart-table-date', {
        defaultValue: 'Date',
      }),
      points: t('chart-points', {
        defaultValue: 'Records',
      }),
      seriesSummary: (v: { label: string; first: string; last: string; min: string; max: string }) =>
        t('chart-series-summary', {
          defaultValue: '{{label}}: from {{first}} to {{last}}, lowest {{min}}, highest {{max}}.',
          ...v,
        }),
    }),
    [t],
  );

  if (query.isPending) {
    return (
      <section id="your-bests" className="stm-card" aria-labelledby="stm-pb-h" aria-busy="true">
        <h2 id="stm-pb-h" className="stm-card-head">
          {t('title', {
            defaultValue: 'Your bests',
          })}
        </h2>
        <div className="stm-pb">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="mt-3 h-40 w-full" />
        </div>
      </section>
    );
  }
  // An error, or no records yet: the section is not shown.
  const latest = rows[0];
  if (query.isError || !latest) return null;

  const thirtyDays = improvementOver(rows, WINDOW_DAYS, Date.now());
  const changeText = (row: (typeof rows)[number]) => {
    const change = changeOf(row);
    return change === null
      ? t('first-score', {
          defaultValue: 'First score',
        })
      : formatChange(change, lowerIsBetter, locale);
  };

  const renderRows = (list: typeof rows) => (
    <ol className="stm-pb-rows">
      {list.map((row) => (
        <li key={row.id} className="stm-pb-row">
          <time className="stm-pb-date" dateTime={row.at}>
            {shortDate(row.at)}
          </time>
          <span className="stm-pb-score">{best(row.score)}</span>
          <span className="stm-pb-change">{changeText(row)}</span>
        </li>
      ))}
    </ol>
  );

  const onClear = async () => {
    const ok = await confirm({
      title: t('clear-title', {
        defaultValue: 'Clear your history for this game?',
      }),
      description: t('clear-description', {
        defaultValue: 'Your record history here is deleted. Your best on the leaderboard is not affected.',
      }),
      confirmLabel: t('clear-confirm', {
        defaultValue: 'Clear history',
      }),
      cancelLabel: t('clear-cancel', {
        defaultValue: 'Cancel',
      }),
      danger: true,
    });
    if (ok) clear.mutate();
  };

  return (
    <section id="your-bests" className={`stm-card ${arrival ?? ''}`} aria-labelledby="stm-pb-h">
      <h2 id="stm-pb-h" className="stm-card-head">
        {t('title', {
          defaultValue: 'Your bests',
        })}
      </h2>
      <div className="stm-pb">
        <p className="stm-pb-head">
          <span className="stm-pb-best">
            <span className="stm-pb-note">
              {t('current-best', {
                defaultValue: 'Current best',
              })}{' '}
            </span>
            {best(latest.score)}
          </span>
          {thirtyDays !== null && thirtyDays !== 0 ? (
            <span className="stm-pb-note">
              {t('improvement-30', {
                defaultValue: '{{change}} in 30 days',
                change: formatChange(thirtyDays, lowerIsBetter, locale),
              })}
            </span>
          ) : null}
        </p>
        <LineChart
          label={t('chart-label', {
            defaultValue: 'Your best over time',
          })}
          labels={chartLabels}
          formatX={shortDate}
          formatY={best}
          series={[
            {
              id: 'best',
              label: t('series-best', {
                defaultValue: 'Best',
              }),
              points: stepSeries(rows),
            },
          ]}
        />
        {renderRows(rows.slice(0, RECENT))}
        <div className="stm-pb-actions">
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>
            {t('show-all', {
              defaultValue: 'Show all',
            })}
          </Button>
        </div>
      </div>

      <Dialog open={showAll} onOpenChange={setShowAll}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {t('all-title', {
                defaultValue: 'All your records',
              })}
            </DialogTitle>
            <DialogDescription>
              {t('all-description', {
                defaultValue: '{{n}} records, newest first.',
                n: rows.length,
              })}
            </DialogDescription>
          </DialogHeader>
          <div className="stm-pb max-h-[60vh] overflow-y-auto">{renderRows(rows)}</div>
          <div className="stm-pb-actions">
            <Button variant="danger" size="sm" onClick={onClear} loading={clear.isPending}>
              {t('clear-history', {
                defaultValue: 'Clear history',
              })}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
