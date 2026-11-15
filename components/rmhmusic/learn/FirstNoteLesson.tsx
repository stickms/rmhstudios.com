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

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { releaseMic } from '@/lib/rmhmusic/learn/input/mic-lifecycle';
import {
  firstNoteMachine,
  type Effect,
} from '@/lib/rmhmusic/learn/machines/first-note';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import {
  DeviceRegion,
  LessonResult,
} from './LessonParts';
import { LiveStaff } from './LiveStaff';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import {
  useInputPhases,
  useLessonInputStart,
  useNoteEvents,
  useNoteSound,
} from './useLearnInput';
import { useMachine } from './useMachine';

/** `lessonId` is the lesson being completed; `paused` (a dialog is open over the lesson) stops notes counting. */
export function FirstNoteLesson({
  lessonId,
  paused = false,
}: {
  lessonId: string;
  paused?: boolean;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const hub =
    useLearnStore(
      (
        s,
      ) =>
        s.hub,
    );
  const input =
    useLearnStore(
      (
        s,
      ) =>
        s
          .profile
          ?.input ??
        'screen',
    );
  const [
    lesson,
    send,
  ] =
    useMachine(
      firstNoteMachine,
    );
  const phases =
    useInputPhases();
  useNoteSound(
    !paused,
  );

  const needsDevice =
    input ===
      'mic' ||
    input ===
      'midi';
  const inputOn =
    !needsDevice ||
    phases[
      input
    ] ===
      'active';

  useLessonInputStart();

  // Leaving the lesson (keys and mic stop) is LessonScreen's `useInputRelease`.

  const perform =
    (
      effects: Effect[],
    ) => {
      for (const fx of effects) {
        if (
          fx.type ===
          'release-mic'
        ) {
          // The lesson is done listening; the success screen needs no microphone.
          if (
            hub
          )
            releaseMic(
              hub,
            );
        } else {
          void useLearnStore
            .getState()
            .completeLesson(
              lessonId,
              3,
              100,
            )
            .then(
              (
                outcome,
              ) =>
                perform(
                  send(
                    {
                      type: 'answered',
                      attempt:
                        fx.attempt,
                      outcome,
                    },
                  ),
                ),
            );
        }
      }
    };

  useNoteEvents(
    (
      e,
    ) => {
      if (
        paused ||
        e.type !==
          'on'
      )
        return;
      perform(
        send(
          {
            type: 'note',
            midi: e.midi,
          },
        ),
      );
    },
  );

  const retry =
    () =>
      perform(
        send(
          {
            type: 'retry',
          },
        ),
      );

  const done =
    lesson.kind !==
    'listening';
  const played =
    done
      ? lesson.midi
      : null;
  const name =
    played ===
    null
      ? ''
      : midiToName(
          played,
        );

  // The page is one fixed frame in every state — listening on any input, saving, saved, failed —
  // so nothing below the header ever moves: a title line, a hint reserved at three lines (clamped;
  // the full text stays in the DOM for screen readers and in `title`), the staff, and the input
  // region (`.rmm-input-region`, the same box the loading placeholder reserves). What changes is
  // only what each box holds.
  const title =
    !done
      ? t(
          'first-note-instruction',
          {
            defaultValue:
              'Play any note',
          },
        )
      : lesson.kind ===
            'saved' ||
          lesson.kind ===
            'saving'
        ? t(
            'lesson-complete',
            {
              defaultValue:
                'Lesson complete',
            },
          )
        : t(
            'lesson-not-saved',
            {
              defaultValue:
                'Not saved yet',
            },
          );
  const line =
    done
      ? t(
          'first-note-played',
          {
            note: name,
            defaultValue:
              'You played {{note}}.',
          },
        )
      : input ===
          'keys'
        ? t(
            'first-note-hint-keys',
            {
              defaultValue:
                'Press A, S, D, F, G, H, J or K on your computer keyboard. A is C4.',
            },
          )
        : input ===
            'midi'
          ? t(
              'first-note-hint-midi',
              {
                defaultValue:
                  'Press any key on your MIDI controller.',
              },
            )
          : input ===
              'mic'
            ? t(
                'first-note-hint-mic',
                {
                  defaultValue:
                    'Play one note on your instrument, or sing one, near the microphone.',
                },
              )
            : t(
                'first-note-hint-screen',
                {
                  defaultValue:
                    'Tap any key on the piano below.',
                },
              );

  let region: ReactNode;
  if (
    done
  ) {
    region =
      (
        <LessonResult
          kind={
            lesson.kind
          }
          stars={
            3
          }
          returnTo={`/rmhmusic/lesson/${lessonId}`}
          onRetry={
            retry
          }
        />
      );
  } else if (
    needsDevice
  ) {
    region =
      (
        <DeviceRegion
          input={
            input
          }
          on={
            inputOn
          }
        />
      );
  } else {
    // The keys bleed into the page gutter so seven white keys stay ≥ 44px wide: 8px a side, and
    // 14px below 332px (a 320px phone: 280px column + 28px = 308px = 7 × 44px).
    region =
      (
        <OnScreenKeyboard className="-mx-2 max-[332px]:-mx-3.5 sm:mx-0" />
      );
  }

  return (
    <div className="space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <h2 className="rmm-display min-h-8 text-2xl leading-8 text-app-text">
          {/* Keyed so a new state is a new text node: centred text rewritten in place counts as a layout shift. */}
          <span
            key={
              lesson.kind
            }
          >
            {
              title
            }
          </span>
        </h2>
        <p className="min-h-15 text-sm leading-5 text-app-text-muted">
          <span
            key={
              done
                ? 'done'
                : 'hint'
            }
          >
            {
              line
            }
          </span>
        </p>
        <LiveStaff
          className="pt-2"
          note={
            played ??
            undefined
          }
          announce={
            !done
          }
        />
      </section>
      <div className="rmm-input-region">
        {
          region
        }
      </div>
    </div>
  );
}
