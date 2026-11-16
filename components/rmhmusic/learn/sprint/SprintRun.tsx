/**
 * One sight reading run on screen, driven by the pure sprint machine
 * (`lib/rmhmusic/learn/sprint/machine.ts`, held by `useMachine`). This file only carries out the
 * machine's timing and effects:
 *
 * - a plain "Ready" on the sheet and three quiet beats (`tick` every `BEAT_MS`), then the prompt;
 * - `shown` with `performance.now()` read in a passive effect, which React runs after the browser
 *   has painted the prompt: the reading can trail the paint by up to about a frame (~16 ms), the
 *   same bias for every prompt, and it is the hub's clock, so note times compare with it;
 * - every note event from the hub as it is (its own `time`; nothing here reads a clock for a note);
 * - the chord window's close as a timer (`close`), and the feedback's short pause before `next`;
 * - `save` through the run's saver, with every prompt's result, answered with its attempt, and
 *   `onStart` when Start is pressed on a scored run (the daily challenge records its start);
 * - `resume` when a dialog that paused the run closes, so the prompt is drawn and timed afresh.
 *
 * The input is fixed for the run (the machine ignores a change; `onLockChange` tells the page to
 * disable Change input from the count until the end). The sheet and the input region keep fixed
 * boxes for every prompt and state — the "Ready" and result boxes are the sheet's height including
 * its caption line — so nothing moves when a run starts or ends. Focus follows the run: Start on
 * entry, the sheet during the run, Play again (or Try again) at the end.
 */

