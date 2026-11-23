import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useSession } from '@/components/session/session-context';
import { SignedOutPrompt } from '@/components/ui/signed-out-prompt';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { errorField } from '@/lib/http';
import { askStatusQuery } from '../../medschools.queries';
import { AnswerView } from './AnswerView';
import { AskForm } from './AskForm';
import { LimitRequest } from './LimitRequest';
import { useAsk } from './useAsk';

/** The wait: a labelled status line and still blocks the shape of an answer (no pulse; M6). */
function PendingView() {
  const { t } = useTranslation('medschools');
  return (
    <div role="status" aria-busy="true" className="mt-6">
      <p className="t-meta m-0">{t('ask-pending', { defaultValue: 'Checking the data. This takes a few seconds.' })}</p>
      <div aria-hidden="true" className="mt-2 border-t border-site-border">
        {[0, 1, 2].map((i) => (
          <div key={i} className="border-b border-site-border py-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="mt-2 h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Where signing in returns: a school page's own panel (`#ask`), else the Ask page with the question the link carried
 * (`?q=`) so it is not lost on the way through the sign-in screen.
 */
export function signInReturnPath(slug: string | undefined, question: string): string {
  if (slug) return `/rmh-medschool/${encodeURIComponent(slug)}#ask`;
  const q = question.trim();
  return q ? `/rmh-medschool/ask?q=${encodeURIComponent(q)}` : '/rmh-medschool/ask';
}

/**
 * Ask a question about the public data. Signed out it is the site's sign-in prompt and sends nothing. `slug` pins a
 * school (the school page's panel); without it the question names its schools. The typed question survives every
 * failure so the member can retry. Nothing is stored here either: the answer lives in this component's state.
 */
export function AskPanel({
  slug,
  schoolName,
  heading = 'page',
  initialQuestion = '',
}: {
  slug?: string;
  schoolName?: string;
  heading?: 'page' | 'section';
  initialQuestion?: string;
}) {
  const { t } = useTranslation('medschools');
  const { data: session, isPending: sessionPending } = useSession();
  const signedIn = !!session;
  const refusal = useRefusalText();
  const status = useQuery({ ...askStatusQuery(), enabled: signedIn });
  const [question, setQuestion] = useState(initialQuestion);
  const run = useAsk();
  const arrival = useArrival(run.state === 'done');

  if (!signedIn) {
    if (sessionPending) return null;
    return (
      <SignedOutPrompt
        title={t('ask-signed-out-title', { defaultValue: 'Sign in to ask a question' })}
        description={t('ask-signed-out-body', {
          defaultValue: 'Answers use RMH’s public data. You need an account to ask.',
        })}
        callbackURL={signInReturnPath(slug, initialQuestion)}
      />
    );
  }

  const configured = status.data?.configured ?? true;
  const remaining = status.data?.remainingToday ?? null;
  const cap = status.data?.dailyCap ?? null;

  const errorText = (() => {
    if (run.state !== 'error') return null;
    const code = errorField<string>(run.error, 'code');
    const base = refusal(run.error).replace(/[.。]+$/, '');
    if (code === 'MEDSCHOOLS_QA_DAILY_CAP')
      return `${base}. ${t('ask-cap-reset', { defaultValue: 'Questions reset at 00:00 UTC.' })}`;
    // The busy sentence already says when to try again.
    if (code === 'MEDSCHOOLS_QA_BUSY') return `${base}.`;
    if (code === 'MEDSCHOOLS_QA_PAUSED' || code === 'AI_UNAVAILABLE')
      return `${base}. ${t('ask-retry-later', { defaultValue: 'Your question is kept. Try again in a few minutes.' })}`;
    return `${base}. ${t('ask-retry', { defaultValue: 'Your question is kept. Try again.' })}`;
  })();

  const title =
    heading === 'section'
      ? schoolName
        ? t('ask-heading-school', { defaultValue: 'Ask about {{school}}', school: schoolName })
        : t('ask-heading', { defaultValue: 'Ask the data' })
      : null;

  return (
    <section
      id="ask"
      className="flex flex-col gap-3"
      aria-label={title ? undefined : t('ask-heading', { defaultValue: 'Ask the data' })}
    >
      {title ? <h2 className="t-heading m-0">{title}</h2> : null}
      <AskForm
        question={question}
        onQuestion={setQuestion}
        onSubmit={() => run.ask({ question: question.trim(), ...(slug ? { slug } : {}) })}
        onCancel={run.cancel}
        pending={run.state === 'pending'}
        configured={configured}
        remaining={remaining}
        cap={cap}
        admin={status.data?.tier === 'admin'}
        pinned={!!slug}
        showSuggestions={run.state === 'idle' || run.state === 'error'}
      />
      <LimitRequest tier={status.data?.tier ?? null} />
      {run.state === 'pending' ? <PendingView /> : null}
      {errorText ? (
        <p className="t-body m-0 border-t border-site-border pt-3" role="alert">
          {errorText}
        </p>
      ) : null}
      {run.state === 'done' && run.res ? (
        <div className={arrival}>
          <AnswerView res={run.res} />
        </div>
      ) : null}
    </section>
  );
}
