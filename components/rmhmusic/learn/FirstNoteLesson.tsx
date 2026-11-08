'use client';

/**
 * FirstNoteLesson — lesson `play-first-note`: "Play any note". The first note
 * from any started input completes it with three stars. On-screen and
 * computer keys show the piano; MIDI and the microphone show the note they
 * hear. A failed save says so and offers Retry, so the learner is never stuck.
 *
 * On entry the chosen input is started: the keys need no permission; the mic
 * and MIDI start by themselves only when the browser already granted them (and,
 * for the mic, sound is already running, which iOS ties to a tap); otherwise the
 * input chooser shows inline, and its click starts them.
 */

import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { releaseMic, startMic } from '@/lib/rmhmusic/learn/input/mic-lifecycle';
import { createOnceGuard } from '@/lib/rmhmusic/learn/once';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { getAudioContext } from '@/lib/shared/platform';
import { PRIMARY_BUTTON } from './buttons';
import { InputChooser } from './InputChooser';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { permissionGranted, useLastNote, useNoteEvents, useNoteSound } from './useLearnInput';

const LESSON_ID = 'play-first-note';

type Save = 'idle' | 'saving' | 'saved' | 'failed' | 'signed-out';

/** `paused` (a dialog is open over the lesson) stops notes counting. */
export function FirstNoteLesson({ paused = false }: { paused?: boolean }) {
  const { t } = useTranslation('c-rmhmusic');
  const hub = useLearnStore((s) => s.hub);
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  const [played, setPlayed] = useState<number | null>(null);
  const [save, setSave] = useState<Save>('idle');
  // Bumped when the inline chooser settles, so `active()` is read again.
  const [, setChosen] = useState(0);
  const last = useLastNote();
  useNoteSound(!paused);

  const needsDevice = input === 'mic' || input === 'midi';
  const inputOn = !needsDevice || (hub?.active().includes(input) ?? false);

  // Start the chosen input (switching inputs mid-lesson goes through `chooseInput`, which stops the old one).
  useEffect(() => {
    if (!hub) return;
    let cancelled = false;
    if (input === 'keys') void hub.start('keys').catch(() => {});
    if (input === 'mic' || input === 'midi') {
      void (async () => {
        if (hub.active().includes(input) || !(await permissionGranted(input))) return;
        if (input === 'mic' && getAudioContext()?.state !== 'running') return;
        if (cancelled) return;
        await (input === 'mic' ? startMic(hub) : hub.start(input)).catch(() => {});
        if (!cancelled) setChosen((n) => n + 1);
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [hub, input]);

  // Leaving the lesson (keys and mic stop) is LessonScreen's `useInputRelease`.

  /** The first note claims completion synchronously; state is too late for a chord in one tick. */
  const once = useRef(createOnceGuard());

  const complete = async () => {
    setSave('saving');
    const outcome = await useLearnStore.getState().completeLesson(LESSON_ID, 3, 100);
    setSave(outcome === 'saved' ? 'saved' : outcome === 'unauthorized' ? 'signed-out' : 'failed');
  };

  useNoteEvents((e) => {
    if (paused || e.type !== 'on' || !once.current.claim()) return;
    // The first event wins: its note is the one shown.
    setPlayed(e.midi);
    // The lesson is done listening; the success screen needs no microphone.
    if (hub) releaseMic(hub);
    void complete();
  });

  /** Retry only after a failed save: re-arm the guard on purpose and complete again. */
  const retry = () => {
    if (save !== 'failed') return;
    once.current.reset();
    if (once.current.claim()) void complete();
  };

  if (played !== null) {
    const name = midiToName(played);
    return (
      <section className="app-glass space-y-4 rounded-(--app-radius) p-5 text-center sm:p-6">
        {save === 'saved' || save === 'saving' ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-(--app-success)" aria-hidden="true" />
            <h2 className="text-2xl font-bold text-(--app-text)">
              {t('lesson-complete', { defaultValue: 'Lesson complete' })}
            </h2>
            <p className="text-(--app-text-muted)">
              {t('first-note-played', { note: name, defaultValue: 'You played {{note}}.' })}
            </p>
            <p
              className="flex justify-center gap-1"
              aria-label={t('lesson-stars', {
                count: 3,
                defaultValue_one: '{{count}} star',
                defaultValue: '{{count}} stars',
              })}
              role="img"
            >
              {[0, 1, 2].map((i) => (
                <Star
                  key={i}
                  className="h-6 w-6 fill-current text-(--app-accent)"
                  aria-hidden="true"
                />
              ))}
            </p>
            <p role="status" className="min-h-5 text-sm text-(--app-text-dim)">
              {save === 'saving' ? t('lesson-saving', { defaultValue: 'Saving…' }) : null}
            </p>
          </>
        ) : (
          <div role="alert" className="space-y-3">
            <p className="font-medium text-(--app-text)">
              {t('first-note-played', { note: name, defaultValue: 'You played {{note}}.' })}
            </p>
            <p className="text-(--app-danger)">
              {save === 'signed-out'
                ? t('error-signed-out', {
                    defaultValue: 'Your session ended. Sign in again to continue.',
                  })
                : t('lesson-save-failed', {
                    defaultValue:
                      "Couldn't save your progress. Check your connection and try again.",
                  })}
            </p>
            {save === 'signed-out' ? (
              <Link
                to="/login"
                search={{ callbackURL: `/rmhmusic/lesson/${LESSON_ID}` }}
                className={PRIMARY_BUTTON}
              >
                {t('sign-in', { defaultValue: 'Sign in' })}
              </Link>
            ) : (
              <button type="button" onClick={retry} className={PRIMARY_BUTTON}>
                {t('retry', { defaultValue: 'Try again' })}
              </button>
            )}
          </div>
        )}
        <Link
          to="/rmhmusic"
          className="block min-h-11 py-2 text-sm font-medium text-(--app-accent)"
        >
          {t('lesson-back-to-path', { defaultValue: 'Back to your lessons' })}
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="app-glass space-y-2 rounded-(--app-radius) p-5 text-center sm:p-6">
        <h2 className="text-xl font-semibold text-(--app-text)">
          {t('first-note-instruction', { defaultValue: 'Play any note' })}
        </h2>
        <p className="text-sm text-(--app-text-muted)">
          {input === 'keys'
            ? t('first-note-hint-keys', {
                defaultValue: 'Press A, S, D, F, G, H, J or K on your computer keyboard. A is C4.',
              })
            : input === 'midi'
              ? t('first-note-hint-midi', {
                  defaultValue: 'Press any key on your MIDI controller.',
                })
              : input === 'mic'
                ? t('first-note-hint-mic', {
                    defaultValue:
                      'Play one note on your instrument, or sing one, near the microphone.',
                  })
                : t('first-note-hint-screen', { defaultValue: 'Tap any key on the piano below.' })}
        </p>
        <p
          className="min-h-16 text-5xl font-bold text-(--app-accent)"
          style={{ fontFamily: 'var(--app-font-mono)' }}
          aria-live="polite"
        >
          {last ? midiToName(last.midi) : null}
        </p>
      </section>

      {needsDevice && !inputOn ? (
        <section className="app-glass rounded-(--app-radius) px-4 py-2">
          <InputChooser onChosen={() => setChosen((n) => n + 1)} />
        </section>
      ) : (
        (input === 'screen' || input === 'keys') && <OnScreenKeyboard />
      )}
    </div>
  );
}
