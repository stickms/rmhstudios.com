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

import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ReactNode } from 'react';
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
import { LiveStaff } from './LiveStaff';
import { Notehead } from './Notehead';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { permissionGranted, useInputPhases, useNoteEvents, useNoteSound } from './useLearnInput';
import { useMachine } from './useMachine';

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
  const chooserShown = lesson.kind === 'listening' && needsDevice && !inputOn;

  // The chooser scrolls inside the lesson's fixed input region. On a phone the learner's own input
  // (the mic or MIDI row, whose "Use" iOS needs tapped) would sit below that small box's fold, so
  // the box is scrolled — itself only, never the page (no scrollIntoView) — to show that row,
  // before paint. The DOM order, and so the Tab order, stays as it is.
  const chooserBox = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const box = chooserBox.current;
    if (!chooserShown || !box) return;
    const row = box.querySelector<HTMLElement>(`[data-input="${input}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    const max = box.scrollHeight - box.clientHeight;
    box.scrollTop = Math.max(0, Math.min(max, top - 8));
  }, [chooserShown, input]);

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

  const done = lesson.kind !== 'listening';
  const played = done ? lesson.midi : null;
  const name = played === null ? '' : midiToName(played);

  // The page is one fixed frame in every state — listening on any input, saving, saved, failed —
  // so nothing below the header ever moves: a title line, a hint reserved at three lines (clamped;
  // the full text stays in the DOM for screen readers and in `title`), the staff, and the input
  // region (`.rmm-input-region`, the same box the loading placeholder reserves). What changes is
  // only what each box holds.
  const title = !done
    ? t('first-note-instruction', { defaultValue: 'Play any note' })
    : lesson.kind === 'saved' || lesson.kind === 'saving'
      ? t('lesson-complete', { defaultValue: 'Lesson complete' })
      : t('lesson-not-saved', { defaultValue: 'Not saved yet' });
  const line = done
    ? t('first-note-played', { note: name, defaultValue: 'You played {{note}}.' })
    : input === 'keys'
      ? t('first-note-hint-keys', {
          defaultValue: 'Press A, S, D, F, G, H, J or K on your computer keyboard. A is C4.',
        })
      : input === 'midi'
        ? t('first-note-hint-midi', {
            defaultValue: 'Press any key on your MIDI controller.',
          })
        : input === 'mic'
          ? t('first-note-hint-mic', {
              defaultValue: 'Play one note on your instrument, or sing one, near the microphone.',
            })
          : t('first-note-hint-screen', { defaultValue: 'Tap any key on the piano below.' });

  const back = (
    <Link
      to="/rmhmusic"
      className="inline-flex min-h-11 items-center justify-center px-2 text-sm font-medium text-(--app-accent)"
    >
      {t('lesson-back-to-path', { defaultValue: 'Back to your lessons' })}
    </Link>
  );

  let region: ReactNode;
  if (lesson.kind === 'saved' || lesson.kind === 'saving') {
    region = (
      <div className="rmm-sheet flex h-full flex-col items-center-safe justify-center-safe gap-2 overflow-y-auto p-4 text-center">
        <CheckCircle2 className="h-8 w-8 shrink-0 text-(--app-success)" aria-hidden="true" />
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
          {lesson.kind === 'saving' ? t('lesson-saving', { defaultValue: 'Saving…' }) : null}
        </p>
        {back}
      </div>
    );
  } else if (done) {
    region = (
      <div
        role="alert"
        className="rmm-sheet flex h-full flex-col items-center-safe justify-center-safe gap-3 overflow-y-auto p-4 text-center"
      >
        <p className="text-sm text-(--app-danger)">
          {lesson.kind === 'signed-out'
            ? t('error-signed-out', {
                defaultValue: 'Your session ended. Sign in again to continue.',
              })
            : t('lesson-save-failed', {
                defaultValue: "Couldn't save your progress. Check your connection and try again.",
              })}
        </p>
        {lesson.kind === 'signed-out' ? (
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
        {back}
      </div>
    );
  } else if (chooserShown) {
    // Taller than the region: it scrolls inside it rather than growing the page.
    region = (
      <section
        ref={chooserBox}
        className="rmm-sheet h-full overflow-y-auto overscroll-contain px-4 py-2"
      >
        <InputChooser />
      </section>
    );
  } else if (needsDevice) {
    region = (
      <div className="rmm-sheet flex h-full items-center justify-center p-4 text-center">
        <p className="text-sm text-(--app-text-muted)">
          {input === 'mic'
            ? t('first-note-listening-mic', { defaultValue: 'Listening to your microphone.' })
            : t('first-note-listening-midi', {
                defaultValue: 'Listening to your MIDI controller.',
              })}
        </p>
      </div>
    );
  } else {
    // The keys bleed into the page gutter so seven white keys stay ≥ 44px wide: 8px a side, and
    // 14px below 332px (a 320px phone: 280px column + 28px = 308px = 7 × 44px).
    region = <OnScreenKeyboard className="-mx-2 max-[332px]:-mx-3.5 sm:mx-0" />;
  }

  return (
    <div className="space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <h2
          title={title}
          className="rmm-display line-clamp-1 h-8 text-2xl leading-8 text-(--app-text)"
        >
          {/* Keyed so a new state is a new text node: centred text rewritten in place counts as a layout shift. */}
          <span key={lesson.kind}>{title}</span>
        </h2>
        <p title={line} className="line-clamp-3 h-15 text-sm leading-5 text-(--app-text-muted)">
          <span key={done ? 'done' : 'hint'}>{line}</span>
        </p>
        <LiveStaff className="pt-2" note={played ?? undefined} announce={!done} />
      </section>
      <div className="rmm-input-region">{region}</div>
    </div>
  );
}
