'use client';

/**
 * Create and edit a session.
 *
 * The form works in **the viewer's local timezone** — `datetime-local` has no
 * zone of its own, so the value in the field is read as local wall-clock and
 * converted to an instant on submit. That is the right default (you type the
 * time you will actually sit down) but it is not obvious, so the field says
 * which zone it means and echoes the Central equivalent live underneath. Typing
 * 8pm and having it silently land at 8pm *Eastern* would be the exact class of
 * bug this page exists to prevent.
 *
 * Validation is client-side for the immediate message and server-side for the
 * truth (`createSessionSchema` / the PATCH range check); this only decides when
 * the submit button is usable.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REFERENCE_TIME_ZONE, zonedTimeToUtc } from '@/lib/pf2ecal/zoned-time';
import {
  LOCATION_MAX,
  MAX_SESSION_HOURS,
  NOTES_MAX,
  TITLE_MAX,
  type Session,
} from '@/lib/pf2ecal/types';
import { describeSessionTime, toDateTimeLocalValue } from './format';

export interface SessionFormValue {
  title: string;
  notes: string;
  location: string;
  startsAt: string;
  endsAt: string;
}

/**
 * Read a `datetime-local` value as wall-clock time in `timeZone`.
 *
 * `new Date('2026-08-12T20:00')` parses as the *runtime's* local zone, which is
 * the browser's — correct by accident when `timeZone` is the browser's zone and
 * wrong the moment anything else is passed. Going through `zonedTimeToUtc`
 * makes the zone explicit and keeps this honest if the form ever offers a zone
 * picker.
 */
function localInputToInstant(value: string, timeZone: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  return zonedTimeToUtc(
    {
      year: Number(year),
      month: Number(month),
      day: Number(day),
      hour: Number(hour),
      minute: Number(minute),
    },
    timeZone,
  );
}

/** A blank form seeded to 8pm local on `dateKey` (or the next day if none). */
export function emptyForm(dateKey: string | null, timeZone: string): SessionFormValue {
  const base =
    dateKey ?? toDateTimeLocalValue(new Date(Date.now() + 86_400_000), timeZone).slice(0, 10);
  return {
    title: 'Pathfinder 2e session',
    notes: '',
    location: '',
    startsAt: `${base}T20:00`,
    endsAt: `${base}T23:00`,
  };
}

export function formFromSession(session: Session, timeZone: string): SessionFormValue {
  return {
    title: session.title,
    notes: session.notes,
    location: session.location,
    startsAt: toDateTimeLocalValue(session.startsAt, timeZone),
    endsAt: toDateTimeLocalValue(session.endsAt, timeZone),
  };
}

interface SessionFormProps {
  value: SessionFormValue;
  onChange: (next: SessionFormValue) => void;
  timeZone: string;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (payload: {
    title: string;
    notes: string;
    location: string;
    startsAt: string;
    endsAt: string;
  }) => void;
  onCancel: () => void;
}

