'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { RsvpStatus, RsvpResult } from '@/lib/events.server';

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
      const res = withdrawing
        ? await fetch(`/api/events/${eventId}/rsvp`, { method: 'DELETE', credentials: 'include' })
        : await fetch(`/api/events/${eventId}/rsvp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ status: next }),
          });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onChange?.(data as RsvpResult);
      } else if (res.status === 401) {
        toast.error(t('sign-in-to-rsvp', { defaultValue: 'Sign in to RSVP.' }));
      } else if (res.status === 409) {
        toast.error(data.error || t('event-full', { defaultValue: 'This event is full.' }));
      } else {
        toast.error(data.error || t('rsvp-error', { defaultValue: 'Could not update RSVP.' }));
      }
    } catch {
      toast.error(t('rsvp-error', { defaultValue: 'Could not update RSVP.' }));
    } finally {
      setBusy(false);
    }
  };

  const base =
    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-site-accent/50';

  return (
    <div
      className="flex items-center gap-2"
      role="group"
      aria-label={t('rsvp-label', { defaultValue: 'RSVP' })}
    >
      <button
        type="button"
        onClick={() => submit('going')}
        disabled={disabled || busy || full}
        aria-pressed={status === 'going'}
        className={cn(
          base,
          status === 'going'
            ? 'border-site-accent bg-site-accent text-site-accent-fg'
            : 'border-site-border bg-site-surface text-site-text hover:bg-site-surface-hover',
        )}
      >
        <Check className="h-4 w-4" aria-hidden />
        {status === 'going'
          ? t('rsvp-going', { defaultValue: 'Going' })
          : full
            ? t('rsvp-full', { defaultValue: 'Full' })
            : t('rsvp-go', { defaultValue: 'Going' })}
      </button>
      <button
        type="button"
        onClick={() => submit('maybe')}
        disabled={disabled || busy}
        aria-pressed={status === 'maybe'}
        className={cn(
          base,
          status === 'maybe'
            ? 'border-site-accent bg-site-accent-dim text-site-accent'
            : 'border-site-border bg-site-surface text-site-text hover:bg-site-surface-hover',
        )}
      >
        <HelpCircle className="h-4 w-4" aria-hidden />
        {t('rsvp-maybe', { defaultValue: 'Maybe' })}
      </button>
    </div>
  );
}
