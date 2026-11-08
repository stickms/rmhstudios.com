'use client';

/**
 * FirstNoteLesson — a "play any note" lesson (`play-first-note`): the first note
 * from any started input completes it with three stars. On-screen and
 * computer keys show the piano; MIDI and the microphone show the note they
 * hear. A failed save says so and offers Retry, so the learner is never stuck.
 *
 * The listening → saving → saved / failed / signed-out lifecycle is the pure
 * machine in `machines/first-note.ts`: the first note leaves `listening`
 * synchronously, so a chord's notes in one tick complete it once.
 *
 * On entry the chosen input is started: the keys need no permission; the mic
 * and MIDI start by themselves only when the browser already granted them (and,
 * for the mic, sound is already running, which iOS ties to a tap); otherwise the
 * input chooser shows inline, and its click starts them.
 */

import { useEffect } from 'react';
import { Link } from '@tanstack/react-router';
import { CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { releaseMic, startMic } from '@/lib/rmhmusic/learn/input/mic-lifecycle';
import { firstNoteMachine, type Effect } from '@/lib/rmhmusic/learn/machines/first-note';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { getAudioContext } from '@/lib/shared/platform';
import { PRIMARY_BUTTON } from './buttons';
import { InputChooser } from './InputChooser';
import { Notehead } from './Notehead';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import {
  permissionGranted,
  useInputPhases,
  useLastNote,
  useNoteEvents,
  useNoteSound,
} from './useLearnInput';
import { useMachine } from './useMachine';

/**
 * The latest note in large type. Its own component so a note re-renders this
 * line only, not the lesson around it.
 */
function LastNoteReadout() {
  const last = useLastNote();
  return (
    <p
      className="min-h-16 text-5xl font-bold text-(--app-accent)"
      style={{ fontFamily: 'var(--app-font-mono)' }}
      aria-live="polite"
    >
      {last ? midiToName(last.midi) : null}
    </p>
  );
}

/** `lessonId` is the lesson being completed; `paused` (a dialog is open over the lesson) stops notes counting. */
export function FirstNoteLesson({
  lessonId,
  paused = false,
}: {
  lessonId: string;
  paused?: boolean;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const hub = useLearnStore((s) => s.hub);
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  const [lesson, send] = useMachine(firstNoteMachine);
  const phases = useInputPhases();
  useNoteSound(!paused);

  const needsDevice = input === 'mic' || input === 'midi';
  const inputOn = !needsDevice || phases[input] === 'active';

  // Start the chosen input (switching inputs mid-lesson goes through `chooseInput`, which stops the old one).
  useEffect(() => {
    if (!hub) return;
    let cancelled = false;
    if (input === 'keys') void hub.start('keys').catch(() => {});
    if (input === 'mic' || input === 'midi') {
      void (async () => {
        if (hub.phase(input) !== 'idle' || !(await permissionGranted(input))) return;
        if (input === 'mic' && getAudioContext()?.state !== 'running') return;
        if (cancelled) return;
        await (input === 'mic' ? startMic(hub) : hub.start(input)).catch(() => {});
      })();
    }
    return () => {
      cancelled = true;
    };
  }, [hub, input]);

  // Leaving the lesson (keys and mic stop) is LessonScreen's `useInputRelease`.

  const perform = (effects: Effect[]) => {
    for (const fx of effects) {
      if (fx.type === 'release-mic') {
        // The lesson is done listening; the success screen needs no microphone.
        if (hub) releaseMic(hub);
      } else {
        void useLearnStore
          .getState()
          .completeLesson(lessonId, 3, 100)
          .then((outcome) => perform(send({ type: 'answered', attempt: fx.attempt, outcome })));
      }
    }
  };

  useNoteEvents((e) => {
    if (paused || e.type !== 'on') return;
    perform(send({ type: 'note', midi: e.midi }));
  });

  const retry = () => perform(send({ type: 'retry' }));

  if (lesson.kind !== 'listening') {
    const played = lesson.midi;
    const save = lesson.kind;
    const name = midiToName(played);
    return (
      <section className="rmm-sheet space-y-4 p-5 text-center sm:p-6">
        {save === 'saved' || save === 'saving' ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-(--app-success)" aria-hidden="true" />
            <h2 className="rmm-display text-2xl font-bold text-(--app-text)">
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
                <Notehead key={i} kind="filled" className="h-5 w-7 text-(--app-accent)" />
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
                search={{ callbackURL: `/rmhmusic/lesson/${lessonId}` }}
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
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <h2 className="rmm-display text-xl font-semibold text-(--app-text)">
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
        <LastNoteReadout />
      </section>

      {needsDevice && !inputOn ? (
        <section className="rmm-sheet px-4 py-2">
          <InputChooser />
        </section>
      ) : (
        (input === 'screen' || input === 'keys') && <OnScreenKeyboard className="-mx-2 sm:mx-0" />
      )}
    </div>
  );
}
