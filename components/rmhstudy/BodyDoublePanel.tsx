'use client';

/**
 * F5 — body-doubling match, on the RMH Study landing. Pick a subject, 25 or 50
 * minutes and a time (now, or a half-hour slot); the server pairs you with
 * another member who asked for the same, and you both get a link into a shared
 * study room. Lazy-loaded and mounted after idle by the landing.
 *
 * Styled with the full-screen app tier (`--app-*`), like the rest of RMH Study.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users } from 'lucide-react';
import { toast } from '@/lib/rmhstudy/toast-store';
import { api } from '@/components/calendar/api';
import {
  STUDY_LENGTHS,
  STUDY_PRESETS,
  roomOpenFor,
  studySlotOptions,
  type StudyPreset,
} from '@/lib/calendar/study-buddy';
import type { StudyBuddyStatus } from '@/lib/calendar/types';

const chip =
  'rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--app-accent)';

export default function BodyDoublePanel() {
  const { t, i18n } = useTranslation('f-calendar');
  const [preset, setPreset] = useState<StudyPreset | null>('math');
  const [custom, setCustom] = useState('');
  const [length, setLength] = useState<25 | 50>(25);
  const [when, setWhen] = useState<string>('now');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<StudyBuddyStatus>({ waiting: [], matches: [] });
  const [tick, setTick] = useState(() => Date.now());
  const knownMatches = useRef<Set<string> | null>(null);

  const presetLabels: Record<StudyPreset, string> = {
    math: t('subject-math', { defaultValue: 'Math' }),
    science: t('subject-science', { defaultValue: 'Science' }),
    programming: t('subject-programming', { defaultValue: 'Programming' }),
    languages: t('subject-languages', { defaultValue: 'Languages' }),
    writing: t('subject-writing', { defaultValue: 'Writing' }),
    humanities: t('subject-humanities', { defaultValue: 'Humanities' }),
    'exam-prep': t('subject-exam-prep', { defaultValue: 'Exam prep' }),
    reading: t('subject-reading', { defaultValue: 'Reading' }),
  };

  const slots = useMemo(() => studySlotOptions(new Date()), []);
  const timeFmt = useMemo(
    () =>
      new Intl.DateTimeFormat(i18n.language, {
        weekday: 'short',
        hour: 'numeric',
        minute: '2-digit',
      }),
    [i18n.language],
  );

  const refresh = useCallback(async () => {
    const res = await api<StudyBuddyStatus>('/api/study-buddy');
    if (!res.ok || !res.data) return;
    const next = res.data;
    // Announce a match that arrived while this page was open (the partner asked after us).
    if (knownMatches.current) {
      for (const m of next.matches) {
        if (!knownMatches.current.has(m.id)) {
          toast.success(
            t('matched-toast', {
              defaultValue: 'Study buddy found: {{name}}',
              name: m.partner.name ?? m.partner.handle ?? '',
            }),
          );
        }
      }
    }
    knownMatches.current = new Set(next.matches.map((m) => m.id));
    setStatus(next);
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll only while something is waiting; a minute-clock keeps countdowns and room buttons honest.
  const waiting = status.waiting.length > 0;
  useEffect(() => {
    const id = setInterval(() => {
      setTick(Date.now());
      if (waiting && document.visibilityState === 'visible') void refresh();
    }, 5000);
    return () => clearInterval(id);
  }, [waiting, refresh]);

  const subject = preset ? presetLabels[preset] : custom.trim();
  const canSubmit = subject.length >= 2 && !busy;

  const submit = async () => {
    setBusy(true);
    const res = await api<{ matched: boolean }>('/api/study-buddy', {
      method: 'POST',
      body: {
        subject,
        preset: preset ?? undefined,
        lengthMin: length,
        startsAt: when === 'now' ? null : new Date(Number(when)).toISOString(),
      },
    });
    setBusy(false);
    if (res.ok && res.data) {
      toast.success(
        res.data.matched
          ? t('request-matched', { defaultValue: 'Matched! Your study room link is below.' })
          : when === 'now'
            ? t('request-waiting-now', {
                defaultValue: 'Looking for a partner. Stay on this page.',
              })
            : t('request-waiting-slot', {
                defaultValue: 'Slot booked. We will tell you when someone joins it.',
              }),
      );
      await refresh();
    } else {
      toast.error(
        res.error ?? t('request-error', { defaultValue: 'Could not send your request.' }),
      );
    }
  };

  const cancel = async (requestId: string) => {
    await api(`/api/study-buddy?requestId=${encodeURIComponent(requestId)}`, { method: 'DELETE' });
    await refresh();
  };

  return (
    <section
      aria-labelledby="body-double-title"
      className="rounded-xl border border-(--app-border) bg-(--app-surface) p-6"
    >
      <h2 id="body-double-title" className="mb-1 flex items-center gap-2 text-xl font-semibold">
        <Users className="h-5 w-5 text-(--app-accent)" aria-hidden />
        {t('bd-title', { defaultValue: 'Study with a buddy' })}
      </h2>
      <p className="mb-4 text-sm text-(--app-text-muted)">
        {t('bd-subtitle', {
          defaultValue:
            'Get matched with someone studying the same subject at the same time. You each work on your own thing, together.',
        })}
      </p>

      <div className="space-y-4">
        <div>
          <p className="mb-2 text-xs font-medium text-(--app-text-muted)">
            {t('bd-subject', { defaultValue: 'Subject' })}
          </p>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t('bd-subject', { defaultValue: 'Subject' })}
          >
            {STUDY_PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                aria-pressed={preset === p}
                onClick={() => setPreset(p)}
                className={`${chip} ${
                  preset === p
                    ? 'border-(--app-accent) bg-(--app-accent) text-(--app-accent-fg)'
                    : 'border-(--app-border) hover:border-(--app-accent)'
                }`}
              >
                {presetLabels[p]}
              </button>
            ))}
          </div>
          <label
            className="mt-3 block text-xs font-medium text-(--app-text-muted)"
            htmlFor="bd-custom"
          >
            {t('bd-custom', { defaultValue: 'Or something else' })}
          </label>
          <input
            id="bd-custom"
            value={custom}
            maxLength={60}
            onChange={(e) => {
              setCustom(e.target.value);
              setPreset(e.target.value.trim() ? null : 'math');
            }}
            placeholder={t('bd-custom-ph', { defaultValue: 'Organic chemistry' })}
            className="mt-1 w-full rounded-lg border border-(--app-border) bg-(--app-bg) px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-medium text-(--app-text-muted)">
              {t('bd-length', { defaultValue: 'Length' })}
            </p>
            <div
              className="flex gap-2"
              role="group"
              aria-label={t('bd-length', { defaultValue: 'Length' })}
            >
              {STUDY_LENGTHS.map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={length === n}
                  onClick={() => setLength(n)}
                  className={`${chip} ${
                    length === n
                      ? 'border-(--app-accent) bg-(--app-accent) text-(--app-accent-fg)'
                      : 'border-(--app-border) hover:border-(--app-accent)'
                  }`}
                >
                  {t('bd-minutes', { defaultValue: '{{count}} min', count: n })}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label
              className="mb-2 block text-xs font-medium text-(--app-text-muted)"
              htmlFor="bd-when"
            >
              {t('bd-when', { defaultValue: 'When' })}
            </label>
            <select
              id="bd-when"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
              className="w-full rounded-lg border border-(--app-border) bg-(--app-bg) px-3 py-2 text-sm"
            >
              <option value="now">{t('bd-now', { defaultValue: 'Right now' })}</option>
              {slots.map((s) => (
                <option key={s} value={s}>
                  {timeFmt.format(new Date(s))}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="w-full rounded-lg bg-(--app-accent) py-3 font-semibold text-(--app-accent-fg) transition-colors hover:bg-(--app-accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t('bd-find', { defaultValue: 'Find a study buddy' })}
        </button>
      </div>

      {(status.waiting.length > 0 || status.matches.length > 0) && (
        <div className="mt-6 space-y-3" aria-live="polite">
          {status.matches.map((m) => {
            const open = roomOpenFor(
              { startsAt: new Date(m.startsAt), endsAt: new Date(m.endsAt) },
              new Date(tick),
            );
            return (
              <div
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--app-accent) p-3"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {m.subject} ·{' '}
                    {t('bd-minutes', { defaultValue: '{{count}} min', count: m.lengthMin })}
                  </p>
                  <p className="text-sm text-(--app-text-muted)">
                    {t('bd-with', {
                      defaultValue: 'With {{name}}',
                      name: m.partner.name ?? m.partner.handle ?? '',
                    })}
                    {' · '}
                    {timeFmt.format(new Date(m.startsAt))}
                  </p>
                </div>
                {open ? (
                  <a
                    href={`/rmhstudy/${m.roomCode}?bd=${m.id}`}
                    className="rounded-lg bg-(--app-accent) px-4 py-2 text-sm font-semibold text-(--app-accent-fg) hover:bg-(--app-accent-hover)"
                  >
                    {t('bd-open-room', { defaultValue: 'Open the room' })}
                  </a>
                ) : (
                  <span className="text-sm text-(--app-text-muted)">
                    {t('bd-opens-soon', { defaultValue: 'Opens 5 minutes before' })}
                  </span>
                )}
              </div>
            );
          })}
          {status.waiting.map((w) => (
            <div
              key={w.requestId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-(--app-border) p-3"
            >
              <p className="text-sm">
                {w.mode === 'now'
                  ? t('bd-waiting-now', {
                      defaultValue: 'Looking for a {{subject}} partner ({{count}} min)…',
                      subject: w.subject,
                      count: w.lengthMin,
                    })
                  : t('bd-waiting-slot', {
                      defaultValue:
                        '{{subject}}, {{count}} min, {{time}}: waiting for someone to join the slot',
                      subject: w.subject,
                      count: w.lengthMin,
                      time: timeFmt.format(new Date(w.startsAt)),
                    })}
              </p>
              <button
                type="button"
                onClick={() => void cancel(w.requestId)}
                className="rounded-lg border border-(--app-border) px-3 py-1.5 text-sm hover:border-(--app-accent)"
              >
                {t('bd-cancel', { defaultValue: 'Cancel' })}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
