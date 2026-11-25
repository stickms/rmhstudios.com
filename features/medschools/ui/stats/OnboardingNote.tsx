import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { api } from '@/lib/contract/client';
import { toast } from '@/lib/toast';
import { putMedStatsOnboardingApi } from '../../medschools.contract';
import { statsQuery } from '../../medschools.queries';
import { MedButton, medButtonClass } from '../controls/MedButton';

/**
 * The gentle onboarding step (phase D): on the lists page and the builder, while the member has neither saved stats
 * nor pressed "Skip for now". It never blocks anything: "New list" and the builder work beside it, and "Skip for now"
 * is remembered on the account. Nothing renders while the status is loading, failed or done.
 */
export function OnboardingNote({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation('medschools');
  const qc = useQueryClient();
  const refusal = useRefusalText();
  const stats = useQuery({ ...statsQuery(), enabled: signedIn });
  const [busy, setBusy] = useState(false);
  if (!signedIn || stats.data?.onboarding !== 'pending') return null;
  const skip = async () => {
    setBusy(true);
    try {
      qc.setQueryData(statsQuery().queryKey, await api(putMedStatsOnboardingApi, { body: { state: 'skipped' } }));
    } catch (e) {
      toast.error(refusal(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <aside className="medapp-panel medapp-panel--padded medapp-onboard" aria-labelledby="medschools-onboard-heading">
      <h2 id="medschools-onboard-heading" className="medapp-h3">
        {t('stats-onboard-heading', { defaultValue: 'Your stats, if you like' })}
      </h2>
      <p className="medapp-text">
        {t('stats-intro', { defaultValue: 'Add what you’re comfortable sharing. It’s private to you.' })}
      </p>
      <p className="medapp-meta">
        {t('stats-onboard-why', {
          defaultValue: 'With them, the list builder can compare your MCAT and GPA with each school’s published class figures.',
        })}
      </p>
      <div className="medapp-actions">
        <Link to="/med/stats" search={{ welcome: '1' }} className={medButtonClass('secondary')}>
          {t('stats-onboard-add', { defaultValue: 'Add my stats' })}
        </Link>
        <MedButton variant="tertiary" loading={busy} onClick={() => void skip()}>
          {t('stats-skip', { defaultValue: 'Skip for now' })}
        </MedButton>
      </div>
    </aside>
  );
}
