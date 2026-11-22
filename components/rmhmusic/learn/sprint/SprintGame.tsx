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
 * Results go through a `SprintSaver` (`lib/rmhmusic/learn/sprint/saver.ts`, the API one by
 * default): each picker row says the level's best in a plain sentence (a third line kept in the
 * placeholder too), and the Daily challenge says where today stands and the run of days played.
 * A scored daily run is recorded when Start is pressed, so leaving it does not deal it again.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import { useArrival } from '@/components/ui/arrive';
import { mulberry32 } from '@/lib/core/rng';
import { resolveVoiceRange, staffCardRange } from '@/lib/rmhmusic/learn/voice/range';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import type { Instrument } from '@/lib/rmhmusic/learn/schemas';
import { dailyRun, utcDate, type SprintPrompt } from '@/lib/rmhmusic/learn/sprint/generate';
import { FREEPLAY_PROMPTS, SPRINT_LEVELS, micAllowed, type SprintLevelId } from '@/lib/rmhmusic/learn/sprint/levels';
import { dealRun } from '@/lib/rmhmusic/learn/sprint/deal';
import { createApiSaver, type SprintOverview, type SprintSaver } from '@/lib/rmhmusic/learn/sprint/saver';
import { PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_BUTTON } from '../buttons';
import type { DailyBoardMe } from '@/lib/rmhmusic/social/social.contract';
import { dailyPayload, type SharePayload } from '@/lib/rmhmusic/learn/social/share';
import { DailyBoardLine } from '../social/DailyBoardLine';
import { InputSetup } from '../InputSetup';
import { PracticeModeToggle, usePracticeMode } from '../PracticeModeToggle';
import { Shell } from '../LessonScreen';
import { useInputRelease } from '../useLearnInput';
import { useLearnerShape } from '../useLearnerShape';
import { SprintRun } from './SprintRun';
import { bestSentence, dailyStateSentence, levelHint, levelName } from './sprint-text';

type Mode = 'freeplay' | 'daily';

const RETURN_TO = '/rmhmusic/sprint';

/**
 * One row of the picker, and of its placeholder: three text lines (24px + 20px + 20px: the name,
 * the hint, the best) in an 80px row, so the placeholder is exactly as tall as the loaded list.
 */
const ROW = 'flex min-h-20 w-full flex-col items-start justify-center px-4 py-2 text-start';

/**
 * A placeholder bar the shape of the text it stands for: the level's own name and hint, unseen
 * under the bar, so a hint that wraps at this width wraps in the placeholder too and loading
 * moves nothing.
 */
const SKELETON_TEXT = 'app-skeleton box-decoration-clone text-transparent';

/** What is being played: a freeplay level or today's challenge, with its prompts. */
type Playing =
  | {
      mode: 'freeplay';
      level: SprintLevelId;
      prompts: SprintPrompt[];
      /** Learning mode: a wrong prompt comes back until right; the run keeps no best. */
      learning: boolean;
    }
  | {
      mode: 'daily';
      date: string;
      prompts: SprintPrompt[];
      scored: boolean;
    };

