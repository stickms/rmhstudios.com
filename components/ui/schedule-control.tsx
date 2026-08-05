'use client';

import * as React from 'react';
import { CalendarClock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { cn } from '@/lib/utils';

/**
 * ScheduleControl (B17) — one "publish this later" control for every composer.
 *
 * The feed composer grew its own inline `datetime-local` + Schedule button;
 * community posts and drafts had none, despite `ScheduledPost` being able to
 * carry all of them. This is that control, extracted, with the two things the
 * inline version was missing:
 *
 *  - **the zone is named.** `datetime-local` is wall-clock with no offset, so
 *    "8:00 PM" is only unambiguous if the UI says whose 8 PM. It is converted to
 *    a UTC instant on submit, which is what the API takes.
 *  - **a past time is refused inline**, before the round-trip. The API already
 *    rejects it with "Scheduled time must be in the future"; making the user
 *    discover that by pressing the button is a worse version of the same rule.
 */

export interface ScheduleControlProps {
  /** `datetime-local` value (`YYYY-MM-DDTHH:mm`). Controlled by the caller. */
  value: string;
  onChange: (value: string) => void;
  /** Receives the chosen time as a UTC ISO instant. */
  onSubmit: (isoInstant: string) => void;
  /** Rendered as a dismiss control when provided. */
  onCancel?: () => void;
  /** Disable the submit button for reasons the control cannot see (empty post…). */
  disabled?: boolean;
  submitting?: boolean;
  /** Defaults to "Schedule". Pass e.g. "Reschedule" on an existing row. */
  submitLabel?: string;
  /** Distinguishes multiple controls on one page for label association. */
  id?: string;
  className?: string;
}

/** The viewer's IANA zone, or `null` where `Intl` cannot say. */
function viewerTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

/** `datetime-local`'s `min`: now, in the viewer's own wall clock. */
function nowLocalValue(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 16);
}

export function ScheduleControl({
  value,
  onChange,
  onSubmit,
  onCancel,
  disabled = false,
  submitting = false,
  submitLabel,
  id = 'schedule-at',
  className,
}: ScheduleControlProps) {
  const { t } = useTranslation('c-ui');
  const [zone, setZone] = React.useState<string | null>(null);
  const [min, setMin] = React.useState<string>('');

  // Resolved after mount: the server's zone is not the viewer's, and rendering
  // one and hydrating the other is a text mismatch React throws the tree away
  // for. Same reason `RelativeTime` defers its clock.
  React.useEffect(() => {
    setZone(viewerTimeZone());
    setMin(nowLocalValue());
  }, []);

  const parsed = value ? new Date(value) : null;
  const valid = parsed !== null && !Number.isNaN(parsed.getTime());
  const inPast = valid && parsed.getTime() <= Date.now();

  return (
    <div
      data-slot="schedule-control"
      className={cn('glass-inset flex flex-wrap items-center gap-2 px-3 py-2', className)}
    >
      <CalendarClock className="size-4 shrink-0 text-site-text-dim" aria-hidden />
      <label htmlFor={id} className="text-xs text-site-text-dim">
        {t('schedule-publish-at', { defaultValue: 'Publish at' })}
      </label>
      <input
        id={id}
        type="datetime-local"
        value={value}
        min={min || undefined}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-site-sm border border-site-border bg-site-surface px-2 py-1 text-xs text-site-text outline-none transition-colors focus:border-site-accent"
      />
      {zone && (
        <span className="text-xs text-site-text-dim" title={zone}>
          {t('schedule-timezone', { zone, defaultValue: 'Times in {{zone}}' })}
        </span>
      )}

      <Button
        size="sm"
        variant="accent"
        disabled={disabled || !valid || inPast}
        loading={submitting}
        onClick={() => {
          if (!valid || inPast) return;
          onSubmit(parsed.toISOString());
        }}
      >
        {submitLabel ?? t('schedule-button', { defaultValue: 'Schedule' })}
      </Button>

      {onCancel && (
        <IconButton
          icon={X}
          size="icon-xs"
          variant="ghost"
          onClick={onCancel}
          label={t('cancel-scheduling', { defaultValue: 'Cancel scheduling' })}
        />
      )}

      {inPast && (
        <p role="status" className="basis-full text-xs text-site-danger">
          {t('schedule-past-error', { defaultValue: 'Pick a time in the future.' })}
        </p>
      )}
    </div>
  );
}
