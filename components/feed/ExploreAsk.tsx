'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useSession } from '@/components/Providers';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * The Explore page's AI slot — one place, directly under the search field, in
 * two forms.
 *
 * Explore and Search used to be two destinations with one name, and each had
 * grown its own AI affordance: `/explore` had "Ask the feed" (a free-form
 * question, answered from the timeline) and `/search` had "Ask AI about …" (a
 * summary of the results you are looking at). Merging the pages could have put
 * both on screen at once, which reads as two competing answer boxes. They are
 * the same slot instead, because they are never wanted at the same moment: with
 * nothing typed there is no query to summarise, and with a query on screen the
 * question has already been asked in the field.
 *
 * Both are opt-in — a button press, not a keystroke — so neither spends a model
 * call while somebody is still typing.
 */
export function ExploreAsk({ query }: { query: string }) {
  return query ? <AskAboutQuery query={query} /> : <AskTheFeed />;
}

/** Shared shell so the two forms are visibly one feature in one place. */
function AskShell({ children }: { children: React.ReactNode }) {
  return <div className="border-b border-site-border px-4 py-3">{children}</div>;
}

/** Shared answer body: the heading, the spinner, the error and the prose. */
function Answer({
  loading,
  error,
  answer,
  footer,
  onRetry,
}: {
  loading: boolean;
  error: boolean;
  answer: string | null;
  footer?: React.ReactNode;
  onRetry: () => void;
}) {
  const { t } = useTranslation('feed');

  return (
    <div className="glass-fill rounded-site px-3.5 py-3">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
        <Sparkles className="h-3.5 w-3.5 text-site-accent" aria-hidden />
        {t('ai-answer', { defaultValue: 'AI answer' })}
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-1 text-sm text-site-text-muted">
          <Spinner size={14} /> {t('ai-thinking', { defaultValue: 'Reading the results…' })}
        </div>
      ) : error ? (
        <p className="text-sm text-site-text-muted">
          {t('ai-error', { defaultValue: 'Could not generate an answer. Try again.' })}{' '}
          <button onClick={onRetry} className="text-site-accent hover:underline">
            {t('retry', { defaultValue: 'Try again' })}
          </button>
        </p>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-site-text">{answer}</p>
          {footer}
        </>
      )}
    </div>
  );
}

/**
 * No query: ask the feed a question of your own. Hidden from signed-out
 * visitors — the endpoint requires a session, so offering it would be a button
 * whose only outcome is a 401.
 */
function AskTheFeed() {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const ask = useCallback(async () => {
    const q = question.trim();
    if (q.length < 3) return;
    setLoading(true);
    setError(false);
    setAnswer(null);
    try {
      const res = await fetch('/api/ai/ask-feed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(res.status));
      setAnswer(typeof data.answer === 'string' ? data.answer : '');
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [question]);

  if (!session) return null;

  return (
    <AskShell>
      <label
        htmlFor="ask-feed"
        className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-site-text-dim"
      >
        <Sparkles className="h-3.5 w-3.5 text-site-accent" aria-hidden />
        {t('ask-the-feed', { defaultValue: 'Ask the feed' })}
      </label>
      {/* `min-w-0` on the input and `shrink-0` on the button: a flex child's
          default min-width is its CONTENT, so this ~250px placeholder forced the
          row wider than its container and pushed the Ask button off screen at
          320px. Below 360px the two stack, where a full-width button is the
          better shape anyway. */}
      <div className="flex flex-col gap-2 min-[360px]:flex-row">
        <input
          id="ask-feed"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && ask()}
          placeholder={t('ask-placeholder', { defaultValue: "What's everyone talking about?" })}
          className="glass-inset w-full min-w-0 flex-1 rounded-full px-4 py-2 text-sm text-site-text placeholder:text-site-text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/50"
        />
        <Button
          variant="accent"
          onClick={ask}
          loading={loading}
          disabled={question.trim().length < 3}
          className="shrink-0 rounded-full px-5"
        >
          {t('ask-button', { defaultValue: 'Ask' })}
        </Button>
      </div>
      {(loading || error || answer !== null) && (
        <div className="mt-3">
          <Answer loading={loading} error={error} answer={answer} onRetry={ask} />
        </div>
      )}
    </AskShell>
  );
}

/**
 * With a query: summarise the results below, grounded server-side in the same
 * corpus the tabs search.
 */
function AskAboutQuery({ query }: { query: string }) {
  const { t } = useTranslation('feed');
  const { data: session } = useSession();
  const [answer, setAnswer] = useState<string | null>(null);
  const [sourceCount, setSourceCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  // A new query invalidates any previous answer so the button reappears.
  useEffect(() => {
    setAnswer(null);
    setError(false);
    setLoading(false);
  }, [query]);

  const ask = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch('/api/ai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ q: query }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setAnswer(typeof data.answer === 'string' ? data.answer : '');
      setSourceCount(typeof data.sourceCount === 'number' ? data.sourceCount : 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [query]);

  if (!session) return null;

  return (
    <AskShell>
      {answer === null && !loading && !error ? (
        <button
          onClick={ask}
          className="glass-fill flex w-full items-center gap-2 rounded-site px-3 py-2 text-left text-sm font-medium text-site-text transition-colors duration-site hover:bg-site-surface-hover"
        >
          <Sparkles className="h-4 w-4 shrink-0 text-site-accent" aria-hidden />
          <span className="truncate">
            {t('ask-ai-about', { query, defaultValue: 'Ask AI about “{{query}}”' })}
          </span>
        </button>
      ) : (
        <Answer
          loading={loading}
          error={error}
          answer={answer}
          onRetry={ask}
          footer={
            sourceCount > 0 ? (
              <p className="mt-2 text-xs text-site-text-dim">
                {t('ai-based-on', {
                  count: sourceCount,
                  defaultValue: 'Based on {{count}} results below',
                })}
              </p>
            ) : null
          }
        />
      )}
    </AskShell>
  );
}
