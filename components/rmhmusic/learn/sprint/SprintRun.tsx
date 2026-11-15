/**
 * One sight reading run on screen, driven by the pure sprint machine
 * (`lib/rmhmusic/learn/sprint/machine.ts`, held by `useMachine`). This file only carries out the
 * machine's timing and effects:
 *
 * - a plain "Ready" on the sheet and three quiet beats (`tick` every `BEAT_MS`), then the prompt;
 * - `shown` with `performance.now()` read in the effect that runs once the prompt is painted (the
 *   same clock as the hub's note times), so the time is
 *   measured from when the learner could see the notes;
 * - every note event from the hub as it is (its own `time`; nothing here reads a clock for a note);
 * - the chord window's close as a timer (`close`), and the feedback's short pause before `next`;
 * - `save` through the run's saver, answered with its attempt.
 *
 * The sheet and the input region keep fixed boxes for every prompt and state (`SprintSheet` is one
 * card height; `.rmm-input-region` the keyboard's), so nothing moves during a run. Feedback is a
 * pencil tick or a red-pencil cross with the right notes written under the staff, and one sentence.
 * The microphone hears one note at a time: chord prompts are skipped for it (one plain sentence
 * says so in the result) and never marked wrong.
 */

import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CHORD_WINDOW_MS } from '@/lib/rmhmusic/learn/input/chord-window';
import { noteList } from '@/lib/rmhmusic/learn/note-list';
import type {
  Instrument,
  LearnInput,
} from '@/lib/rmhmusic/learn/schemas';
import type { SprintPrompt } from '@/lib/rmhmusic/learn/sprint/generate';
import {
  createSprintMachine,
  type SprintMode,
  type SprintSaveOutcome,
  type SprintState,
} from '@/lib/rmhmusic/learn/sprint/machine';
import type { RunSummary } from '@/lib/rmhmusic/learn/sprint/scoring';
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  TEXT_BUTTON,
} from '../buttons';
import { DeviceRegion } from '../LessonParts';
import { OnScreenKeyboard } from '../OnScreenKeyboard';
import {
  SprintSheet,
  sheetNoteName,
} from '../StaffCard';
import { useMachine } from '../useMachine';
import {
  useInputPhases,
  useLessonInputStart,
  useNoteEvents,
  useNoteSound,
} from '../useLearnInput';

const RETURN_TO =
  '/rmhmusic/sprint';

/** One quiet beat of the "Ready" count. */
export const BEAT_MS = 600;
/** How long a prompt's feedback stays before the next prompt. */
export const FEEDBACK_MS = 700;

