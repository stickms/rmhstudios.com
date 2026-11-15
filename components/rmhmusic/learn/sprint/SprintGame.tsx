/**
 * SprintGame — `/rmhmusic/sprint`, the sight reading game. Notes appear on the staff and the
 * learner plays them as fast as they can. Two ways to play, switched with the sanctioned `<Tabs>`:
 * **Freeplay** (pick a level from plain text rows; a 20-prompt run) and the **Daily challenge** (the
 * same 30 prompts for everyone on a UTC day; the first finished run is the scored one, later runs
 * that day are practice). A game beside the path: it completes no lesson and gates nothing.
 *
 * The page is the lessons' `Shell` (back link, title, Change input). The picker and the run keep
 * fixed boxes, and the loading placeholder draws the picker's rows, so loading moves nothing.
 * Results are saved through a `SprintSaver` (`lib/rmhmusic/learn/sprint/saver.ts`); until results
 * are stored the result says plainly that it was not saved.
 */

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { mulberry32 } from '@/lib/core/rng';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import {
  dailyRun,
  makeRun,
  utcDate,
  type SprintPrompt,
} from '@/lib/rmhmusic/learn/sprint/generate';
import {
  FREEPLAY_PROMPTS,
  SPRINT_LEVELS,
  type SprintLevelId,
} from '@/lib/rmhmusic/learn/sprint/levels';
import {
  createMemorySaver,
  type SprintSaver,
} from '@/lib/rmhmusic/learn/sprint/saver';
import { SECONDARY_BUTTON } from '../buttons';
import { InputSetup } from '../InputSetup';
import { Shell } from '../LessonScreen';
import { useInputRelease } from '../useLearnInput';
import { SprintRun } from './SprintRun';

type Mode =
  | 'freeplay'
  | 'daily';

/** Rows of the picker (and of its placeholder): a 44px-tall text row each. */
const ROW =
  'flex min-h-11 w-full items-center gap-3 px-4 py-2 text-start';

export function levelName(
  t: TFunction<'c-rmhmusic'>,
  id: SprintLevelId,
): string {
  switch (
    id
  ) {
    case 'note':
      return t(
        'sprint-level-note',
        {
          defaultValue:
            'One note',
        },
      );
    case 'note-both':
      return t(
        'sprint-level-note-both',
        {
          defaultValue:
            'Notes on both staves',
        },
      );
    case 'accidental':
      return t(
        'sprint-level-accidental',
        {
          defaultValue:
            'Sharps and flats',
        },
      );
    case 'triad':
      return t(
        'sprint-level-triad',
        {
          defaultValue:
            'Triads',
        },
      );
    case 'inversion':
      return t(
        'sprint-level-inversion',
        {
          defaultValue:
            'Inverted triads',
        },
      );
    case 'bar':
      return t(
        'sprint-level-bar',
        {
          defaultValue:
            'Four notes in a row',
        },
      );
  }
}

function levelHint(
  t: TFunction<'c-rmhmusic'>,
  id: SprintLevelId,
): string {
  switch (
    id
  ) {
    case 'note':
      return t(
        'sprint-level-note-hint',
        {
          defaultValue:
            'Naturals on the treble staff',
        },
      );
    case 'note-both':
      return t(
        'sprint-level-note-both-hint',
        {
          defaultValue:
            'Naturals on the treble and bass staves',
        },
      );
    case 'accidental':
      return t(
        'sprint-level-accidental-hint',
        {
          defaultValue:
            'A sharp or a flat before the note',
        },
      );
    case 'triad':
      return t(
        'sprint-level-triad-hint',
        {
          defaultValue:
            'Three notes together, root position',
        },
      );
    case 'inversion':
      return t(
        'sprint-level-inversion-hint',
        {
          defaultValue:
            'Three notes together, first or second inversion',
        },
      );
    case 'bar':
      return t(
        'sprint-level-bar-hint',
        {
          defaultValue:
            'Play them in order',
        },
      );
  }
}

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
  useInputRelease();

  useEffect(() => {
    void useLearnStore
      .getState()
      .load();
  }, []);

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

  const playLevel =
    (
      level: SprintLevelId,
    ) =>
      setPlaying(
        {
          mode: 'freeplay',
          level,
          prompts:
            makeRun(
              level,
              FREEPLAY_PROMPTS,
              mulberry32(
                seed(),
              ),
            ),
        },
      );
  const playDaily =
    async () => {
      // The day is decided once, here, when the run is dealt (`utcDate`); a run started before
      // midnight UTC stays that day's run.
      const date =
        utcDate(
          Date.now(),
        );
      const done =
        await saver.dailyDone(
          date,
        );
      setPlaying(
        {
          mode: 'daily',
          date,
          prompts:
            dailyRun(
              date,
            ),
          scored:
            !done,
        },
      );
    };

  let body: ReactNode;
  if (
    status ===
      'error' &&
    error ===
      'unauthorized'
  ) {
    body =
      (
        <p
          role="alert"
          className="rmm-sheet p-5 text-app-text"
        >
          {t(
            'error-signed-out',
            {
              defaultValue:
                'Your session ended. Sign in again to continue.',
            },
          )}
        </p>
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
            profile.instrument
          }
          input={
            profile.input
          }
          paused={
            setupOpen
          }
          onChangeInput={() =>
            setSetupOpen(
              true,
            )
          }
          onDone={() =>
            setPlaying(
              null,
            )
          }
          nextPrompts={() =>
            playing.mode ===
            'freeplay'
              ? makeRun(
                  playing.level,
                  FREEPLAY_PROMPTS,
                  mulberry32(
                    seed(),
                  ),
                )
              : dailyRun(
                  playing.date,
                )
          }
          save={(
            summary,
          ) =>
            playing.mode ===
            'freeplay'
              ? saver.saveFreeplay(
                  {
                    level:
                      playing.level,
                    summary,
                  },
                )
              : saver.saveDaily(
                  {
                    date: playing.date,
                    summary,
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
                ) => (
                  <li
                    key={
                      level.id
                    }
                  >
                    {loading ? (
                      <div
                        aria-hidden="true"
                        className={`${ROW} min-h-16 flex-col items-start justify-center`}
                      >
                        <span className="app-skeleton h-5 w-40 max-w-full" />
                        <span className="app-skeleton h-4 w-56 max-w-full" />
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          playLevel(
                            level.id,
                          )
                        }
                        className={`${ROW} min-h-16 flex-col items-start justify-center rounded-app-sm transition-colors hover:bg-app-surface-hover`}
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
              onPlay={() =>
                void playDaily()
              }
            />
          )}
        </div>
      );
  }

  const inRun =
    playing !==
    null;
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
        <div
          className={
            inRun
              ? undefined
              : 'invisible'
          }
          inert={
            !inRun ||
            undefined
          }
        >
          <button
            ref={
              setupButton
            }
            type="button"
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

/** Today's challenge: what it is, and Start. One box of a fixed height in both states. */
function DailyIntro({
  loading,
  onPlay,
}: {
  loading: boolean;
  onPlay: () => void;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  return (
    <section className="rmm-sheet flex min-h-48 flex-col items-start justify-center gap-3 p-5">
      <p className="text-base leading-6 text-app-text">
        {t(
          'sprint-daily-about',
          {
            defaultValue:
              'Six levels, five prompts each, the same for everyone today. Your first finished run is your score; later runs today are practice.',
          },
        )}
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
