import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { usePrompt } from '@/components/ui/prompt-dialog';
import { Spinner } from '@/components/ui/spinner';
import { useArrival } from '@/components/ui/arrive';
import { api, apiQuery } from '@/lib/contract/client';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { QA_LIMIT_NOTE_MAX } from '@features/medschools/ai-budget';
import {
  decideMedQaLimitRequestApi,
  listMedQaLimitRequestsApi,
  type MedQaLimitRequestRowDto,
} from '@features/medschools/medschools.contract';

type Action = 'approve' | 'decline' | 'revoke';

/**
 * The Q&A limit queue of /admin/medschools (plan R19), the sibling of the library's upload appeals: pending requests,
 * oldest first, each with Approve and Decline and the optional note the member sees; then every approval still in force, each
 * revocable however old it is; then the recent declines and revokes. Rows on rules, no boxes. No ink primary (R4): the
 * row actions are all the same weight, and the page has no single action that outranks the rest. An approval puts the member in the approved tier.
 */
export function QaLimitRequestsPanel() {
  const { t } = useTranslation('medschools');
  const fmt = useLocaleFormat();
  const refusal = useRefusalText();
  const prompt = usePrompt();
  const qc = useQueryClient();
  const query = useQuery(apiQuery(listMedQaLimitRequestsApi));
  const arrival = useArrival(!!query.data);

  const decide = useMutation({
    mutationFn: (v: { id: string; action: Action; adminNote: string }) =>
      api(decideMedQaLimitRequestApi, {
        body: { id: v.id, action: v.action, ...(v.adminNote ? { adminNote: v.adminNote } : {}) },
      }),
    onSuccess: (_r, v) => {
      toast.success(
        v.action === 'approve'
          ? t('limits-approved', { defaultValue: 'Approved' })
          : v.action === 'decline'
            ? t('limits-declined', { defaultValue: 'Declined' })
            : t('limits-revoked', { defaultValue: 'Approval revoked' }),
      );
      void qc.invalidateQueries({ queryKey: [listMedQaLimitRequestsApi.path] });
    },
    onError: (e) => {
      toast.error(refusal.maybe(e) ?? t('limits-failed', { defaultValue: 'Could not update the request' }));
      // A request another admin already decided is fixed by reloading the list.
      void qc.invalidateQueries({ queryKey: [listMedQaLimitRequestsApi.path] });
    },
  });

  const act = async (row: MedQaLimitRequestRowDto, action: Action) => {
    const note = await prompt({
      title:
        action === 'approve'
          ? t('limits-note-approve', { defaultValue: 'Note for the member (optional)' })
          : action === 'decline'
            ? t('limits-note-decline', { defaultValue: 'Reason for declining (optional)' })
            : t('limits-note-revoke', { defaultValue: 'Reason for revoking (optional)' }),
      initialValue: '',
      validate: (v) =>
        v.length > QA_LIMIT_NOTE_MAX
          ? t('limits-note-long', { defaultValue: 'Keep it under {{max}} characters.', max: QA_LIMIT_NOTE_MAX })
          : null,
    });
    if (note === null) return;
    decide.mutate({ id: row.id, action, adminNote: note.trim() });
  };

  if (query.isPending) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }
  if (query.isError) {
    return (
      <EmptyState
        title={t('limits-load-failed', { defaultValue: 'Could not load the requests' })}
        action={<Button onClick={() => void query.refetch()}>{t('retry', { defaultValue: 'Try again' })}</Button>}
      />
    );
  }

  const who = (r: MedQaLimitRequestRowDto) => (r.user.handle ? `@${r.user.handle}` : (r.user.name ?? r.user.id));
  const { pending, active, recent } = query.data;
  const busy = decide.isPending;

  return (
    <div className={cn('flex flex-col gap-6', arrival)}>
      <section aria-labelledby="qa-limits-pending" className="flex flex-col gap-2">
        <h2 id="qa-limits-pending" className="t-heading m-0">
          {t('limits-pending-heading', { defaultValue: 'Waiting for review' })}
        </h2>
        {pending.length === 0 ? (
          <p className="t-body m-0 text-site-text-muted">
            {t('limits-none', { defaultValue: 'No pending limit requests.' })}
          </p>
        ) : (
          <ul className="m-0 list-none border-t border-site-border p-0">
            {pending.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-site-border py-3">
                <div className="min-w-0">
                  <p className="t-heading m-0 break-words">{who(r)}</p>
                  {r.note ? <p className="t-body m-0 mt-1 whitespace-pre-wrap break-words">{r.note}</p> : null}
                  <p className="t-meta m-0 mt-1">{fmt.relative(new Date(r.createdAt))}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" disabled={busy} onClick={() => void act(r, 'decline')}>
                    <X aria-hidden /> {t('limits-decline', { defaultValue: 'Decline' })}
                  </Button>
                  <Button size="sm" disabled={busy} onClick={() => void act(r, 'approve')}>
                    <Check aria-hidden /> {t('limits-approve', { defaultValue: 'Approve' })}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="qa-limits-active" className="flex flex-col gap-2">
        <h2 id="qa-limits-active" className="t-heading m-0">
          {t('limits-active-heading', { defaultValue: 'Active approvals' })}
        </h2>
        {active.length === 0 ? (
          <p className="t-body m-0 text-site-text-muted">
            {t('limits-active-none', { defaultValue: 'No approvals in force.' })}
          </p>
        ) : (
          <ul className="m-0 list-none border-t border-site-border p-0">
            {active.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-site-border py-3">
                <div className="min-w-0">
                  <p className="t-body m-0 break-words">{who(r)}</p>
                  {r.note ? <p className="t-meta m-0 mt-1 whitespace-pre-wrap break-words">{r.note}</p> : null}
                  {r.adminNote ? (
                    <p className="t-meta m-0 mt-1 whitespace-pre-wrap break-words">
                      {t('limits-your-note', { defaultValue: 'Note: {{note}}', note: r.adminNote })}
                    </p>
                  ) : null}
                  <p className="t-meta m-0 mt-1">{r.decidedAt ? fmt.relative(new Date(r.decidedAt)) : ''}</p>
                </div>
                <Button size="sm" disabled={busy} onClick={() => void act(r, 'revoke')}>
                  {t('limits-revoke', { defaultValue: 'Revoke' })}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="qa-limits-recent" className="flex flex-col gap-2">
        <h2 id="qa-limits-recent" className="t-heading m-0">
          {t('limits-recent-heading', { defaultValue: 'Recent decisions' })}
        </h2>
        {recent.length === 0 ? (
          <p className="t-body m-0 text-site-text-muted">{t('limits-recent-none', { defaultValue: 'Nothing decided yet.' })}</p>
        ) : (
          <ul className="m-0 list-none border-t border-site-border p-0">
            {recent.map((r) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-site-border py-3">
                <div className="min-w-0">
                  <p className="t-body m-0 break-words">
                    {who(r)}
                    {' · '}
                    {r.status === 'DECLINED'
                      ? t('limits-status-declined', { defaultValue: 'Declined' })
                      : t('limits-status-revoked', { defaultValue: 'Revoked' })}
                  </p>
                  {r.note ? <p className="t-meta m-0 mt-1 whitespace-pre-wrap break-words">{r.note}</p> : null}
                  {(r.status === 'REVOKED' ? r.revokeNote : r.adminNote) ? (
                    <p className="t-meta m-0 mt-1 whitespace-pre-wrap break-words">
                      {t('limits-your-note', {
                        defaultValue: 'Note: {{note}}',
                        note: r.status === 'REVOKED' ? r.revokeNote : r.adminNote,
                      })}
                    </p>
                  ) : null}
                  <p className="t-meta m-0 mt-1">
                    {(r.status === 'REVOKED' ? r.revokedAt : r.decidedAt)
                      ? fmt.relative(new Date((r.status === 'REVOKED' ? r.revokedAt : r.decidedAt) as string))
                      : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
