import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { api } from '@/lib/contract/client';
import { requestNewsSummaryApi } from '@/lib/news-wire/news-wire.contract';
import type { NewsSummary as Summary, SummaryResult, SummaryUnavailableReason } from '@/lib/news-wire/summary';

type State =
  { kind: 'loading' } | { kind: 'ready'; summary: Summary } | { kind: 'unavailable'; reason: SummaryUnavailableReason };

interface NewsSummaryProps {
  slug: string;
  /** The cached summary from the loader, when one exists: drawn at once, nothing is requested. */
  initial: Summary | null;
  publisher: string;
}

/**
 * The AI summary on an RMH News article. A cached one arrives in the page's HTML; otherwise the browser asks for it
 * after hydration (lib/news-wire/summary.server.ts writes it on that first request and caches it on the article), so
 * only opened articles ever cost tokens and nothing a crawler renders asks for one. It is deliberately not part of the
 * route loader: a loader runs on the server for every render, crawlers included.
 */
export function NewsSummary({ slug, initial, publisher }: NewsSummaryProps) {
  const { t } = useTranslation('c-news');
  // React Query, not an effect: one request per article per session however often the page is revisited, never on
  // the server (nothing prefetches this key), and no retry (a failure shows "Try again"; the server already retried).
  const query = useQuery<SummaryResult>({
    queryKey: ['news-summary', slug],
    queryFn: () => api(requestNewsSummaryApi, { body: { slug }, timeoutMs: 45_000 }),
    enabled: !initial,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
  });
  const state: State = initial
    ? { kind: 'ready', summary: initial }
    : query.data
      ? query.data.status === 'ready'
        ? { kind: 'ready', summary: query.data.summary }
        : { kind: 'unavailable', reason: query.data.reason }
      : query.isError
        ? { kind: 'unavailable', reason: 'error' }
        : { kind: 'loading' };
  // Steel M9: a summary that replaces its skeleton fades in; one in the HTML does not.
  const arrival = useArrival(state.kind !== 'loading');

  return (
    <section aria-labelledby="news-summary-heading" aria-busy={state.kind === 'loading'} className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="news-summary-heading" className="t-heading">
          {t('summary-heading', { defaultValue: 'Summary' })}
        </h2>
        <p className="t-meta">
          {t('summary-source', { defaultValue: 'Written by AI from the {{publisher}} article', publisher })}
        </p>
      </div>

      {state.kind === 'loading' ? (
        <div className="space-y-2" role="status">
          <span className="sr-only">{t('summary-loading', { defaultValue: 'Writing the summary' })}</span>
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-10/12" />
          <Skeleton className="h-4 w-9/12" />
        </div>
      ) : null}

      {state.kind === 'ready' ? (
        <div className={arrival}>
          <p className="t-prose text-site-text">{state.summary.tldr}</p>
          <ul className="t-post mt-3 list-disc space-y-1.5 ps-5 text-site-text">
            {state.summary.points.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.kind === 'unavailable' ? (
        <div className={`${arrival ?? ''} flex flex-wrap items-center gap-3`}>
          <p className="t-body text-site-text-muted">
            {state.reason === 'no-text'
              ? t('summary-no-text', {
                  defaultValue: 'No summary for this one: the original page could not be read. The excerpt is below.',
                })
              : state.reason === 'ai-off'
                ? t('summary-ai-off', { defaultValue: 'Summaries are switched off on this server.' })
                : state.reason === 'busy'
                  ? t('summary-busy', { defaultValue: 'Summaries are paused for today. Try again tomorrow.' })
                  : t('summary-error', { defaultValue: 'The summary could not be written right now.' })}
          </p>
          {state.reason === 'error' ? (
            <Button size="sm" loading={query.isFetching} onClick={() => void query.refetch()}>
              {t('summary-retry', { defaultValue: 'Try again' })}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
