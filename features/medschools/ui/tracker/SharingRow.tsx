import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/lib/toast';
import { errorField } from '@/lib/http';
import { useRefusalText } from '@/components/errors/useRefusalText';
import { SHARE_MIN_ACCOUNT_AGE_DAYS } from '../../engine/tracker';

/**
 * The anonymous sharing switch (plan D8). The switch shows what the SERVER says (`checked` is the stored flag): a
 * toggle waits for the response, then the page refetches, so it never claims sharing is on or off before it is. A
 * refusal reverts nothing because nothing moved: the account is too new (409), sharing is unavailable (503), anything
 * else toasts. The copy says exactly what is shared and what is not.
 */
export function SharingRow({
  checked,
  sharingAvailable,
  accountTooNew,
  onToggle,
}: {
  checked: boolean;
  sharingAvailable: boolean;
  /** The session says the account is under the minimum age (the server checks too and answers 409). */
  accountTooNew: boolean;
  /** Resolves once the server has applied the change and the tracker has been refetched; rejects with the refusal. */
  onToggle: (next: boolean) => Promise<void>;
}) {
  const { t } = useTranslation('medschools');
  const refusal = useRefusalText();
  const labelId = useId();
  const noteId = useId();
  const waitId = useId();
  const [busy, setBusy] = useState(false);
  const [refusedTooNew, setRefusedTooNew] = useState(false);
  const [refusedUnavailable, setRefusedUnavailable] = useState(false);

  const unavailable = !sharingAvailable || refusedUnavailable;
  // Turning sharing OFF is never blocked: a member can always take their events back.
  const tooNew = !checked && (accountTooNew || refusedTooNew);

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      await onToggle(next);
    } catch (e) {
      const code = errorField<string>(e, 'code');
      if (code === 'MEDSCHOOLS_ACCOUNT_TOO_NEW') setRefusedTooNew(true);
      else if (code === 'MEDSCHOOLS_SHARING_UNAVAILABLE') setRefusedUnavailable(true);
      else toast.error(refusal(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 border-b border-site-border py-4">
      <div className="min-w-0 flex-1">
        <p id={labelId} className="t-body m-0 font-medium">
          {t('share-label', { defaultValue: 'Share my milestones anonymously' })}
        </p>
        <p id={noteId} className="t-meta m-0 mt-1">
          {t('share-explanation', {
            defaultValue:
              'When this is on, each milestone you add (secondary, interview invite, waitlist, rejection, acceptance, withdrawn, hold) is shared as one anonymous event: the school, the program, the type and the day. The public pages never link it to you. Your submission and completion dates and your home state are never shared, and a public figure appears only when at least 3 people reported the same thing on the same day. Public figures update once a day. Turn it off, or delete the milestone, and the event is removed at once; the public totals follow at the next daily update.',
          })}
        </p>
        <p id={waitId} className="t-meta m-0 mt-2">
          {t('share-wait-note', {
            defaultValue:
              'When sharing is on, the time between your complete date and an invite also feeds an estimate shown for this school once at least 20 members contribute. Only the estimate is shown, never a date or a row.',
          })}
        </p>
        {unavailable ? (
          <p className="t-meta m-0 mt-2" role="status">
            {t('share-unavailable', { defaultValue: 'Sharing is unavailable right now.' })}
          </p>
        ) : null}
        {tooNew && !unavailable ? (
          <p className="t-meta m-0 mt-2" role="status">
            {t('share-too-new', {
              defaultValue: 'Sharing needs an account at least {{days}} days old. You can turn it on once yours is.',
              days: SHARE_MIN_ACCOUNT_AGE_DAYS,
            })}
          </p>
        ) : null}
      </div>
      <Switch
        checked={checked}
        disabled={busy || unavailable || tooNew}
        onCheckedChange={(next) => void toggle(next)}
        aria-labelledby={labelId}
        aria-describedby={`${noteId} ${waitId}`}
      />
    </div>
  );
}
