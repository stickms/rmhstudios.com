import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useArrival } from '@/components/ui/arrive';
import { SendFeedback } from '@/components/feedback/SendFeedback';
import { useFeedbackLabels } from '@/components/feedback/feedback-labels';
import { apiQuery } from '@/lib/contract/client';
import { listMyFeedbackApi } from '@/lib/feedback/inbox.contract';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';

/** The member's own feedback as rows on rules: category, first line, status, outcome and any reply. */
export function MyFeedbackList() {
  const { t } = useTranslation('feedback-inbox');
  const fmt = useLocaleFormat();
  const labels = useFeedbackLabels();
  const { data, isPending, isError } = useQuery(apiQuery(listMyFeedbackApi));
  const arrival = useArrival(!isPending);

  const sendLink = (
    <SendFeedback className="t-body font-medium underline">
      {t('send-feedback', {
        defaultValue: 'Send feedback',
      })}
    </SendFeedback>
  );

  if (isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (isError) {
    return (
      <p role="alert" className="t-body text-site-danger">
        {t('mine-error', {
          defaultValue: 'Could not load your feedback. Try again in a moment.',
        })}
      </p>
    );
  }
  if (data.rows.length === 0) {
    return (
      <EmptyState
        className={arrival}
        title={t('mine-empty-title', {
          defaultValue: 'You have not sent any feedback',
        })}
        description={t('mine-empty-description', {
          defaultValue: 'Found a bug or hit a barrier? Tell us and we will answer here.',
        })}
        action={sendLink}
      />
    );
  }
  return (
    <div className={arrival}>
      <ul>
        {data.rows.map((r) => (
          <li key={r.id} className="border-b border-site-border py-3">
            <p className="t-label">
              {labels.categoryOf(r.category)}
              <span className="t-meta">
                {' · '}
                {fmt.date(r.createdAt)}
              </span>
            </p>
            <p className="t-body mt-1 whitespace-pre-wrap break-words">{r.message}</p>
            <p className="t-meta mt-1">
              {labels.statusOf(r.status)}
              {r.status === 'closed' && r.outcome ? ` · ${labels.outcomeOf(r.outcome)}` : ''}
            </p>
            {r.reply ? (
              <div className="mt-2 border-l border-site-border pl-3">
                <p className="t-label">
                  {t('mine-reply', {
                    defaultValue: 'Our reply',
                  })}
                </p>
                <p className="t-body whitespace-pre-wrap break-words">{r.reply}</p>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-4">{sendLink}</p>
    </div>
  );
}
