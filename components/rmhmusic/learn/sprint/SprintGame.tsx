/**
 * SprintGame — `/rmhmusic/sprint`, the sight reading game. Notes appear on the staff and the
 * learner plays them as fast as they can. Two ways to play, switched with the sanctioned `<Tabs>`:
 * **Freeplay** (pick a level from plain text rows; a 20-prompt run) and the **Daily challenge** (the
 * same 30 prompts for everyone on a UTC day; the first finished run is the scored one, later runs
 * that day are practice). A game beside the path: it completes no lesson and gates nothing.
 *
 * The page is the lessons' `Shell` (back link, title, Change input). The input is chosen before a
 * run and fixed during it: Change input is disabled from the count until the run ends, and says
 * why. With the microphone, the chord levels are listed but not offered (one sentence says why).
 * Guitar reads the treble staff only, with the small 8 under the clef, on the taller low card.
 * The picker's rows and its loading placeholder are the same height, so loading moves nothing.
 * Results go through a `SprintSaver` (`lib/rmhmusic/learn/sprint/saver.ts`); until results are
 * stored the result says plainly that it was not saved.
 */

import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { mulberry32 } from '@/lib/core/rng';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import type { Instrument } from '@/lib/rmhmusic/learn/schemas';
import {
  dailyRun,
  makeRun,
  utcDate,
  type SprintPrompt,
} from '@/lib/rmhmusic/learn/sprint/generate';
import {
  FREEPLAY_PROMPTS,
  SPRINT_LEVELS,
  micAllowed,
  type SprintLevelId,
} from '@/lib/rmhmusic/learn/sprint/levels';
import {
  createMemorySaver,
  type SprintSaver,
} from '@/lib/rmhmusic/learn/sprint/saver';
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from '../buttons';
import { InputSetup } from '../InputSetup';
import { Shell } from '../LessonScreen';
import { useInputRelease } from '../useLearnInput';
import { SprintRun } from './SprintRun';
import {
  levelHint,
  levelName,
} from './sprint-text';

type Mode =
  | 'freeplay'
  | 'daily';

const RETURN_TO =
  '/rmhmusic/sprint';

/**
 * One row of the picker, and of its placeholder: two text lines (24px + 20px) in a 72px row, so
 * the placeholder is exactly as tall as the loaded list.
 */
const ROW =
  'flex min-h-18 w-full flex-col items-start justify-center px-4 py-2 text-start';

/** What is being played: a freeplay level or today's challenge, with its prompts. */
type Playing =
  | {
      mode: 'freeplay';
      level: SprintLevelId;
      prompts: SprintPrompt[];
    }
  | {
      mode: 'daily';
      date: string;
      prompts: SprintPrompt[];
      scored: boolean;
    };