export function SprintGame({
  saver: givenSaver,
}: {
  saver?: SprintSaver;
} = {}) {
  const { t, i18n } = useTranslation('c-rmhmusic');
  const [saver] = useState(() => givenSaver ?? createApiSaver());
  const status = useLearnStore((s) => s.status);
  const error = useLearnStore((s) => s.error);
  const profile = useLearnStore((s) => s.profile);
  const [mode, setMode] = useState<Mode>('freeplay');
  // Learning or Test, for freeplay only: the daily challenge is always Test.
  const practiceMode = usePracticeMode();
  // What the learner is due on and weak at: freeplay deals toward it (`sprint/deal.ts`).
  const cards = useLearnStore((s) => s.cards);
  const [playing, setPlaying] = useState<Playing | null>(null);
  /** The scored Daily run's board line, from its save's answer (no second request). */
  const [dailyBoard, setDailyBoard] = useState<{
    date: string;
    me: DailyBoardMe;
    /** The saved run's lines, for the Share dialog's preview (the link shows the server's copy). */
    preview: SharePayload | null;
  } | null>(null);
  const [locked, setLocked] = useState(false);
  const [dailyFailed, setDailyFailed] = useState(false);
  /** Bests and today's challenge; null until read (or when it could not be). */
  const [overview, setOverview] = useState<SprintOverview | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const setupButton = useRef<HTMLButtonElement>(null);
  const firstRow = useRef<HTMLButtonElement>(null);
  const backToPicker = useRef(false);
  const lockedReason = useId();
  useInputRelease();

  useEffect(() => {
    void useLearnStore.getState().load();
    void useLearnStore.getState().loadCards();
  }, []);

  // Back from a run: focus goes to the first level, where the learner chooses again.
  useEffect(() => {
    if (playing === null && backToPicker.current) {
      backToPicker.current = false;
      firstRow.current?.focus();
    }
  }, [playing]);

  const ready = status === 'ready' && !!profile;

  // The bests and today's challenge, read when the picker shows (again after every run). A failed
  // read leaves the best lines empty; playing the daily checks again on its own.
  useEffect(() => {
    if (!ready || playing) return;
    let live = true;
    saver
      .overview(utcDate(Date.now()))
      .then((o) => {
        if (live) setOverview(o);
      })
      .catch(() => {
        if (live) setOverview(null);
      });
    return () => {
      live = false;
    };
  }, [ready, playing, saver]);

  const shape = useLearnerShape();
  const loading = !ready && status !== 'error';
  const arrival = useArrival(!loading);
  // Before the profile loads, the layout route's read of it: the placeholder lists the same levels
  // (a singer's single-note ones) as the loaded picker.
  const instrument: Instrument = profile?.instrument ?? shape.instrument;
  const singer = instrument === 'voice';
  const range = resolveVoiceRange(profile?.voiceRange);
  const guitar = instrument === 'guitar';
  const mic = profile?.input === 'mic';

  const freeplayPrompts = (level: SprintLevelId) =>
    dealRun(level, FREEPLAY_PROMPTS, mulberry32(seed()), instrument, range, cards, Date.now());
  const playDaily = async () => {
    // The day is decided once, here, when the run is dealt (`utcDate`); a run started before
    // midnight UTC stays that day's run, and that dealt date is what is saved.
    const date = utcDate(Date.now());
    let done: boolean;
    try {
      done = await saver.dailyDone(date);
    } catch {
      setDailyFailed(true);
      return;
    }
    setDailyFailed(false);
    setPlaying({
      mode: 'daily',
      date,
      prompts: dailyRun(date, instrument, range),
      scored: !done,
    });
  };

  let body: ReactNode;
  if (status === 'error') {
    body = (
      <div role="alert" className={`rmm-sheet space-y-3 p-4 ${arrival}`}>
        <p className="text-app-text">
          {error === 'unauthorized'
            ? t('error-signed-out', {
                defaultValue: 'Your session ended. Sign in again to continue.',
              })
            : t('sprint-load-failed', {
                defaultValue: "Couldn't load your settings.",
              })}
        </p>
        {error === 'unauthorized' ? (
          <Link
            to="/login"
            search={{
              callbackURL: RETURN_TO,
            }}
            className={PRIMARY_BUTTON}
          >
            {t('sign-in', {
              defaultValue: 'Sign in',
            })}
          </Link>
        ) : (
          <button type="button" onClick={() => void useLearnStore.getState().load()} className={PRIMARY_BUTTON}>
            {t('retry', {
              defaultValue: 'Try again',
            })}
          </button>
        )}
      </div>
    );
  } else if (playing && profile) {
    body = (
      <SprintRun
        key={`${playing.mode}-${playing.mode === 'freeplay' ? `${playing.level}-${playing.learning ? 'learning' : 'test'}` : playing.date}`}
        prompts={playing.prompts}
        mode={playing.mode}
        // A Learning run is never scored (its retries make it incomparable), so it keeps no best.
        scored={playing.mode === 'daily' ? playing.scored : !playing.learning}
        learning={playing.mode === 'freeplay' && playing.learning}
        review={
          playing.mode === 'freeplay'
            ? (reviews) => {
                void useLearnStore
                  .getState()
                  .saveReviews(reviews)
                  .catch(() => undefined);
              }
            : undefined
        }
        onStart={playing.mode === 'daily' && playing.scored ? () => void saver.startDaily(playing.date) : undefined}
        instrument={instrument}
        lowCard={singer && staffCardRange(range) === 'low'}
        input={profile.input}
        paused={setupOpen}
        onLockChange={setLocked}
        onDone={() => {
          backToPicker.current = true;
          setLocked(false);
          setPlaying(null);
        }}
        nextPrompts={() =>
          playing.mode === 'freeplay' ? freeplayPrompts(playing.level) : dailyRun(playing.date, instrument, range)
        }
        saved={
          playing.mode === 'daily' && playing.scored && dailyBoard?.date === playing.date ? (
            <DailyBoardLine
              date={playing.date}
              today={utcDate(Date.now())}
              initial={dailyBoard.me}
              preview={dailyBoard.preview}
            />
          ) : undefined
        }
        save={(summary, results) =>
          playing.mode === 'freeplay'
            ? saver.saveFreeplay({
                level: playing.level,
                summary,
                results,
              })
            : saver.saveDaily({
                date: playing.date,
                summary,
                results,
                onBoard: (me) =>
                  setDailyBoard({
                    date: playing.date,
                    me,
                    preview: dailyPayload({
                      date: playing.date,
                      score: summary.score,
                      avgMs: summary.avgMs,
                      played: summary.played,
                      skipped: summary.skipped,
                      results,
                    }),
                  }),
              })
        }
      />
    );
  } else {
    body = (
      <div className={loading ? 'space-y-4' : `space-y-4 ${arrival}`}>
        <Tabs
          tabs={[
            {
              id: 'freeplay',
              label: t('sprint-freeplay', {
                defaultValue: 'Freeplay',
              }),
            },
            {
              id: 'daily',
              label: t('sprint-daily', {
                defaultValue: 'Daily challenge',
              }),
            },
          ]}
          value={mode}
          onChange={(id) => setMode(id === 'daily' ? 'daily' : 'freeplay')}
          aria-label={t('sprint-mode', {
            defaultValue: 'How to play',
          })}
        />
        {mode === 'freeplay' ? (
          <div className="space-y-4">
            <div>
              <PracticeModeToggle />
              <p className="text-sm leading-5 text-app-text-muted">
                {practiceMode === 'learning'
                  ? t('sprint-learning-says', {
                      defaultValue:
                        'In Learning mode a wrong prompt comes back until you get it right. Your first tries are scored, but no best is kept.',
                    })
                  : t('sprint-test-says', {
                      defaultValue: 'In Test mode a wrong prompt ends there and your best is kept.',
                    })}
              </p>
            </div>
            <ul className="rmm-sheet divide-y divide-app-border" aria-busy={loading || undefined}>
              {SPRINT_LEVELS.filter(
                // A singer is offered the single-note levels only.
                (level) => !singer || micAllowed(level.kind),
              ).map((level, i) => (
                <li key={level.id}>
                  {loading ? (
                    <div aria-hidden="true" className={ROW}>
                      <span className="text-base leading-6">
                        <span className={SKELETON_TEXT}>{levelName(t, level.id)}</span>
                      </span>
                      <span className="text-sm leading-5">
                        <span className={SKELETON_TEXT}>{levelHint(t, level.id, guitar)}</span>
                      </span>
                      <span className="flex h-5 items-center">
                        <span className="app-skeleton h-3.5 w-32 max-w-full" />
                      </span>
                    </div>
                  ) : mic && !micAllowed(level.kind) ? (
                    <div className={ROW}>
                      <span className="text-base leading-6 text-app-text-muted">{levelName(t, level.id)}</span>
                      <span className="text-sm leading-5 text-app-text-muted">
                        {t('sprint-level-mic', {
                          defaultValue: 'Not with the microphone: it hears one note at a time.',
                        })}
                      </span>
                      <span className="min-h-5 text-sm leading-5 text-app-text-muted">
                        {bestSentence(t, i18n.language, overview, level.id)}
                      </span>
                    </div>
                  ) : (
                    <button
                      ref={i === 0 ? firstRow : undefined}
                      type="button"
                      onClick={() =>
                        setPlaying({
                          mode: 'freeplay',
                          level: level.id,
                          prompts: freeplayPrompts(level.id),
                          learning: practiceMode === 'learning',
                        })
                      }
                      className={`${ROW} rounded-app-sm transition-colors hover:bg-app-surface-hover`}
                    >
                      <span className="text-base leading-6 text-app-text">{levelName(t, level.id)}</span>
                      <span className="text-sm leading-5 text-app-text-muted">{levelHint(t, level.id, guitar)}</span>
                      <span className="min-h-5 text-sm leading-5 text-app-text-muted">
                        {bestSentence(t, i18n.language, overview, level.id)}
                      </span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm leading-5 text-app-text-muted">
              {t('sprint-daily-test', {
                defaultValue:
                  'The Daily challenge is always Test mode: one try at each prompt, whatever you chose for Freeplay.',
              })}
            </p>
            <DailyIntro
              loading={loading}
              failed={dailyFailed}
              mic={mic || singer}
              standing={overview ? dailyStateSentence(t, overview) : ''}
              onPlay={() => void playDaily()}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <Shell
      title={t('sprint-title', {
        defaultValue: 'Sight reading',
      })}
      busy={loading}
      action={
        <div className="flex flex-col items-end">
          <button
            ref={setupButton}
            type="button"
            disabled={locked || loading}
            aria-describedby={locked ? lockedReason : undefined}
            onClick={() => setSetupOpen(true)}
            aria-label={t('change-input', {
              defaultValue: 'Change input',
            })}
            className={`${SECONDARY_BUTTON} min-w-11 max-[399px]:px-0`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span aria-hidden="true" className="max-[399px]:hidden">
              {t('change-input', {
                defaultValue: 'Change input',
              })}
            </span>
          </button>
          <span id={lockedReason} className="sr-only">
            {locked
              ? t('sprint-input-locked', {
                  defaultValue: 'The input stays the same until this run ends.',
                })
              : ''}
          </span>
        </div>
      }
    >
      {body}
      <InputSetup open={setupOpen} onOpenChange={setSetupOpen} returnFocus={setupButton} />
    </Shell>
  );
}

/** Today's challenge: what it is, and the button. One box of a fixed height in every state. */
function DailyIntro({
  loading,
  failed,
  mic,
  standing,
  onPlay,
}: {
  loading: boolean;
  failed: boolean;
  mic: boolean;
  /** Where today's challenge stands and the run of days played, one plain sentence (or ''). */
  standing: string;
  onPlay: () => void;
}) {
  const { t } = useTranslation('c-rmhmusic');
  return (
    <section className="rmm-sheet flex min-h-64 flex-col items-start justify-center gap-3 p-5">
      <p className="text-base leading-6 text-app-text">
        {t('sprint-daily-about-start', {
          defaultValue:
            'Six levels, five prompts each, the same for everyone today. Your first run is your score from the moment you press Start; later runs today are practice.',
        })}
      </p>
      <p className="min-h-5 text-sm leading-5 text-app-text-muted">
        {mic
          ? t('sprint-daily-mic', {
              defaultValue: 'With the microphone the chord levels are skipped, and the score counts the rest.',
            })
          : ''}
      </p>
      <p className="min-h-5 text-sm leading-5 text-app-text-muted">{standing}</p>
      <button type="button" disabled={loading} onClick={onPlay} className={SECONDARY_BUTTON}>
        {t('sprint-daily-start', {
          defaultValue: "Play today's challenge",
        })}
      </button>
      <Link to="/rmhmusic/daily" className={TEXT_BUTTON}>
        {t('board-link-today', {
          defaultValue: "Today's board",
        })}
      </Link>
      <p role="status" className="min-h-5 text-sm leading-5 text-app-danger">
        {failed
          ? t('sprint-daily-check-failed', {
              defaultValue: "Couldn't check today's challenge. Try again.",
            })
          : ''}
      </p>
    </section>
  );
}

/** A fresh seed for a freeplay run (freeplay runs differ; only the daily run is fixed). */
function seed(): number {
  return Math.floor(Math.random() * 0x7fffffff);
}
