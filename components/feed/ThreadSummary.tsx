'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Loader2 } from 'lucide-react';

/**
 * "Summarize thread" affordance shown above a busy comment section. Lazy — only
 * calls the AI endpoint when the user asks for it.
 */
export function ThreadSummary({ postId, commentCount }: { postId: string; commentCount: number }) {
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requested, setRequested] = useState(false);
  const { t } = useTranslation('feed');

  // Only worth offering on threads with enough discussion.
  if (commentCount < 4) return null;

  const run = async () => {
    setLoading(true);
    setError(null);
    setRequested(true);
    try {
      const res = await fetch(`/api/rmharks/${postId}/summary`, { credentials: 'include' });
      if (res.status === 503) {
        setError(t('summaries-unavailable', { defaultValue: 'Summaries are unavailable right now.' }));
        return;
      }
      const data = await res.json();
      if (data.summary) setSummary(data.summary);
      else setError(t('not-enough-to-summarize', { defaultValue: 'Not enough to summarize yet.' }));
    } catch {
      setError(t('summarize-error', { defaultValue: 'Could not summarize this thread.' }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="my-3 rounded-site border border-site-border bg-site-surface p-3">
      {!requested ? (
        <button
          onClick={run}
          className="flex items-center gap-2 text-sm font-medium text-site-accent hover:underline"
        >
          <Sparkles className="h-4 w-4" />
          {t('summarize-thread', { defaultValue: 'Summarize this thread' })}
        </button>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-site-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('summarizing', { defaultValue: 'Summarizing…' })}
        </div>
      ) : error ? (
        <p className="text-sm text-site-text-muted">{error}</p>
      ) : (
        <div>
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
            <Sparkles className="h-3.5 w-3.5 text-site-accent" /> {t('ai-summary', { defaultValue: 'AI summary' })}
          </p>
          <p className="whitespace-pre-line text-sm text-site-text">{summary}</p>
        </div>
      )}
    </div>
  );
}
