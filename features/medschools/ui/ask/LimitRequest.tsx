import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { MedButton } from '../controls/MedButton';
import { MedTextarea } from '../controls/MedField';
import { api } from '@/lib/contract/client';
import { useLocaleFormat } from '@/hooks/useLocaleFormat';
import { toast } from '@/lib/toast';
import { QA_LIMIT_NOTE_MAX } from '../../ai-budget';
import { submitMedQaLimitRequestApi, type MedQaTier } from '../../medschools.contract';
import { ME_KEY, qaLimitRequestQuery } from '../../medschools.queries';

/**
 * "Need more questions? Request a higher limit" (plan R19): an optional reason, then Submit. Four states: the form, a
 * request waiting for an admin, the higher limit in force, and a decline with the day the member can ask again. An
 * admin and a paying member never see it (the server says `not-needed`; their tier says so first so nothing flashes).
 * It sits under the Ask form and is not an ink button: the Ask button stays the one primary (R4).
 */
export function LimitRequest({ tier }: { tier: MedQaTier | null }) {
  const { t } = useTranslation('medschools');
  const fmt = useLocaleFormat();
  const refusal = useRefusalText();
  const qc = useQueryClient();
  const id = useId();
  const [note, setNote] = useState('');
  const hidden = tier === null || tier === 'admin' || tier === 'member';
  const state = useQuery({ ...qaLimitRequestQuery(), enabled: !hidden });
  const submit = useMutation({
    mutationFn: () => api(submitMedQaLimitRequestApi, { body: note.trim() ? { note: note.trim() } : {} }),
    onSuccess: (res) => {
      qc.setQueryData(qaLimitRequestQuery().queryKey, res);
      setNote('');
      toast.success(t('ask-limit-sent', { defaultValue: 'Request sent' }));
    },
    onError: (e) => {
      toast.error(refusal(e));
      void qc.invalidateQueries({ queryKey: [...ME_KEY, 'qa-limit-request'] });
    },
  });
  const s = state.data;
  if (hidden || !s || s.state === 'not-needed') return null;

  const reply = s.adminNote ? (
    <p className="medapp-meta">{t('ask-limit-reply', { defaultValue: 'Reply: {{note}}', note: s.adminNote })}</p>
  ) : null;

  return (
    <div className="medapp-subrule flex flex-col gap-2" data-testid="ask-limit-request">
      {s.state === 'pending' ? (
        <>
          <p className="medapp-text" role="status">
            {t('ask-limit-pending', { defaultValue: 'Your request for a higher limit is waiting for review.' })}
          </p>
        </>
      ) : s.state === 'approved' ? (
        <>
          <p className="medapp-text" role="status">
            {t('ask-limit-approved', { defaultValue: 'Your higher limit is on.' })}
          </p>
          {reply}
        </>
      ) : s.state === 'declined' ? (
        <>
          <p className="medapp-text" role="status">
            {t('ask-limit-declined', {
              defaultValue: 'Your request for a higher limit was not approved. You can ask again on {{date}}.',
              date: s.reapplyOn ? fmt.date(s.reapplyOn, { timeZone: 'UTC' }) : '',
            })}
          </p>
          {reply}
        </>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!submit.isPending) submit.mutate();
          }}
        >
          <label htmlFor={id} className="medapp-label">
            {t('ask-limit-heading', { defaultValue: 'Need more questions? Request a higher limit' })}
          </label>
          <MedTextarea
            id={id}
            value={note}
            maxLength={QA_LIMIT_NOTE_MAX}
            rows={2}
            placeholder={t('ask-limit-note', { defaultValue: 'Why do you need more? (optional)' })}
            aria-label={t('ask-limit-note-label', { defaultValue: 'Reason for a higher limit (optional)' })}
            disabled={submit.isPending}
            onChange={(e) => setNote(e.target.value)}
          />
          <div>
            <MedButton type="submit" variant="secondary" loading={submit.isPending}>
              {t('ask-limit-submit', { defaultValue: 'Submit' })}
            </MedButton>
          </div>
        </form>
      )}
    </div>
  );
}
