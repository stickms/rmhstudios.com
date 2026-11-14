/* eslint-disable local/no-adhoc-spinner -- in-button busy icon or inline status: <Spinner> renders role="status" and would join the control accessible name */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { SpineItem } from '@/components/ui/spine';
import { useArrival } from '@/components/ui/arrive';
import { cn } from '@/lib/utils';
import { postSummaryApi } from '@/lib/feed/rmhark-actions.contract';
import { api } from '@/lib/contract/client';
import { HttpError } from '@/lib/http';

/**
 *"Summarize thread"affordance shown above a busy comment section. Lazy — only
 * calls the AI endpoint when the user asks for it.
 */
export function ThreadSummary({ postId, commentCount }: { postId: string; commentCount: number }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const { t } = useTranslation('feed');
  // Steel M9: the summary (or why there is none) replaces "Summarizing…".
  const arrival = useArrival(!loading);

  // Only worth offering on threads with enough discussion.
  if (commentCount < 4) return null;

  const run = async () => {
    setLoading(true);
    setError(null);
    setRequested(true);
    try {
      const data = await api(postSummaryApi, { params: { id: postId } });
      if (data.summary) setSummary(data.summary);
      else setError(t('not-enough-to-summarize', { defaultValue: 'Not enough to summarize yet.' }));
    } catch (e) {
      if (e instanceof HttpError && e.status === 503) {
        setError(
          t('summaries-unavailable', { defaultValue: 'Summaries are unavailable right now.' }),
        );
      } else if (e instanceof HttpError) {
        // Same as before: any other error answer carried no summary.
        setError(t('not-enough-to-summarize', { defaultValue: 'Not enough to summarize yet.' }));
      } else {
        setError(t('summarize-error', { defaultValue: 'Could not summarize this thread.' }));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SpineItem dot={false}>
      {!requested ? (
        <button onClick={run} className="feed-action">
          {t('summarize-thread', { defaultValue: 'Summarize this thread' })}
        </button>
      ) : loading ? (
        <p className="t-body flex items-center gap-2 text-site-text-muted">
          <Loader2 className="size-4 animate-spin" />
          {t('summarizing', { defaultValue: 'Summarizing…' })}
        </p>
      ) : error ? (
        <p className={cn('t-body text-site-text-muted', arrival)}>{error}</p>
      ) : (
        <div className={arrival}>
          <p className="t-label">{t('ai-summary', { defaultValue: 'AI summary' })}</p>
          <p className="t-body mt-1 whitespace-pre-line">{summary}</p>
        </div>
      )}
    </SpineItem>
  );
}