export function SprintRun({
  prompts,
  mode,
  scored,
  instrument,
  input,
  paused,
  onChangeInput,
  onDone,
  nextPrompts,
  save,
}: {
  prompts: SprintPrompt[];
  mode: SprintMode;
  scored: boolean;
  instrument: Instrument;
  input: LearnInput;
  /** A dialog is open over the run: the count and the feedback wait, nothing is drawn. */
  paused: boolean;
  onChangeInput: () => void;
  /** Back to the level picker. */
  onDone: () => void;
  /** The prompts of the next run ("Play again"). */
  nextPrompts: () => SprintPrompt[];
  save: (
    summary: RunSummary,
  ) => Promise<SprintSaveOutcome>;
}) {
  const {
    t,
    i18n,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const [
    state,
    send,
  ] =
    useMachine(
      createSprintMachine(
        {
          prompts,
          mode,
          scored,
          mic:
            input ===
            'mic',
          instrument,
        },
      ),
    );
  const phases =
    useInputPhases();
  useNoteSound(
    !paused,
  );
  useLessonInputStart(
    {
      mic: true,
    },
  );

  // Every note goes to the machine with its own time; it decides what counts.
  useNoteEvents(
    (
      e,
    ) => {
      if (
        !paused
      )
        carry(
          send(
            {
              type: 'note',
              note: e,
            },
          ),
        );
    },
  );
  // The save effect, answered with its attempt (a stale answer is ignored by the machine). `send`
  // is the runner's, stable for the screen's life, so `carry` is too.
  const saveRef =
    useRef(
      save,
    );
  useEffect(
    () => {
      saveRef.current =
        save;
    },
  );
  const carry =
    useCallback(
      (
        effects: ReturnType<
          typeof send
        >,
      ) => {
        const run =
          (
            fxs: ReturnType<
              typeof send
            >,
          ): void => {
            for (const fx of fxs) {
              if (
                fx.type !==
                'save'
              )
                continue;
              void saveRef
                .current(
                  fx.summary,
                )
                .catch(
                  () =>
                    'failed' as const,
                )
                .then(
                  (
                    outcome,
                  ) =>
                    run(
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
          };
        run(
          effects,
        );
      },
      [
        send,
      ],
    );

  const mic =
    input ===
    'mic';
  useEffect(() => {
    carry(
      send(
        {
          type: 'input',
          mic,
        },
      ),
    );
  }, [
    mic,
    carry,
    send,
  ]);

  // The count: three quiet beats, paused while a dialog is open.
  const beat =
    state.kind ===
    'countdown'
      ? state.beat
      : -1;
  useEffect(() => {
    if (
      beat <
        0 ||
      paused
    )
      return;
    const id =
      setTimeout(
        () =>
          carry(
            send(
              {
                type: 'tick',
              },
            ),
          ),
        BEAT_MS,
      );
    return () =>
      clearTimeout(
        id,
      );
  }, [
    beat,
    paused,
    carry,
    send,
  ]);

  // `shown`: a passive effect runs after the browser has painted the prompt, so its clock reading
  // is when the learner could first see it (no frame loop needed).
  const askingIndex =
    state.kind ===
      'asking' &&
    state.shownAt ===
      null
      ? state.index
      : -1;
  useEffect(() => {
    if (
      askingIndex <
        0 ||
      paused
    )
      return;
    send(
      {
        type: 'shown',
        at: performance.now(),
      },
    );
  }, [
    askingIndex,
    paused,
    send,
  ]);

  // The chord window's close: CHORD_WINDOW_MS after it opened, on the notes' own clock.
  const windowAt =
    state.kind ===
    'asking'
      ? state.windowAt
      : null;
  useEffect(() => {
    if (
      windowAt ===
      null
    )
      return;
    const wait =
      Math.max(
        0,
        windowAt +
          CHORD_WINDOW_MS -
          performance.now(),
      );
    const id =
      setTimeout(
        () =>
          carry(
            send(
              {
                type: 'close',
                at:
                  windowAt +
                  CHORD_WINDOW_MS,
              },
            ),
          ),
        wait,
      );
    return () =>
      clearTimeout(
        id,
      );
  }, [
    windowAt,
    carry,
    send,
  ]);

  // Feedback stays a moment, then the next prompt.
  const feedbackIndex =
    state.kind ===
    'feedback'
      ? state.index
      : -1;
  useEffect(() => {
    if (
      feedbackIndex <
        0 ||
      paused
    )
      return;
    const id =
      setTimeout(
        () =>
          carry(
            send(
              {
                type: 'next',
              },
            ),
          ),
        FEEDBACK_MS,
      );
    return () =>
      clearTimeout(
        id,
      );
  }, [
    feedbackIndex,
    paused,
    carry,
    send,
  ]);

  const names =
    (
      prompt: SprintPrompt,
    ) =>
      noteList(
        i18n.language,
        prompt.notes.map(
          sheetNoteName,
        ),
      );
  const total =
    state
      .prompts
      .length;

  let sheet: ReactNode;
  let line =
    '';
  if (
    state.kind ===
      'ready' ||
    state.kind ===
      'countdown'
  ) {
    sheet =
      (
        <div className="flex aspect-[200/102] w-full flex-col items-center justify-center gap-3">
          <p className="rmm-display text-[2.5rem] leading-[3rem] text-app-text">
            {t(
              'sprint-ready',
              {
                defaultValue:
                  'Ready',
              },
            )}
          </p>
          <p
            aria-hidden="true"
            className="flex gap-3"
          >
            {[
              0,
              1,
              2,
            ].map(
              (
                b,
              ) => (
                <span
                  key={
                    b
                  }
                  className={`h-2 w-2 rounded-full ${state.kind === 'countdown' && b <= state.beat ? 'bg-app-text' : 'bg-app-border'}`}
                />
              ),
            )}
          </p>
        </div>
      );
    line =
      state.kind ===
      'ready'
        ? ''
        : t(
            'sprint-ready-line',
            {
              defaultValue:
                'The first prompt is coming.',
            },
          );
  } else if (
    state.kind ===
      'asking' ||
    state.kind ===
      'feedback'
  ) {
    const prompt =
      state
        .prompts[
        state
          .index
      ];
    if (
      prompt
    ) {
      const right =
        state.kind ===
          'feedback' &&
        state
          .result
          .correct;
      sheet =
        (
          <SprintSheet
            key={
              state.index
            }
            clef={
              prompt.clef
            }
            notes={
              prompt.notes
            }
            arrangement={
              prompt.kind ===
              'bar'
                ? 'bar'
                : 'chord'
            }
            {...(prompt.kind ===
              'bar' &&
            state.kind ===
              'asking'
              ? {
                  now: state
                    .got
                    .length,
                }
              : {})}
            state={
              state.kind ===
              'asking'
                ? 'ask'
                : right
                  ? 'right'
                  : 'wrong'
            }
            label={promptLabel(
              t,
              prompt,
              names(
                prompt,
              ),
            )}
          />
        );
      if (
        state.kind ===
        'asking'
      ) {
        line =
          prompt.kind ===
          'chord'
            ? state.tooFew >
              0
              ? t(
                  'sprint-chord-too-few',
                  {
                    defaultValue:
                      'Play all the notes together.',
                  },
                )
              : t(
                  'sprint-chord-hint',
                  {
                    defaultValue:
                      'Play the notes together.',
                  },
                )
            : prompt.kind ===
                'bar'
              ? t(
                  'sprint-bar-hint',
                  {
                    defaultValue:
                      'Play the notes in order.',
                  },
                )
              : t(
                  'sprint-note-hint',
                  {
                    defaultValue:
                      'Play the note.',
                  },
                );
      } else {
        line =
          right
            ? t(
                'sprint-right',
                {
                  seconds:
                    formatSeconds(
                      i18n.language,
                      state
                        .result
                        .ms ??
                        0,
                    ),
                  defaultValue:
                    'Right, in {{seconds}} s.',
                },
              )
            : t(
                'sprint-wrong',
                {
                  notes:
                    names(
                      prompt,
                    ),
                  defaultValue:
                    'Not this time: it was {{notes}}.',
                },
              );
      }
    }
  } else {
    sheet =
      (
        <div className="flex aspect-[200/102] w-full items-center justify-center p-4 text-center">
          <p className="text-base leading-6 text-app-text">
            {resultSentence(
              t,
              i18n.language,
              state,
            )}
          </p>
        </div>
      );
    line =
      saveSentence(
        t,
        state,
      );
  }

  const inRun =
    state.kind ===
      'asking' ||
    state.kind ===
      'feedback';
  const count =
    inRun &&
    total >
      0
      ? t(
          'sprint-count',
          {
            n:
              state.index +
              1,
            total,
            defaultValue:
              'Prompt {{n}} of {{total}}',
          },
        )
      : '';
  const finished =
    !inRun &&
    state.kind !==
      'ready' &&
    state.kind !==
      'countdown';

  let answers: ReactNode;
  if (
    finished
  ) {
    answers =
      (
        <div className="rmm-sheet flex h-full flex-col items-center justify-center gap-3 p-4">
          {state.kind ===
          'failed' ? (
            <button
              type="button"
              onClick={() =>
                carry(
                  send(
                    {
                      type: 'retry',
                    },
                  ),
                )
              }
              className={
                PRIMARY_BUTTON
              }
            >
              {t(
                'retry',
                {
                  defaultValue:
                    'Try again',
                },
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                carry(
                  send(
                    {
                      type: 'again',
                      prompts:
                        nextPrompts(),
                    },
                  ),
                )
              }
              disabled={
                state.kind ===
                'saving'
              }
              className={
                PRIMARY_BUTTON
              }
            >
              {t(
                'sprint-again',
                {
                  defaultValue:
                    'Play again',
                },
              )}
            </button>
          )}
          {state.kind ===
          'signed-out' ? (
            <Link
              to="/login"
              search={{
                callbackURL:
                  RETURN_TO,
              }}
              className={
                TEXT_BUTTON
              }
            >
              {t(
                'sign-in',
                {
                  defaultValue:
                    'Sign in',
                },
              )}
            </Link>
          ) : null}
          <button
            type="button"
            onClick={
              onDone
            }
            className={
              SECONDARY_BUTTON
            }
          >
            {t(
              'sprint-choose',
              {
                defaultValue:
                  'Choose another',
              },
            )}
          </button>
        </div>
      );
  } else if (
    state.kind ===
    'ready'
  ) {
    answers =
      (
        <div className="rmm-sheet flex h-full items-center justify-center p-4">
          <button
            type="button"
            onClick={() =>
              carry(
                send(
                  {
                    type: 'start',
                  },
                ),
              )
            }
            className={
              PRIMARY_BUTTON
            }
          >
            {t(
              'sprint-start',
              {
                defaultValue:
                  'Start',
              },
            )}
          </button>
        </div>
      );
  } else if (
    input ===
      'mic' ||
    input ===
      'midi'
  ) {
    answers =
      (
        <div className="h-full">
          <DeviceRegion
            input={
              input
            }
            on={
              phases[
                input
              ] ===
              'active'
            }
          />
        </div>
      );
  } else if (
    input ===
    'keys'
  ) {
    answers =
      (
        <div className="rmm-sheet flex h-full items-center justify-center p-4 text-center">
          <p className="text-sm leading-6 text-app-text-muted">
            {t(
              'flash-keys-region',
              {
                defaultValue:
                  'Your computer keys are a piano: A, S, D, F, G, H, J and K play C, D, E, F, G, A, B and C.',
              },
            )}
          </p>
        </div>
      );
  } else {
    answers =
      (
        <OnScreenKeyboard className="-mx-2 max-[332px]:-mx-3.5 sm:mx-0" />
      );
  }

  const said =
    state.kind ===
      'feedback' ||
    finished
      ? line
      : state.kind ===
            'asking' &&
          state.shownAt !==
            null
        ? count
        : '';

  return (
    <div className="space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <p className="h-6 text-sm leading-6 text-app-text-muted">
          {
            count
          }
        </p>
        <div className="mx-auto w-full max-w-72 sm:max-w-80">
          {
            sheet
          }
        </div>
        <p className="min-h-12 text-sm leading-6 text-app-text-muted">
          {
            line
          }
        </p>
        <p
          role="status"
          className="sr-only"
        >
          {
            said
          }
        </p>
      </section>
      <div className="rmm-input-region">
        {
          answers
        }
      </div>
      {state.mic &&
      (inRun ||
        state.kind ===
          'countdown') &&
      state.prompts.some(
        (
          p,
        ) =>
          p.kind ===
          'chord',
      ) ? (
        <p className="text-sm leading-6 text-app-text-muted">
          {t(
            'sprint-mic-chords',
            {
              defaultValue:
                'The microphone hears one note at a time, so chords are skipped.',
            },
          )}{' '}
          <button
            type="button"
            onClick={
              onChangeInput
            }
            className={
              TEXT_BUTTON
            }
          >
            {t(
              'chord-change-input',
              {
                defaultValue:
                  'Change input',
              },
            )}
          </button>
        </p>
      ) : null}
    </div>
  );
}

/** The sheet's accessible name: the notes in words and the staff they are on. */
function promptLabel(
  t: TFunction<'c-rmhmusic'>,
  prompt: SprintPrompt,
  notes: string,
): string {
  if (
    prompt.kind ===
    'bar'
  ) {
    return prompt.clef ===
      'bass'
      ? t(
          'sprint-label-bar-bass',
          {
            notes,
            defaultValue:
              '{{notes}} in order on the bass staff',
          },
        )
      : t(
          'sprint-label-bar-treble',
          {
            notes,
            defaultValue:
              '{{notes}} in order on the treble staff',
          },
        );
  }
  if (
    prompt.kind ===
    'chord'
  ) {
    return prompt.clef ===
      'bass'
      ? t(
          'sprint-label-chord-bass',
          {
            notes,
            defaultValue:
              '{{notes}} together on the bass staff',
          },
        )
      : t(
          'sprint-label-chord-treble',
          {
            notes,
            defaultValue:
              '{{notes}} together on the treble staff',
          },
        );
  }
  return prompt.clef ===
    'bass'
    ? t(
        'flash-card-named-bass',
        {
          note: notes,
          defaultValue:
            '{{note}} on the bass staff',
        },
      )
    : t(
        'flash-card-named-treble',
        {
          note: notes,
          defaultValue:
            '{{note}} on the treble staff',
        },
      );
}

function formatSeconds(
  language: string,
  ms: number,
): string {
  return new Intl.NumberFormat(
    language,
    {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    },
  ).format(
    ms /
      1000,
  );
}

type Finished =
  Extract<
    SprintState,
    {
      summary: RunSummary;
    }
  >;

/** The result as one sentence (two when chords were skipped for the microphone). */
function resultSentence(
  t: TFunction<'c-rmhmusic'>,
  language: string,
  state: Finished,
): string {
  const s =
    state.summary;
  const base =
    s.avgMs ===
    null
      ? t(
          'sprint-result-none',
          {
            score:
              s.score,
            total:
              s.played,
            defaultValue:
              'You scored {{score}}: none of the {{total}} prompts was right.',
          },
        )
      : t(
          'sprint-result',
          {
            score:
              s.score,
            correct:
              s.correct,
            total:
              s.played,
            seconds:
              formatSeconds(
                language,
                s.avgMs,
              ),
            defaultValue:
              'You scored {{score}}, with {{correct}} of {{total}} right in {{seconds}} s on average.',
          },
        );
  if (
    s.skipped ===
    0
  )
    return base;
  return `${base} ${t(
    'sprint-result-skipped',
    {
      defaultValue:
        'Chords were skipped for the microphone and are not in the score.',
    },
  )}`;
}

/** Whether the result was kept, in plain words. */
function saveSentence(
  t: TFunction<'c-rmhmusic'>,
  state: Finished,
): string {
  switch (
    state.kind
  ) {
    case 'saving':
      return t(
        'sprint-saving',
        {
          defaultValue:
            'Saving…',
        },
      );
    case 'saved':
      return t(
        'sprint-saved',
        {
          defaultValue:
            'Saved.',
        },
      );
    case 'failed':
      return t(
        'sprint-save-failed',
        {
          defaultValue:
            "Couldn't save this result.",
        },
      );
    case 'signed-out':
      return t(
        'sprint-signed-out',
        {
          defaultValue:
            'Not saved: sign in again to keep your results.',
        },
      );
    case 'complete':
      return state.scored
        ? t(
            'sprint-not-saved',
            {
              defaultValue:
                'Not saved: results are not kept yet.',
            },
          )
        : t(
            'sprint-practice',
            {
              defaultValue:
                "Practice: today's score is your first run.",
            },
          );
  }
}