import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
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
} from '@/lib/rmhmusic/learn/sprint/machine';
import type {
  PromptResult,
  RunSummary,
} from '@/lib/rmhmusic/learn/sprint/scoring';
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
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
import { focusOf } from './focus';
import {
  askHint,
  feedbackLine,
  promptLabel,
  resultSentence,
  saveSentence,
} from './sprint-text';

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
  onStart,
  instrument,
  input,
  paused,
  onLockChange,
  onDone,
  nextPrompts,
  save,
  lowCard:
    lowRange = false,
}: {
  /** A singer whose range reaches below the deck card (an alto's G3): the low card. */
  lowCard?: boolean;
  prompts: SprintPrompt[];
  mode: SprintMode;
  scored: boolean;
  /** Start was pressed on a scored run (the daily challenge records its start). */
  onStart?: () => void;
  instrument: Instrument;
  input: LearnInput;
  /** A dialog is open over the run: the count and the feedback wait, notes are not taken. */
  paused: boolean;
  /** True from the count until the run ends: the page locks its input switch. */
  onLockChange: (
    locked: boolean,
  ) => void;
  /** Back to the level picker. */
  onDone: () => void;
  /** The prompts of the next run ("Play again"). */
  nextPrompts: () => SprintPrompt[];
  save: (
    summary: RunSummary,
    results: readonly PromptResult[],
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
          // A singer's run skips the chord prompts whatever the input (one voice, one note).
          mic:
            input ===
              'mic' ||
            instrument ===
              'voice',
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
  const guitar =
    instrument ===
    'guitar';

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
                  fx.results,
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

  // The input: taken by the machine only before a run or after it (fixed while one is under way).
  const mic =
    input ===
      'mic' ||
    instrument ===
      'voice';
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

  const inRun =
    state.kind ===
      'countdown' ||
    state.kind ===
      'asking' ||
    state.kind ===
      'feedback';
  useEffect(() => {
    onLockChange(
      inRun,
    );
  }, [
    inRun,
    onLockChange,
  ]);

  // A dialog paused the run: once it closes, the prompt is drawn and timed afresh.
  const wasPaused =
    useRef(
      paused,
    );
  useEffect(() => {
    if (
      wasPaused.current &&
      !paused
    )
      carry(
        send(
          {
            type: 'resume',
          },
        ),
      );
    wasPaused.current =
      paused;
  }, [
    paused,
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

  // `shown`: this passive effect runs once the prompt has been painted (see the header).
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

  // Focus follows the run: Start on entry, the sheet once the count starts, the next action at the
  // end — the control that had it is gone each time.
  const startButton =
    useRef<HTMLButtonElement>(
      null,
    );
  const sheetBox =
    useRef<HTMLElement>(
      null,
    );
  const endButton =
    useRef<HTMLButtonElement>(
      null,
    );
  const phase =
    state.kind ===
    'ready'
      ? 'ready'
      : inRun
        ? 'run'
        : 'end';
  const focus =
    focusOf(
      state.kind,
    );
  useEffect(() => {
    if (
      focus ===
      'start'
    )
      startButton.current?.focus();
    else if (
      focus ===
      'sheet'
    )
      sheetBox.current?.focus();
    else if (
      focus ===
      'end'
    )
      endButton.current?.focus();
  }, [
    focus,
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
  const lowCard =
    guitar ||
    lowRange;
  /** The sheet's box, caption line included: the "Ready" and result boxes take the same. */
  const sheetSize =
    lowCard
      ? 'aspect-[200/117]'
      : 'aspect-[200/102]';

  let sheet: ReactNode;
  let line =
    '';
  let said =
    '';
  if (
    state.kind ===
      'ready' ||
    state.kind ===
      'countdown'
  ) {
    sheet =
      (
        <div>
          <div
            className={`flex ${sheetSize} w-full flex-col items-center justify-center gap-3`}
          >
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
          <div
            aria-hidden="true"
            className="h-9"
          />
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
    said =
      line;
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
              state.kind ===
                'feedback',
              names(
                prompt,
              ),
            )}
            range={
              lowCard
                ? 'low'
                : 'deck'
            }
            octaveClef={
              guitar ||
              !!prompt.octaveClef
            }
          />
        );
      if (
        state.kind ===
        'asking'
      ) {
        line =
          askHint(
            t,
            prompt,
            input,
            state.tooFew,
          );
        said =
          state.shownAt !==
            null &&
          state
            .got
            .length ===
            0
            ? count(
                state.index,
              )
            : '';
      } else {
        // The note the learner missed, named with its octave (for a wrong octave on MIDI).
        const missed =
          Math.max(
            0,
            Math.min(
              prompt
                .notes
                .length -
                1,
              state
                .played
                .length -
                1,
            ),
          );
        const target =
          state
            .targets[
            state
              .index
          ]?.[
            missed
          ];
        const written =
          prompt
            .notes[
            missed
          ];
        const exact =
          written &&
          target !==
            undefined
            ? `${sheetNoteName(written)}${Math.floor(target / 12) - 1}`
            : '';
        line =
          feedbackLine(
            t,
            i18n.language,
            state,
            names(
              prompt,
            ),
            exact,
          );
        said =
          line;
      }
    }
  } else {
    const result =
      resultSentence(
        t,
        i18n.language,
        state.summary,
      );
    sheet =
      (
        <div>
          <div
            className={`flex ${sheetSize} w-full items-center justify-center p-4 text-center`}
          >
            <p className="text-base leading-6 text-app-text">
              {
                result
              }
            </p>
          </div>
          <div
            aria-hidden="true"
            className="h-9"
          />
        </div>
      );
    line =
      saveSentence(
        t,
        state,
      );
    said = `${result} ${line}`;
  }

  function count(
    index: number,
  ): string {
    return t(
      'sprint-count',
      {
        n:
          index +
          1,
        total,
        defaultValue:
          'Prompt {{n}} of {{total}}',
      },
    );
  }

  // The count and the caption are centred lines whose text changes every prompt. Keyed by their
  // text, a new line is a new node rather than the old one re-centred, so the browser does not
  // report each change as a layout shift (CLS stays 0 through a run).
  const shownCount =
    (state.kind ===
      'asking' ||
      state.kind ===
        'feedback') &&
    total >
      0
      ? count(
          state.index,
        )
      : '';

  let answers: ReactNode;
  if (
    phase ===
    'end'
  ) {
    answers =
      (
        <div className="rmm-sheet flex h-full flex-col items-center justify-center gap-3 p-4">
          {state.kind ===
          'failed' ? (
            <button
              ref={
                endButton
              }
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
              ref={
                endButton
              }
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
                SECONDARY_BUTTON
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
    phase ===
    'ready'
  ) {
    answers =
      (
        <div className="rmm-sheet flex h-full items-center justify-center p-4">
          <button
            ref={
              startButton
            }
            type="button"
            onClick={() => {
              if (
                state.scored
              )
                onStart?.();
              carry(
                send(
                  {
                    type: 'start',
                  },
                ),
              );
            }}
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

  return (
    <div className="space-y-4">
      <section
        ref={
          sheetBox
        }
        tabIndex={
          -1
        }
        aria-label={t(
          'sprint-sheet',
          {
            defaultValue:
              'The prompt',
          },
        )}
        className="rmm-sheet space-y-2 p-5 text-center sm:p-6"
      >
        <p
          key={`count:${shownCount}`}
          className="h-6 text-sm leading-6 text-app-text-muted"
        >
          {
            shownCount
          }
        </p>
        <div className="mx-auto w-full max-w-72 sm:max-w-80">
          {
            sheet
          }
        </div>
        <p
          key={`line:${line}`}
          className="min-h-12 text-sm leading-6 text-app-text-muted"
        >
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
      <p className="min-h-6 text-sm leading-6 text-app-text-muted">
        {state.mic &&
        state.prompts.some(
          (
            p,
          ) =>
            p.kind ===
            'chord',
        )
          ? t(
              'sprint-mic-chords-skipped',
              {
                defaultValue:
                  'Chords are skipped: the microphone hears one note at a time.',
              },
            )
          : ''}
      </p>
    </div>
  );
}