export function SprintGame({
  saver:
    givenSaver,
}: {
  saver?: SprintSaver;
} = {}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const [
    saver,
  ] =
    useState(
      () =>
        givenSaver ??
        createMemorySaver(),
    );
  const status =
    useLearnStore(
      (
        s,
      ) =>
        s.status,
    );
  const error =
    useLearnStore(
      (
        s,
      ) =>
        s.error,
    );
  const profile =
    useLearnStore(
      (
        s,
      ) =>
        s.profile,
    );
  const [
    mode,
    setMode,
  ] =
    useState<Mode>(
      'freeplay',
    );
  const [
    playing,
    setPlaying,
  ] =
    useState<Playing | null>(
      null,
    );
  const [
    locked,
    setLocked,
  ] =
    useState(
      false,
    );
  const [
    dailyFailed,
    setDailyFailed,
  ] =
    useState(
      false,
    );
  const [
    setupOpen,
    setSetupOpen,
  ] =
    useState(
      false,
    );
  const setupButton =
    useRef<HTMLButtonElement>(
      null,
    );
  const firstRow =
    useRef<HTMLButtonElement>(
      null,
    );
  const backToPicker =
    useRef(
      false,
    );
  const lockedReason =
    useId();
  useInputRelease();

  useEffect(() => {
    void useLearnStore
      .getState()
      .load();
  }, []);

  // Back from a run: focus goes to the first level, where the learner chooses again.
  useEffect(() => {
    if (
      playing ===
        null &&
      backToPicker.current
    ) {
      backToPicker.current = false;
      firstRow.current?.focus();
    }
  }, [
    playing,
  ]);

  const ready =
    status ===
      'ready' &&
    !!profile;
  const loading =
    !ready &&
    status !==
      'error';
  const arrival =
    useArrival(
      !loading,
    );
  const instrument: Instrument =
    profile?.instrument ??
    'piano';
  const guitar =
    instrument ===
    'guitar';
  const mic =
    profile?.input ===
    'mic';

  const freeplayPrompts =
    (
      level: SprintLevelId,
    ) =>
      makeRun(
        level,
        FREEPLAY_PROMPTS,
        mulberry32(
          seed(),
        ),
        instrument,
      );
  const playDaily =
    async () => {
      // The day is decided once, here, when the run is dealt (`utcDate`); a run started before
      // midnight UTC stays that day's run, and that dealt date is what is saved.
      const date =
        utcDate(
          Date.now(),
        );
      let done: boolean;
      try {
        done =
          await saver.dailyDone(
            date,
          );
      } catch {
        setDailyFailed(
          true,
        );
        return;
      }
      setDailyFailed(
        false,
      );
      setPlaying(
        {
          mode: 'daily',
          date,
          prompts:
            dailyRun(
              date,
              instrument,
            ),
          scored:
            !done,
        },
      );
    };

  let body: ReactNode;
  if (
    status ===
    'error'
  ) {
    body =
      (
        <div
          role="alert"
          className={`rmm-sheet space-y-3 p-4 ${arrival}`}
        >
          <p className="text-app-text">
            {error ===
            'unauthorized'
              ? t(
                  'error-signed-out',
                  {
                    defaultValue:
                      'Your session ended. Sign in again to continue.',
                  },
                )
              : t(
                  'sprint-load-failed',
                  {
                    defaultValue:
                      "Couldn't load your settings.",
                  },
                )}
          </p>
          {error ===
          'unauthorized' ? (
            <Link
              to="/login"
              search={{
                callbackURL:
                  RETURN_TO,
              }}
              className={
                PRIMARY_BUTTON
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
          ) : (
            <button
              type="button"
              onClick={() =>
                void useLearnStore
                  .getState()
                  .load()
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
          )}
        </div>
      );
  } else if (
    playing &&
    profile
  ) {
    body =
      (
        <SprintRun
          key={`${playing.mode}-${playing.mode === 'freeplay' ? playing.level : playing.date}`}
          prompts={
            playing.prompts
          }
          mode={
            playing.mode
          }
          scored={
            playing.mode ===
            'daily'
              ? playing.scored
              : true
          }
          instrument={
            instrument
          }
          input={
            profile.input
          }
          paused={
            setupOpen
          }
          onLockChange={
            setLocked
          }
          onDone={() => {
            backToPicker.current = true;
            setLocked(
              false,
            );
            setPlaying(
              null,
            );
          }}
          nextPrompts={() =>
            playing.mode ===
            'freeplay'
              ? freeplayPrompts(
                  playing.level,
                )
              : dailyRun(
                  playing.date,
                  instrument,
                )
          }
          save={(
            summary,
            results,
          ) =>
            playing.mode ===
            'freeplay'
              ? saver.saveFreeplay(
                  {
                    level:
                      playing.level,
                    summary,
                    results,
                  },
                )
              : saver.saveDaily(
                  {
                    date: playing.date,
                    summary,
                    results,
                  },
                )
          }
        />
      );
  } else {
    body =
      (
        <div
          className={
            loading
              ? 'space-y-4'
              : `space-y-4 ${arrival}`
          }
        >
          <Tabs
            tabs={[
              {
                id: 'freeplay',
                label:
                  t(
                    'sprint-freeplay',
                    {
                      defaultValue:
                        'Freeplay',
                    },
                  ),
              },
              {
                id: 'daily',
                label:
                  t(
                    'sprint-daily',
                    {
                      defaultValue:
                        'Daily challenge',
                    },
                  ),
              },
            ]}
            value={
              mode
            }
            onChange={(
              id,
            ) =>
              setMode(
                id ===
                  'daily'
                  ? 'daily'
                  : 'freeplay',
              )
            }
            aria-label={t(
              'sprint-mode',
              {
                defaultValue:
                  'How to play',
              },
            )}
          />
          {mode ===
          'freeplay' ? (
            <ul
              className="rmm-sheet divide-y divide-app-border"
              aria-busy={
                loading ||
                undefined
              }
            >
              {SPRINT_LEVELS.map(
                (
                  level,
                  i,
                ) => (
                  <li
                    key={
                      level.id
                    }
                  >
                    {loading ? (
                      <div
                        aria-hidden="true"
                        className={
                          ROW
                        }
                      >
                        <span className="flex h-6 items-center">
                          <span className="app-skeleton h-4 w-40 max-w-full" />
                        </span>
                        <span className="flex h-5 items-center">
                          <span className="app-skeleton h-3.5 w-56 max-w-full" />
                        </span>
                      </div>
                    ) : mic &&
                      !micAllowed(
                        level.kind,
                      ) ? (
                      <div
                        className={
                          ROW
                        }
                      >
                        <span className="text-base leading-6 text-app-text-muted">
                          {levelName(
                            t,
                            level.id,
                          )}
                        </span>
                        <span className="text-sm leading-5 text-app-text-muted">
                          {t(
                            'sprint-level-mic',
                            {
                              defaultValue:
                                'Not with the microphone: it hears one note at a time.',
                            },
                          )}
                        </span>
                      </div>
                    ) : (
                      <button
                        ref={
                          i ===
                          0
                            ? firstRow
                            : undefined
                        }
                        type="button"
                        onClick={() =>
                          setPlaying(
                            {
                              mode: 'freeplay',
                              level:
                                level.id,
                              prompts:
                                freeplayPrompts(
                                  level.id,
                                ),
                            },
                          )
                        }
                        className={`${ROW} rounded-app-sm transition-colors hover:bg-app-surface-hover`}
                      >
                        <span className="text-base leading-6 text-app-text">
                          {levelName(
                            t,
                            level.id,
                          )}
                        </span>
                        <span className="text-sm leading-5 text-app-text-muted">
                          {levelHint(
                            t,
                            level.id,
                            guitar,
                          )}
                        </span>
                      </button>
                    )}
                  </li>
                ),
              )}
            </ul>
          ) : (
            <DailyIntro
              loading={
                loading
              }
              failed={
                dailyFailed
              }
              mic={
                mic
              }
              onPlay={() =>
                void playDaily()
              }
            />
          )}
        </div>
      );
  }

  return (
    <Shell
      title={t(
        'sprint-title',
        {
          defaultValue:
            'Sight reading',
        },
      )}
      busy={
        loading
      }
      action={
        <div className="flex flex-col items-end">
          <button
            ref={
              setupButton
            }
            type="button"
            disabled={
              locked ||
              loading
            }
            aria-describedby={
              locked
                ? lockedReason
                : undefined
            }
            onClick={() =>
              setSetupOpen(
                true,
              )
            }
            aria-label={t(
              'change-input',
              {
                defaultValue:
                  'Change input',
              },
            )}
            className={`${SECONDARY_BUTTON} min-w-11 max-[399px]:px-0`}
          >
            <SlidersHorizontal
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span
              aria-hidden="true"
              className="max-[399px]:hidden"
            >
              {t(
                'change-input',
                {
                  defaultValue:
                    'Change input',
                },
              )}
            </span>
          </button>
          <span
            id={
              lockedReason
            }
            className="sr-only"
          >
            {locked
              ? t(
                  'sprint-input-locked',
                  {
                    defaultValue:
                      'The input stays the same until this run ends.',
                  },
                )
              : ''}
          </span>
        </div>
      }
    >
      {
        body
      }
      <InputSetup
        open={
          setupOpen
        }
        onOpenChange={
          setSetupOpen
        }
        returnFocus={
          setupButton
        }
      />
    </Shell>
  );
}

/** Today's challenge: what it is, and the button. One box of a fixed height in every state. */
function DailyIntro({
  loading,
  failed,
  mic,
  onPlay,
}: {
  loading: boolean;
  failed: boolean;
  mic: boolean;
  onPlay: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  return (
    <section className="rmm-sheet flex min-h-56 flex-col items-start justify-center gap-3 p-5">
      <p className="text-base leading-6 text-app-text">
        {t(
          'sprint-daily-about',
          {
            defaultValue:
              'Six levels, five prompts each, the same for everyone today. Your first finished run is your score; later runs today are practice.',
          },
        )}
      </p>
      <p className="min-h-5 text-sm leading-5 text-app-text-muted">
        {mic
          ? t(
              'sprint-daily-mic',
              {
                defaultValue:
                  'With the microphone the chord levels are skipped, and the score counts the rest.',
              },
            )
          : ''}
      </p>
      <button
        type="button"
        disabled={
          loading
        }
        onClick={
          onPlay
        }
        className={
          SECONDARY_BUTTON
        }
      >
        {t(
          'sprint-daily-start',
          {
            defaultValue:
              "Play today's challenge",
          },
        )}
      </button>
      <p
        role="status"
        className="min-h-5 text-sm leading-5 text-app-danger"
      >
        {failed
          ? t(
              'sprint-daily-check-failed',
              {
                defaultValue:
                  "Couldn't check today's challenge. Try again.",
              },
            )
          : ''}
      </p>
    </section>
  );
}

/** A fresh seed for a freeplay run (freeplay runs differ; only the daily run is fixed). */
function seed(): number {
  return Math.floor(
    Math.random() *
      0x7fffffff,
  );
}
