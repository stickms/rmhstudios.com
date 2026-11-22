import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, HelpCircle, Hourglass } from 'lucide-react';
import { toast } from '@/lib/toast';
import { Button } from '@/components/ui/button';
import type { RsvpRequest, RsvpResult } from '@/lib/events.server';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { rsvpEventApi, withdrawRsvpApi } from '@/lib/events.contract';
import { useSanctionRefusal } from '@/components/communities/useSanctionRefusal';

interface RsvpButtonProps {
  eventId: string;
  status: RsvpRequest | null;
  goingCount: number;
  capacity: number | null;
  /** The viewer's 1-based place in the waitlist, when they are on it. */
  waitlistPosition?: number | null;
  /** Disable interaction (e.g. canceled or past events). */
  disabled?: boolean;
  onChange?: (result: RsvpResult) => void;
}

/**
 * Going / Maybe RSVP control. Clicking an inactive option sets it; clicking the
 * active one withdraws the RSVP. On a full event "Going" becomes "Join waitlist"
 * (and "Leave waitlist" once on it), with the viewer's place as text in a polite
 * live region. Reflects server-returned counts via `onChange`.
 */
export function RsvpButton({
  eventId,
  status,
  goingCount,
  capacity,
  waitlistPosition = null,
  disabled,
  onChange,
}: RsvpButtonProps) {
  const { t } = useTranslation('site');
  const { t: tr } = useTranslation('event-waitlist');
  // A community event refuses a banned or timed-out member with the community's own refusal (s06-01).
  const sanctionRefusalText = useSanctionRefusal();
  const [busy, setBusy] = useState(false);
  const [leftWaitlist, setLeftWaitlist] = useState(false);

  // The event is full only for someone who isn't already going.
  const full = capacity != null && goingCount >= capacity && status !== 'going';
  const waitlisted = status === 'waitlist';

  const submit = async (next: RsvpRequest) => {
    if (busy) return;
    setBusy(true);
    try {
      const withdrawing = status === next;
      const result = withdrawing
        ? await api(withdrawRsvpApi, { params: { id: eventId }, query: {} })
        : await api(rsvpEventApi, { params: { id: eventId }, body: { status: next } });
      setLeftWaitlist(withdrawing && next === 'waitlist');
      onChange?.(result);
    } catch (e) {
      const refusal = sanctionRefusalText(e);
      if (e instanceof HttpError && e.status === 401) {
        toast.error(t('sign-in-to-rsvp', { defaultValue: 'Sign in to RSVP.' }));
      } else if (refusal) {
        toast.error(refusal);
      } else if (e instanceof HttpError && e.status === 409) {
        toast.error(serverError(e) || t('event-full', { defaultValue: 'This event is full.' }));
      } else {
        toast.error(serverError(e) || t('rsvp-error', { defaultValue: 'Could not update RSVP.' }));
      }
    } finally {
      setBusy(false);
    }
  };

  // The place is text, not only a badge, and a change of it is announced.
  const announcement = waitlisted
    ? waitlistPosition != null
      ? tr('position', {
          count: waitlistPosition,
          defaultValue: 'You are number {{count}} on the waitlist',
        })
      : ''
    : leftWaitlist
      ? tr('left', { defaultValue: 'You left the waitlist' })
      : '';

  return (
    // The chosen answer is the filled button (clicking it again withdraws).
    <div className="flex flex-col items-end gap-1">
      <div role="group" aria-label={t('rsvp-label', { defaultValue: 'RSVP' })} className="flex items-center gap-2">
        {full || waitlisted ? (
          <Button
            size="sm"
            variant={waitlisted ? 'default' : 'ghost'}
            aria-pressed={waitlisted}
            onClick={() => submit('waitlist')}
            disabled={disabled || busy}
          >
            <Hourglass aria-hidden />
            {waitlisted
              ? tr('leave', { defaultValue: 'Leave waitlist' })
              : tr('join', { defaultValue: 'Join waitlist' })}
          </Button>
        ) : (
          <Button
            size="sm"
            variant={status === 'going' ? 'default' : 'ghost'}
            aria-pressed={status === 'going'}
            onClick={() => submit('going')}
            disabled={disabled || busy}
          >
            <Check aria-hidden />
            {status === 'going'
              ? t('rsvp-going', { defaultValue: 'Going' })
              : t('rsvp-go', { defaultValue: 'Going' })}
          </Button>
        )}
        <Button
          size="sm"
          variant={status === 'maybe' ? 'default' : 'ghost'}
          aria-pressed={status === 'maybe'}
          onClick={() => submit('maybe')}
          disabled={disabled || busy}
        >
          <HelpCircle aria-hidden />
          {t('rsvp-maybe', { defaultValue: 'Maybe' })}
        </Button>
      </div>
      <span role="status" aria-live="polite" className="t-meta empty:hidden">
        {announcement}
      </span>
    </div>
  );
}
