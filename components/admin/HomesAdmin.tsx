import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { HomesAddFeedDialog } from '@/components/admin/HomesAddFeedDialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { useArrival } from '@/components/ui/arrive';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { toast } from '@/lib/toast';
import { api } from '@/lib/contract/client';
import { listAdminHomesApi, runAdminHomesScrapeApi, setAdminHomeSourceStatusApi } from '@/lib/admin/homes.contract';
import type { AdminHomeSource, HomeRunTrigger, HomeSourceProvider, HomeSourceStatus } from '@/lib/admin/homes';

/**
 * /admin/homes: every RMHHomes scrape source with its status (a word, never only a colour) and last error, the last 20
 * runs, and the actions: pause or resume a source, add an RSS feed, run a scrape now. Rows on rules, figures in
 * `t-meta` (D10).
 */
export function HomesAdmin() {
  const { t } = useTranslation('admin-homes');
  const refusalText = useRefusalText();
  const fmt = useLocaleFormat();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [queueing, setQueueing] = useState(false);
  const [adding, setAdding] = useState(false);

  const page = useQuery({
    queryKey: [listAdminHomesApi.path],
    queryFn: ({ signal }) => api(listAdminHomesApi, { signal }),
  });
  const arrival = useArrival(!page.isPending);
  const refresh = () => queryClient.invalidateQueries({ queryKey: [listAdminHomesApi.path] });

  const statusLabel = (s: HomeSourceStatus): string => {
    switch (s) {
      case 'ACTIVE':
        return t('status-active', { defaultValue: 'Active' });
      case 'DISABLED':
        return t('status-paused', { defaultValue: 'Paused' });
      case 'ERROR':
        return t('status-error', { defaultValue: 'Error' });
      case 'BLOCKED':
        return t('status-blocked', { defaultValue: 'Blocked' });
    }
  };
  const providerLabel = (p: HomeSourceProvider): string =>
    p === 'RSS' ? t('provider-rss', { defaultValue: 'RSS' }) : t('provider-craigslist', { defaultValue: 'Craigslist' });
  const triggerLabel = (tr: HomeRunTrigger): string =>
    tr === 'MANUAL'
      ? t('trigger-manual', { defaultValue: 'Manual' })
      : t('trigger-cron', { defaultValue: 'Scheduled' });
  const when = (iso: string | null): string => (iso ? fmt.dateTime(iso) : t('never', { defaultValue: 'Never' }));

  const change = async (source: AdminHomeSource, action: 'pause' | 'resume') => {
    setBusy(source.id);
    try {
      await api(setAdminHomeSourceStatusApi, {
        params: { id: source.id },
        body: { action, seen: source.status },
      });
      toast.success(
        action === 'pause'
          ? t('paused-toast', { defaultValue: 'Source paused.' })
          : t('resumed-toast', { defaultValue: 'Source resumed.' }),
      );
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ?? t('change-failed', { defaultValue: 'That change did not save. Try again.' }),
      );
    } finally {
      // A stale status (someone else changed it, or a run did) is shown as it is now.
      await refresh();
      setBusy(null);
    }
  };

  const pause = async (source: AdminHomeSource) => {
    const ok = await confirm({
      title: t('pause-title', { defaultValue: 'Pause this source?' }),
      description: t('pause-description', {
        defaultValue: 'It is not fetched again until you resume it. Its listings stay until they expire.',
      }),
      confirmLabel: t('pause-confirm', { defaultValue: 'Pause' }),
      cancelLabel: t('cancel', { defaultValue: 'Cancel' }),
    });
    if (ok) await change(source, 'pause');
  };

  const runNow = async () => {
    setQueueing(true);
    try {
      await api(runAdminHomesScrapeApi);
      toast.success(t('queued-toast', { defaultValue: 'Scrape queued. It starts when the worker picks it up.' }));
      await refresh();
    } catch (error) {
      toast.error(
        refusalText.maybe(error) ?? t('queue-failed', { defaultValue: 'The scrape could not be queued. Try again.' }),
      );
    } finally {
      setQueueing(false);
    }
  };

  const seconds = (ms: number | null): string =>
    ms === null
      ? t('running', { defaultValue: 'Running' })
      : t('duration-seconds', {
          defaultValue: '{{s}} s',
          s: fmt.number(ms / 1000, { maximumFractionDigits: 1 }),
        });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" loading={queueing} onClick={() => void runNow()}>
          {t('run-now', { defaultValue: 'Run scrape now' })}
        </Button>
        <Button variant="default" onClick={() => setAdding(true)}>
          {t('add-feed', { defaultValue: 'Add RSS feed' })}
        </Button>
      </div>
      <HomesAddFeedDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={() => {
          setAdding(false);
          toast.success(t('added-toast', { defaultValue: 'Feed added. It is fetched on the next run.' }));
          void refresh();
        }}
      />

      {page.isPending ? (
        <div className="space-y-3" aria-busy="true" aria-label={t('loading', { defaultValue: 'Loading sources' })}>
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : page.isError ? (
        <div role="alert" className="space-y-3 border-b border-site-border py-4">
          <p className="t-body text-site-danger">{t('load-failed', { defaultValue: 'The sources did not load.' })}</p>
          <Button variant="default" onClick={() => void page.refetch()}>
            {t('retry', { defaultValue: 'Try again' })}
          </Button>
        </div>
      ) : (
        <div className={`space-y-8 ${arrival ?? ''}`}>
          <section aria-labelledby="homes-sources-heading" className="space-y-3">
            <h2 id="homes-sources-heading" className="t-heading text-site-text">
              {t('sources-heading', { defaultValue: 'Sources' })}
            </h2>
            {page.data.sources.length === 0 ? (
              <EmptyState
                title={t('sources-empty-title', { defaultValue: 'No sources yet' })}
                description={t('sources-empty-description', {
                  defaultValue: 'Add an RSS feed, or let the worker seed the default Craigslist regions.',
                })}
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] border-collapse text-start">
                  <caption className="sr-only">{t('sources-caption', { defaultValue: 'Scrape sources' })}</caption>
                  <thead>
                    <tr className="border-b border-site-border">
                      <th scope="col" className="t-label py-2 pe-3 text-start">
                        {t('col-source', { defaultValue: 'Source' })}
                      </th>
                      <th scope="col" className="t-label py-2 pe-3 text-start">
                        {t('col-status', { defaultValue: 'Status' })}
                      </th>
                      <th scope="col" className="t-label py-2 pe-3 text-start">
                        {t('col-last-run', { defaultValue: 'Last run' })}
                      </th>
                      <th scope="col" className="t-label py-2 pe-3 text-start">
                        {t('col-last-success', { defaultValue: 'Last success' })}
                      </th>
                      <th scope="col" className="t-label py-2 pe-3 text-end">
                        {t('col-listings', { defaultValue: 'Active listings' })}
                      </th>
                      <th scope="col" className="t-label py-2 text-end">
                        {t('col-actions', { defaultValue: 'Actions' })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.data.sources.map((s) => (
                      <tr key={s.id} className="border-b border-site-border align-top">
                        <td className="min-w-0 py-3 pe-3">
                          <p className="t-body break-words text-site-text" dir="auto">
                            {s.label}
                          </p>
                          <p className="t-meta break-all text-site-text-muted" dir="ltr">
                            {providerLabel(s.provider)} · {s.feed ?? s.key}
                          </p>
                        </td>
                        <td className="py-3 pe-3">
                          <p
                            className={
                              s.status === 'ERROR' || s.status === 'BLOCKED'
                                ? 't-body text-site-danger'
                                : 't-body text-site-text'
                            }
                          >
                            {statusLabel(s.status)}
                          </p>
                          {s.lastError ? (
                            <p className="t-meta break-words text-site-text-muted" dir="auto">
                              {s.lastError}
                            </p>
                          ) : null}
                        </td>
                        <td className="t-meta py-3 pe-3 text-site-text-muted">{when(s.lastRunAt)}</td>
                        <td className="t-meta py-3 pe-3 text-site-text-muted">{when(s.lastSuccessAt)}</td>
                        <td className="t-meta py-3 pe-3 text-end text-site-text">{fmt.number(s.activeListings)}</td>
                        <td className="py-3 text-end">
                          {s.status === 'DISABLED' ? (
                            <Button
                              variant="default"
                              disabled={busy === s.id}
                              aria-label={t('resume-label', { defaultValue: 'Resume {{name}}', name: s.label })}
                              onClick={() => void change(s, 'resume')}
                            >
                              {t('resume', { defaultValue: 'Resume' })}
                            </Button>
                          ) : (
                            <Button
                              variant="default"
                              disabled={busy === s.id}
                              aria-label={t('pause-label', { defaultValue: 'Pause {{name}}', name: s.label })}
                              onClick={() => void pause(s)}
                            >
                              {t('pause', { defaultValue: 'Pause' })}
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="homes-runs-heading" className="space-y-3">
            <h2 id="homes-runs-heading" className="t-heading text-site-text">
              {t('runs-heading', { defaultValue: 'Recent runs' })}
            </h2>
            {page.data.runs.length === 0 ? (
              <p className="t-meta text-site-text-muted">{t('runs-empty', { defaultValue: 'No runs yet.' })}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] border-collapse text-start">
                  <caption className="sr-only">
                    {t('runs-caption', { defaultValue: 'The last 20 scrape runs' })}
                  </caption>
                  <thead>
                    <tr className="border-b border-site-border">
                      <th scope="col" className="t-label py-2 pe-3 text-start">
                        {t('run-col-trigger', { defaultValue: 'Trigger' })}
                      </th>
                      <th scope="col" className="t-label py-2 pe-3 text-start">
                        {t('run-col-started', { defaultValue: 'Started' })}
                      </th>
                      <th scope="col" className="t-label py-2 pe-3 text-end">
                        {t('run-col-duration', { defaultValue: 'Duration' })}
                      </th>
                      <th scope="col" className="t-label py-2 pe-3 text-end">
                        {t('run-col-found', { defaultValue: 'Found' })}
                      </th>
                      <th scope="col" className="t-label py-2 pe-3 text-end">
                        {t('run-col-new', { defaultValue: 'New' })}
                      </th>
                      <th scope="col" className="t-label py-2 pe-3 text-end">
                        {t('run-col-updated', { defaultValue: 'Updated' })}
                      </th>
                      <th scope="col" className="t-label py-2 pe-3 text-end">
                        {t('run-col-expired', { defaultValue: 'Expired' })}
                      </th>
                      <th scope="col" className="t-label py-2 text-end">
                        {t('run-col-errors', { defaultValue: 'Errors' })}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.data.runs.map((r) => (
                      <tr key={r.id} className="border-b border-site-border">
                        <td className="t-body py-2 pe-3 text-site-text">{triggerLabel(r.trigger)}</td>
                        <td className="t-meta py-2 pe-3 text-site-text-muted">{fmt.dateTime(r.startedAt)}</td>
                        <td className="t-meta py-2 pe-3 text-end text-site-text">{seconds(r.durationMs)}</td>
                        <td className="t-meta py-2 pe-3 text-end text-site-text">{fmt.number(r.discovered)}</td>
                        <td className="t-meta py-2 pe-3 text-end text-site-text">{fmt.number(r.created)}</td>
                        <td className="t-meta py-2 pe-3 text-end text-site-text">{fmt.number(r.updated)}</td>
                        <td className="t-meta py-2 pe-3 text-end text-site-text">{fmt.number(r.expired)}</td>
                        <td className="t-meta py-2 text-end text-site-text">{fmt.number(r.errors)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