export function SessionForm({
  value,
  onChange,
  timeZone,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: SessionFormProps) {
  const { t } = useTranslation('r-pf2ecal');
  const [touched, setTouched] = useState(false);

  const parsed = useMemo(() => {
    const start = localInputToInstant(value.startsAt, timeZone);
    const end = localInputToInstant(value.endsAt, timeZone);
    return { start, end };
  }, [value.startsAt, value.endsAt, timeZone]);

  const error = useMemo(() => {
    if (!value.title.trim()) return t('err-no-title', { defaultValue: 'Give the session a name.' });
    if (!parsed.start) return t('err-no-start', { defaultValue: 'Pick a start time.' });
    if (!parsed.end) return t('err-no-end', { defaultValue: 'Pick an end time.' });
    if (parsed.end.getTime() <= parsed.start.getTime()) {
      return t('err-end-before-start', {
        defaultValue: 'The end time must come after the start time.',
      });
    }
    if (parsed.end.getTime() - parsed.start.getTime() > MAX_SESSION_HOURS * 3_600_000) {
      return t('err-too-long', {
        defaultValue: 'A session cannot run longer than {{hours}} hours.',
        hours: MAX_SESSION_HOURS,
      });
    }
    return null;
    // `t` is in the deps because the message must follow a language change; it
    // is stable per language, so this does not re-run on every render.
  }, [value.title, parsed, t]);

  const preview =
    parsed.start && parsed.end && !error
      ? describeSessionTime(parsed.start, parsed.end, timeZone)
      : null;

  // Moving the start drags the end with it, keeping the duration: the common
  // edit is "same session, an hour later", and making the user fix both ends is
  // how a one-minute session ends up in everyone's calendar.
  const set = <K extends keyof SessionFormValue>(key: K, next: SessionFormValue[K]) => {
    if (key === 'startsAt' && parsed.start && parsed.end) {
      const duration = parsed.end.getTime() - parsed.start.getTime();
      const nextStart = localInputToInstant(String(next), timeZone);
      if (nextStart && duration > 0) {
        onChange({
          ...value,
          startsAt: String(next),
          endsAt: toDateTimeLocalValue(new Date(nextStart.getTime() + duration), timeZone),
        });
        return;
      }
    }
    onChange({ ...value, [key]: next });
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTouched(true);
        if (error || !parsed.start || !parsed.end) return;
        onSubmit({
          title: value.title.trim(),
          notes: value.notes,
          location: value.location.trim(),
          startsAt: parsed.start.toISOString(),
          endsAt: parsed.end.toISOString(),
        });
      }}
    >
      <div>
        <label className="pf2e-mono-label mb-1.5 block" htmlFor="pf2e-title">
          {t('field-session', { defaultValue: 'Session' })}
        </label>
        <input
          id="pf2e-title"
          className="pf2e-field"
          value={value.title}
          maxLength={TITLE_MAX}
          onChange={(event) => set('title', event.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={t('default-session-title', { defaultValue: 'Pathfinder 2e session' })}
          required
        />
      </div>

      {/* `min-w-0` on both columns: a `datetime-local` input reports a wide
          intrinsic minimum, and a grid child defaults to `min-width: auto`, so
          at 320px the two columns pushed 12px past the form. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="pf2e-mono-label mb-1.5 block" htmlFor="pf2e-start">
            {t('field-starts', { defaultValue: 'Starts' })}
          </label>
          <input
            id="pf2e-start"
            type="datetime-local"
            className="pf2e-field"
            value={value.startsAt}
            onChange={(event) => set('startsAt', event.target.value)}
            required
          />
        </div>
        <div className="min-w-0">
          <label className="pf2e-mono-label mb-1.5 block" htmlFor="pf2e-end">
            {t('field-ends', { defaultValue: 'Ends' })}
          </label>
          <input
            id="pf2e-end"
            type="datetime-local"
            className="pf2e-field"
            value={value.endsAt}
            onChange={(event) => set('endsAt', event.target.value)}
            required
          />
        </div>
      </div>

      <p className="pf2e-caption" aria-live="polite">
        {t('form-zone-note', {
          defaultValue: 'Times are in your timezone ({{zone}}).',
          zone: timeZone.replace(/_/g, ' '),
        })}
        {preview && (
          <>
            {' '}
            {t('form-preview-lead', { defaultValue: 'That is' })}{' '}
            <strong className="font-medium">{preview.local}</strong>
            {preview.reference && <> {preview.reference}</>}
            {preview.isLocalReference && (
              <>
                {' '}
                {t('form-same-as-reference', {
                  defaultValue: '— the same as {{city}}',
                  city: REFERENCE_TIME_ZONE.split('/')[1],
                })}
              </>
            )}
            .
          </>
        )}
      </p>

      <div>
        <label className="pf2e-mono-label mb-1.5 block" htmlFor="pf2e-location">
          {t('field-where', { defaultValue: 'Where' })}{' '}
          <span className="normal-case">({t('optional', { defaultValue: 'optional' })})</span>
        </label>
        <input
          id="pf2e-location"
          className="pf2e-field"
          value={value.location}
          maxLength={LOCATION_MAX}
          onChange={(event) => set('location', event.target.value)}
          placeholder={t('where-placeholder', {
            defaultValue: "Foundry link, Discord, someone's place…",
          })}
        />
      </div>

      <div>
        <label className="pf2e-mono-label mb-1.5 block" htmlFor="pf2e-notes">
          {t('field-notes', { defaultValue: 'Notes' })}{' '}
          <span className="normal-case">({t('optional', { defaultValue: 'optional' })})</span>
        </label>
        <textarea
          id="pf2e-notes"
          className="pf2e-field"
          rows={4}
          value={value.notes}
          maxLength={NOTES_MAX}
          onChange={(event) => set('notes', event.target.value)}
          placeholder={t('notes-placeholder', {
            defaultValue: "What we're picking up, what to prep, who's bringing what…",
          })}
        />
      </div>

      {touched && error && (
        <p className="pf2e-body" role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          className="pf2e-btn pf2e-btn-ghost"
          onClick={onCancel}
          disabled={submitting}
        >
          {t('cancel', { defaultValue: 'Cancel' })}
        </button>
        <button
          type="submit"
          className="pf2e-btn pf2e-btn-primary"
          disabled={submitting || (touched && Boolean(error))}
        >
          {submitting ? t('saving', { defaultValue: 'Saving…' }) : submitLabel}
        </button>
      </div>
    </form>
  );
}
