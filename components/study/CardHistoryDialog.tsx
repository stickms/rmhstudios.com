import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { gradeKey, type CardState } from '@/lib/study/card-history';
import { cardHistoryApi, restartCardApi } from '@/lib/study/card-history.contract';
import { reviewQueueApi } from '@/lib/study/queue.contract';
import { getStudyStatsApi } from '@/lib/study/stats.contract';

interface Props {
  cardId: string;
  /** The card's front, member text, shown above the figures. */
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** One card's history for the member studying it: its state, schedule and last reviews, and "Start this card over". */
export function CardHistoryDialog({ cardId, label, open, onOpenChange }: Props) {
  const { t, i18n } = useTranslation('card-history');
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const query = useQuery({
    ...apiQuery(cardHistoryApi, { params: { id: cardId } }),
    enabled: open,
    retry: false,
    // The numbers change with every review; reopening reads them again.
    staleTime: 0,
  });
  const data = query.data;
  const loading = data === undefined && !query.isError;
  const arrival = useArrival(!loading);

  const dateTime = (iso: string): string => {
    try {
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch {
      return iso;
    }
  };
  const date = (iso: string): string => {
    try {
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium' }).format(new Date(iso));
    } catch {
      return iso;
    }
  };
  const days = (n: number): string =>
    t('days', {
      count: n,
      defaultValue_one: '{{count}} day',
      defaultValue_other: '{{count}} days',
      defaultValue: '{{count}} days',
    });
  const ease = (n: number): string => {
    try {
      return new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2 }).format(n);
    } catch {
      return String(n);
    }
  };

  function stateText(state: CardState): string {
    switch (state) {
      case 'new':
        return t('state-new', { defaultValue: 'New' });
      case 'learning':
        return t('state-learning', { defaultValue: 'Learning' });
      case 'review':
        return t('state-review', { defaultValue: 'Review' });
      case 'suspended':
        return t('state-suspended', { defaultValue: 'Suspended' });
      case 'leech':
        return t('state-leech', { defaultValue: 'Leech, set aside' });
    }
  }

  function gradeText(grade: number): string {
    switch (gradeKey(grade)) {
      case 'again':
        return t('grade-again', { defaultValue: 'Again' });
      case 'hard':
        return t('grade-hard', { defaultValue: 'Hard' });
      case 'good':
        return t('grade-good', { defaultValue: 'Good' });
      case 'easy':
        return t('grade-easy', { defaultValue: 'Easy' });
      default:
        return String(grade);
    }
  }

  async function startOver() {
    if (busy) return;
    const ok = await confirm({
      title: t('restart-confirm-title', { defaultValue: 'Start this card over?' }),
      description: t('restart-confirm-description', {
        defaultValue:
          'It becomes a new card in your next session. Your past reviews stay in the history and in your stats. This cannot be undone.',
      }),
      confirmLabel: t('restart-confirm', { defaultValue: 'Start over' }),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api(restartCardApi, { params: { id: cardId } });
      // The next session reads the queue again; the one on screen keeps its cards until it ends.
      void queryClient.invalidateQueries({ queryKey: [reviewQueueApi.path], refetchType: 'none' });
      void queryClient.invalidateQueries({ queryKey: [getStudyStatsApi.path] });
      await query.refetch();
      toast.success(t('restarted', { defaultValue: 'Card started over' }));
    } catch {
      toast.error(t('restart-failed', { defaultValue: 'Could not start that card over' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent mobileFullscreen className="flex max-h-[85dvh] w-full max-w-lg flex-col gap-4">
        <div className="space-y-1">
          <DialogTitle className="t-heading">{t('title', { defaultValue: 'Card info' })}</DialogTitle>
          <DialogDescription dir="auto" className="line-clamp-2 break-words">
            {label}
          </DialogDescription>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div className="space-y-2" role="status" aria-label={t('loading', { defaultValue: 'Loading the history' })}>
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/3" />
            </div>
          ) : !data ? (
            <div className="flex flex-col items-start gap-2">
              <p role="alert" className="t-body text-site-danger">
                {t('error', { defaultValue: 'Could not load this card’s history.' })}
              </p>
              <Button variant="default" size="sm" onClick={() => void query.refetch()}>
                {t('retry', { defaultValue: 'Try again' })}
              </Button>
            </div>
          ) : (
            <div className={arrival}>
              <dl className="divide-y divide-site-border border-y border-site-border">
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="t-label">{t('state', { defaultValue: 'State' })}</dt>
                  <dd className="t-body">{stateText(data.state)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="t-label">{t('next-due', { defaultValue: 'Next due' })}</dt>
                  <dd className="t-meta">
                    {data.dueAt && data.state !== 'suspended' && data.state !== 'leech'
                      ? dateTime(data.dueAt)
                      : t('not-due', { defaultValue: 'Not scheduled' })}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="t-label">{t('interval', { defaultValue: 'Interval' })}</dt>
                  <dd className="t-meta">{days(data.intervalDays)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="t-label">{t('ease', { defaultValue: 'Ease' })}</dt>
                  <dd className="t-meta">{ease(data.easeFactor)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="t-label">{t('lapses', { defaultValue: 'Lapses' })}</dt>
                  <dd className="t-meta">{data.lapses}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-4 py-2">
                  <dt className="t-label">{t('total', { defaultValue: 'Reviews' })}</dt>
                  <dd className="t-meta">{data.total}</dd>
                </div>
              </dl>
              {data.resetAt && (
                <p className="t-meta border-b border-site-border py-2">
                  {t('started-over', { date: date(data.resetAt), defaultValue: 'Started over on {{date}}' })}
                </p>
              )}
              {data.reviews.length === 0 ? (
                <p className="t-body py-4 text-site-text-muted">
                  {t('no-reviews', { defaultValue: 'No reviews yet. They appear here after you grade this card.' })}
                </p>
              ) : (
                <table className="mt-4 w-full text-start">
                  <caption className="t-label pb-2 text-start">
                    {data.total > data.reviews.length
                      ? t('reviews-latest', {
                          count: data.reviews.length,
                          defaultValue_one: 'Latest review',
                          defaultValue_other: 'Latest {{count}} reviews',
                          defaultValue: 'Latest {{count}} reviews',
                        })
                      : t('reviews', { defaultValue: 'Reviews' })}
                  </caption>
                  <thead>
                    <tr className="border-b border-site-border">
                      <th scope="col" className="t-label py-1.5 text-start">
                        {t('col-date', { defaultValue: 'Date' })}
                      </th>
                      <th scope="col" className="t-label py-1.5 text-start">
                        {t('col-answer', { defaultValue: 'Answer' })}
                      </th>
                      <th scope="col" className="t-label py-1.5 text-end">
                        {t('col-interval', { defaultValue: 'Next in' })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.reviews.map((r, i) => (
                      <tr key={`${r.reviewedAt}-${i}`} className="border-b border-site-border">
                        <td className="t-meta py-1.5">{dateTime(r.reviewedAt)}</td>
                        <td className="t-body py-1.5">{gradeText(r.grade)}</td>
                        <td className="t-meta py-1.5 text-end">{days(r.intervalDays)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="default" disabled={busy || !data} onClick={() => void startOver()}>
            {t('restart', { defaultValue: 'Start this card over' })}
          </Button>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('close', { defaultValue: 'Close' })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
