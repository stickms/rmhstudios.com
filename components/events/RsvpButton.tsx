import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import type { RsvpStatus, RsvpResult } from '@/lib/events.server';
import { api } from '@/lib/contract/client';
import { HttpError, serverError } from '@/lib/http';
import { rsvpEventApi, withdrawRsvpApi } from '@/lib/events.contract';

interface RsvpButtonProps {
  eventId: string;
  status: RsvpStatus | null;
  goingCount: number;
  capacity: number | null;
  /** Disable interaction (e.g. canceled or past events). */
  disabled?: boolean;
  onChange?: (result: RsvpResult) => void;
}

/**
 * Going / Maybe RSVP control. Clicking an inactive option sets it; clicking the
 * active one withdraws the RSVP. Reflects server-returned counts via `onChange`.
 */
export function RsvpButton({
  eventId,
  status,
  goingCount,
  capacity,
  disabled,
  onChange,
}: RsvpButtonProps) {
  const { t } = useTranslation('site');
  const [busy, setBusy] = useState(false);

  // The event is full only for someone who isn't already going.
  const full = capacity != null && goingCount >= capacity && status !== 'going';

  const submit = async (next: RsvpStatus) => {
    if (busy) return;
    setBusy(true);
    try {
      const withdrawing = status === next;
      const result = withdrawing
        ? await api(withdrawRsvpApi, { params: { id: eventId }, query: {} })
        : await api(rsvpEventApi, { params: { id: eventId }, body: { status: next } });
      onChange?.(result);
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        toast.error(t('sign-in-to-rsvp', { defaultValue: 'Sign in to RSVP.' }));
      } else if (e instanceof HttpError && e.status === 409) {
        toast.error(serverError(e) || t('event-full', { defaultValue: 'This event is full.' }));
      } else {
        toast.error(serverError(e) || t('rsvp-error', { defaultValue: 'Could not update RSVP.' }));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    // The chosen answer is the filled button (clicking it again withdraws).
    <div
      role="group"
      aria-label={t('rsvp-label', { defaultValue: 'RSVP' })}
      className="flex items-center gap-2"
    >
      <Button
        size="sm"
        variant={status === 'going' ? 'default' : 'ghost'}
        aria-pressed={status === 'going'}
        onClick={() => submit('going')}
        disabled={disabled || busy || full}
      >
        <Check aria-hidden />
        {status === 'going'
          ? t('rsvp-going', { defaultValue: 'Going' })
          : full
            ? t('rsvp-full', { defaultValue: 'Full' })
            : t('rsvp-go', { defaultValue: 'Going' })}
      </Button>
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
  );
}
