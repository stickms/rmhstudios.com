import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { useSession } from '@/components/session/session-context';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { AI_TIMEOUT_MS, api } from '@/lib/contract/client';
import { QA_THINK_CLIENT_TIMEOUT_MS } from '../../ai-budget';
import { postMedInterviewFollowupsApi, type MedInterviewFollowupsRes } from '../../medschools.contract';
import { askStatusQuery } from '../../medschools.queries';

/**
 * "Suggest follow-ups": two or three questions an interviewer might ask next. The question and the member's notes go
 * to the server for this one call and are not stored; the result lives in this component's state. One suggestion takes
 * one of the day's Q&A questions, and the line says how many are left. Signed out it says to sign in and sends nothing.
 */
export function FollowupsSection({
  question,
  notes,
  slug,
}: {
  question: string;
  notes: string;
  slug?: string | undefined;
}) {
  const { t } = useTranslation('medschools');
  const id = useId();
  const { data: session } = useSession();
  const refusal = useRefusalText();
  const qc = useQueryClient();
  const signedIn = !!session;
  const status = useQuery({ ...askStatusQuery(), enabled: signedIn });
  const [think, setThink] = useState(false);
  const thinkNow = status.data?.thinkingAvailable === true && think;
  const run = useMutation<MedInterviewFollowupsRes, unknown, void>({
    mutationFn: () =>
      api(postMedInterviewFollowupsApi, {
        body: {
          question,
          ...(notes.trim() ? { notes: notes.trim() } : {}),
          ...(slug ? { slug } : {}),
          ...(thinkNow ? { think: true } : {}),
        },
        timeoutMs: thinkNow ? QA_THINK_CLIENT_TIMEOUT_MS : AI_TIMEOUT_MS,
      }),
    onSettled: () => void qc.invalidateQueries({ queryKey: askStatusQuery().queryKey }),
  });

  if (!signedIn) {
    return (
      <p className="t-meta m-0">
        {t('practice-followups-signed-out', { defaultValue: 'Sign in to get follow-up questions.' })}
      </p>
    );
  }
  const remaining = run.data?.remainingToday ?? status.data?.remainingToday ?? null;
  const configured = status.data?.configured ?? true;
  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} className="t-heading m-0">
        {t('practice-followups-title', { defaultValue: 'Follow-up questions' })}
      </h3>
      <p className="t-meta m-0">
        {t('practice-followups-help', {
          defaultValue:
            'The model suggests what an interviewer might ask next. Your question and notes are sent for this one request and are not stored. Each suggestion uses one of your daily questions.',
        })}
      </p>
      {status.data?.thinkingAvailable ? (
        <div className="flex items-center gap-3">
          <Switch
            id={`${id}-think`}
            checked={think}
            onCheckedChange={setThink}
            disabled={run.isPending}
            aria-labelledby={`${id}-tl`}
          />
          <span id={`${id}-tl`} className="t-label">
            {t('ask-think-label', { defaultValue: 'Think it through' })}
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="default"
          loading={run.isPending}
          disabled={!configured || remaining === 0}
          onClick={() => run.mutate()}
        >
          {t('practice-followups-submit', { defaultValue: 'Suggest follow-ups' })}
        </Button>
        {remaining !== null ? (
          <span className="t-meta">
            {t('practice-followups-left', {
              count: remaining,
              defaultValue_one: '{{count}} question left today',
              defaultValue_other: '{{count}} questions left today',
              defaultValue: '{{count}} questions left today',
            })}
          </span>
        ) : null}
      </div>
      {!configured ? (
        <p className="t-meta m-0">
          {t('practice-followups-off', { defaultValue: 'Suggestions are not available right now.' })}
        </p>
      ) : null}
      {run.isError ? (
        <p className="t-body m-0" role="alert">
          {refusal(run.error)}
        </p>
      ) : null}
      {run.data ? (
        <ol className="m-0 list-none border-t border-site-border p-0">
          {run.data.followups.map((f, i) => (
            <li key={i} className="t-body border-b border-site-border py-2 break-words">
              {f}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
