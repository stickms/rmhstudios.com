/**
 * EarLesson — ear training (`ear-interval`: two notes one after the other, named as an interval;
 * `ear-chord`: three notes together, named as a chord quality): ten questions, each a sound the
 * learner hears and names with a button. It needs no input device: the answer buttons are plain
 * words, and a lesson with no microphone, MIDI or keys works the same.
 *
 * The ask → feedback → next → saving → saved / failed / signed-out lifecycle is the pure machine
 * in `machines/ear.ts`. Its rule that matters here: a question can be answered only once its sound
 * has started (`played`), so an answer never counts for a question the learner could not hear.
 *
 * Sound:
 * - Every sound goes through `audio/voice.ts` and `audio/sequence.ts`; this file says what to play
 *   (the question's notes, in turn or together), never how it sounds. `sound` (a prop) is the
 *   `PlayOptions` the notes are voiced with (LessonScreen passes the lesson's sampled instrument).
 *   While its samples load the row says "Loading sound…" and nothing plays (at most
 *   `LOAD_WAIT_MS`, then the simple tone for the rest of the lesson), so a load delay is never
 *   counted as heard.
 * - A question counts as heard when its LAST note has started (`audio/ear-playback.ts`): an
 *   interval's second note sounds 750 ms after its first, so the answers stay off until then, and
 *   a sound that was cancelled (Next, a dialog, leaving) never opens them. The decisions (what a
 *   tap does, when a question plays by itself, which sentence the sound row shows) are pure and
 *   tested in `ear-playback.ts`; the row itself is `EarSoundRow.tsx`.
 * - A question sounds by itself when sound is ready (after Next, or on entry when the browser has
 *   already allowed sound). "Hear it again" plays it again as often as wanted; it changes no state
 *   and no score (the machine's `replay`).
 * - When sound is asleep (the browser suspends audio until a tap) the same place says "Sound isn't
 *   playing. Tap to turn it on." and the first tap wakes it (`wakeSound`, inside the tap) and
 *   then plays the question — but only if the learner is still on the question they asked about
 *   and the lesson is still open (`hearStillWanted`), so a late wake never plays an old question
 *   or sounds after the lesson is left. If sound cannot start, the line says so and a tap tries
 *   again; the answers stay off until the question has been heard. With no Web Audio at all the
 *   line says the browser can't play sound.
 *
 * Every box — the title line, the listening box, the sentence line, the answers — has the same
 * height as LessonScreen's EarSkeleton, so nothing moves from loading to the result (the sound row
 * is a minimum height, so a long translation that wraps grows its own box and never spills out).
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  autoPlay,
  createEarPlayback,
  hearAction,
  soundRowOf,
  type Waking,
} from '@/lib/rmhmusic/learn/audio/ear-playback';
import { hearStillWanted } from '@/lib/rmhmusic/learn/input/echo-window';
import { INTERVAL_GAP_MS, playChord, playSequence } from '@/lib/rmhmusic/learn/audio/sequence';
import { fitToRange } from '@/lib/rmhmusic/learn/audio/instruments/catalog';
import {
  onSoundChange,
  soundStatus,
  wakeSound,
  type PlayOptions,
  type SoundStatus,
} from '@/lib/rmhmusic/learn/audio/voice';
import { getLesson } from '@/lib/rmhmusic/learn/content/path';
import { buildEarSession, earReviews, msSinceHeard } from '@/lib/rmhmusic/learn/ear-review';
import { getPracticeMode } from '@/lib/rmhmusic/learn/practice-mode';
import {
  EAR_QUESTIONS,
  createEarMachine,
  earKind,
  earPool,
  type Answer,
  type Effect,
  type EarName,
  type Question,
  type State,
} from '@/lib/rmhmusic/learn/machines/ear';
import { starsFor, scoreFrom } from '@/lib/rmhmusic/learn/scoring/stars';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { CHORD_QUALITIES, type ChordQuality } from '@/lib/rmhmusic/learn/theory/chords';
import { INTERVAL_NAMES, type IntervalName } from '@/lib/rmhmusic/learn/theory/intervals';
import { cn } from '@/lib/utils';
import { EarSoundRow, soundProblem } from './EarSoundRow';
import { fallbackLine, useFallbackNotice } from './useSoundNotice';
import { LessonResult } from './LessonParts';
import { intervalName, qualityName } from './ear-names';
import { PracticeModeToggle, usePracticeMode } from './PracticeModeToggle';
import { SaidParts, SessionFrame, SessionSheet, sessionTitle, useQuestionSession } from './QuestionSession';

type Extra =
  | {
      type: 'replay';
    }
  | {
      type: 'played';
      index: number;
    };

export function EarLesson({
  lessonId,
  paused = false,
  sound: voice,
}: {
  lessonId: string;
  /** A dialog is open over the lesson: nothing answers, and what is playing stops. */
  paused?: boolean;
  /** How the notes are voiced: the lesson's sampled instrument (the synth when absent). */
  sound?: PlayOptions;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const lessonDef = getLesson(lessonId);
  const kind = earKind(lessonDef);
  const pool = earPool(lessonDef);
  const [questions] = useState(() => {
    // The learner's due and weak names first, when their cards have already loaded (the home
    // loads them); otherwise the plain, evenly spread deal.
    const { cards, cardsStatus } = useLearnStore.getState();
    return buildEarSession(kind, pool, cardsStatus === 'ready' ? cards : [], Date.now(), EAR_QUESTIONS, Math.random);
  });
  const mode = usePracticeMode();
  // When the sound of the current question started, and how long its first answer took.
  const heardAt = useRef<number | null>(null);
  const firstMs = useRef<Record<number, number | null>>({});
  // The lesson is rendered only once the store has loaded in the browser (never on the server), so
  // the audio state can be read at once: the sound row is right from its first paint.
  const [status, setStatus] = useState<SoundStatus>(soundStatus);
  const [waking, setWaking] = useState<Waking>('idle');
  const mounted = useRef(false);
  const waiting = useRef(false);
  const indexRef = useRef(-1);
  const sentFor = useRef<number | null>(null);
  const sendRef = useRef<(e: Extra) => void>(() => {});
  const voiceRef = useRef(voice);
  const listenFirstId = useId();
  // Carries a question's sound out and says when it has been heard in full.
  const [playback] = useState(() =>
    createEarPlayback({
      // Sounded an octave or two away when that keeps a violin or flute question on its own samples
      // (an interval or a chord quality is the same in any octave; nothing shows the notes).
      play: (playKind, asked, hooks) => {
        const notes = fitToRange(asked, voiceRef.current?.instrument);
        return playKind === 'chord'
          ? playChord(notes, {
              ...voiceRef.current,
              ...hooks,
            })
          : playSequence(notes, INTERVAL_GAP_MS, {
              ...voiceRef.current,
              ...hooks,
            });
      },
      onHeard: (index) =>
        sendRef.current({
          type: 'played',
          index,
        }),
    }),
  );

  const session = useQuestionSession<Question, Answer, State, Extra, Effect>({
    machine: () => createEarMachine(questions, () => getPracticeMode() === 'learning'),
    save: async (fx, answered) => {
      const outcome = await useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score);
      // The reviews follow the lesson's own save and never change its outcome: a failed
      // post just leaves the schedule as it was.
      if (outcome === 'saved') {
        try {
          const reviews = earReviews(questions, answered, firstMs.current);
          if (reviews.length > 0)
            void useLearnStore
              .getState()
              .saveReviews(reviews)
              .catch(() => {});
        } catch {
          // Best effort.
        }
      }
      return outcome;
    },
    paused,
    focusFirst: 'button',
    onEffect: (fx) => {
      if (fx.type !== 'play') return;
      // `played` follows from the playback once the last note has started, not before.
      if (!playback.start(fx.index, fx.kind, fx.notes)) refresh();
    },
  });
  const { lesson, total, answerGroup } = session;
  // The clock starts when the sound has been heard (the machine's `played`), once per question: a
  // retry of the same question (Learning mode) and replays do not restart it.
  const heardNow = lesson.kind === 'asking' && lesson.heard;
  const retried = lesson.kind === 'asking' && (lesson.misses ?? 0) > 0;
  const unheard = lesson.kind === 'asking' && !lesson.heard;
  useEffect(() => {
    if (heardNow && !retried) heardAt.current = performance.now();
    else if (unheard) heardAt.current = null;
  }, [heardNow, retried, unheard]);
  const answer = (a: Answer) => {
    if (
      !paused &&
      lesson.kind === 'asking' &&
      lesson.heard &&
      (lesson.misses ?? 0) === 0 &&
      firstMs.current[lesson.index] === undefined
    )
      firstMs.current[lesson.index] = msSinceHeard(heardAt.current, performance.now());
    session.answer(a);
  };
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const index = inSession ? lesson.index : -1;
  useEffect(() => {
    sendRef.current = session.send;
    voiceRef.current = voice;
  });

  function refresh() {
    const s = soundStatus();
    setStatus(s);
    if (s === 'ready') setWaking('idle');
  }

  useEffect(() => {
    mounted.current = true;
    refresh();
    const off = onSoundChange(refresh);
    return () => {
      mounted.current = false;
      off();
      playback.cancel();
    };
  }, [playback]);

  // A dialog opened over the lesson: what is playing stops, and never opens the answers.
  useEffect(() => {
    if (paused) playback.cancel();
  }, [paused, playback]);

  // A new question (or the end): the last one's sound stops.
  useEffect(() => {
    indexRef.current = index;
    playback.cancel();
  }, [index, playback]);
  // A new question sounds by itself when sound is ready, once. It starts from a timer so that
  // React's StrictMode (mount, cleanup, mount) starts it once and not once-then-cancelled: the
  // cleanup clears the timer before it fires, and `sentFor` is noted only when it does. Otherwise
  // the row asks for a tap.
  const askingUnheard = lesson.kind === 'asking' && !lesson.heard;
  useEffect(() => {
    const next = autoPlay({
      askingUnheard,
      paused,
      shown: status,
      live: soundStatus(),
      index,
      sentFor: sentFor.current,
    });
    if (!next.play) {
      sentFor.current = next.sentFor;
      return;
    }
    const timer = setTimeout(() => {
      sentFor.current = next.sentFor;
      sendRef.current({
        type: 'replay',
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [askingUnheard, index, paused, status]);

  // Hear it again, or turn sound on. One tap waits at a time, and a sound that waited plays only
  // for the question it was asked on.
  const hear = () => {
    const action = hearAction({
      status: soundStatus(),
      waiting: waiting.current,
      paused,
    });
    switch (action) {
      case 'stop':
        playback.cancel();
        return;
      case 'ignore':
      case 'wait':
        return;
      case 'none':
        setStatus('none');
        return;
      case 'replay':
        setStatus('ready');
        session.send({
          type: 'replay',
        });
        return;
      case 'wake': {
        const askedIndex = indexRef.current;
        waiting.current = true;
        setWaking('waking');
        void wakeSound().then((ok) => {
          waiting.current = false;
          if (!mounted.current) return;
          setWaking(ok ? 'idle' : 'failed');
          refresh();
          if (
            ok &&
            hearStillWanted({
              askedIndex,
              currentIndex: indexRef.current,
              mounted: true,
            })
          ) {
            sendRef.current({
              type: 'replay',
            });
          }
        });
      }
    }
  };

  const sound = soundRowOf(status, waking);
  const fellBack = useFallbackNotice(inSession ? `${lesson.kind}-${lesson.index}` : lesson.kind);

  const title = sessionTitle(
    session,
    inSession
      ? t('ear-count', {
          n: lesson.index + 1,
          total,
          defaultValue: 'Question {{n}} of {{total}}',
        })
      : '',
    t('lesson-complete', {
      defaultValue: 'Lesson complete',
    }),
    t('lesson-not-saved', {
      defaultValue: 'Not saved yet',
    }),
  );

  const nameOf = (name: EarName) =>
    kind === 'chord' ? qualityName(t, name as ChordQuality) : intervalName(t, name as IntervalName);

  // The sentence line: the instruction while asking; after a wrong answer what was answered against
  // what it was; the score.
  let line: ReactNode = '';
  let fallbackText = '';
  let lineKey = 'hint';
  let wrong = false;
  // The sentences of a wrong answer, one string each (the live region reads them as they are).
  let missParts: string[] = [];
  if (lesson.kind === 'asking' && fellBack) {
    // Said once, on the question where the lesson fell back to the simple tone.
    lineKey = 'fallback';
    fallbackText = fallbackLine(t, fellBack);
    line = fallbackText;
  } else if (lesson.kind === 'asking') {
    line =
      kind === 'chord'
        ? t('ear-hint-chord', {
            defaultValue: 'Listen, then pick the chord.',
          })
        : t('ear-hint-interval', {
            defaultValue: 'Listen, then pick the interval.',
          });
  } else if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}-${lesson.misses ?? 0}`;
    if (!lesson.right) {
      wrong = true;
      const rightName = lesson.cards[lesson.index].answer;
      const givenAnswer = lesson.answer.name;
      missParts = [
        kind === 'chord'
          ? t('ear-you-answered-chord', {
              given: nameOf(givenAnswer),
              name: nameOf(rightName),
              defaultValue: 'You answered the {{given}} chord, not the {{name}} chord.',
            })
          : t('ear-you-answered-interval', {
              given: nameOf(givenAnswer),
              name: nameOf(rightName),
              defaultValue: 'You answered the {{given}}, not the {{name}}.',
            }),
      ];
      // How far apart, said only where it is plain: intervals are ordered by width, chord
      // qualities are not a scale.
      if (kind === 'interval') {
        const order = INTERVAL_NAMES as readonly string[];
        const wider = order.indexOf(givenAnswer) > order.indexOf(rightName);
        missParts.push(
          wider
            ? t('ear-miss-wider', {
                defaultValue: 'Your answer is the wider interval.',
              })
            : t('ear-miss-narrower', {
                defaultValue: 'Your answer is the narrower interval.',
              }),
        );
      }
      line = (
        <>
          {missParts.map((part, i) => (
            <span key={i} className="block">
              {part}
            </span>
          ))}
        </>
      );
    }
  } else {
    lineKey = 'score';
    line = t('ear-score', {
      correct: lesson.correct,
      total,
      defaultValue: 'You named {{correct}} of {{total}}.',
    });
  }

  const problem = soundProblem(t, sound);
  const said: ReactNode =
    lesson.kind === 'feedback' ? (
      lesson.right ? (
        t('ear-right-sr', {
          name: nameOf(lesson.cards[lesson.index].answer),
          defaultValue: 'Right: {{name}}.',
        })
      ) : (
        <SaidParts parts={missParts} />
      )
    ) : lesson.kind === 'asking' ? (
      [session.announce ? title : '', problem, fallbackText].filter(Boolean).join('. ')
    ) : inSession ? (
      ''
    ) : typeof line === 'string' ? (
      line
    ) : (
      ''
    );

  const correctName = lesson.kind === 'feedback' ? lesson.cards[lesson.index].answer : null;
  const givenName = lesson.kind === 'feedback' && wrong ? lesson.answer.name : null;

  // The answer buttons: the lesson's names, narrowest or plainest first.
  const choices: readonly EarName[] = (kind === 'chord' ? CHORD_QUALITIES : INTERVAL_NAMES).filter((name) =>
    pool.includes(name),
  );

  let answers: ReactNode;
  if (!inSession) {
    const stars = lesson.kind === 'saved' ? lesson.stars : starsFor(scoreFrom(lesson.correct, total));
    answers = (
      <LessonResult
        kind={lesson.kind}
        stars={stars}
        returnTo={`/rmhmusic/lesson/${lessonId}`}
        onRetry={session.retry}
      />
    );
  } else {
    const open = lesson.kind === 'asking' && lesson.heard;
    answers = (
      <div
        ref={answerGroup}
        role="group"
        aria-label={
          kind === 'chord'
            ? t('ear-choices-chord', {
                defaultValue: 'Chords',
              })
            : t('ear-choices-interval', {
                defaultValue: 'Intervals',
              })
        }
        className="rmm-ear__choices"
      >
        {/* Why the answers are not open yet, read after each one's name until the sound has played. */}
        <span id={listenFirstId} className="sr-only">
          {t('ear-listen-first', {
            defaultValue: 'Listen first.',
          })}
        </span>
        {choices.map((name) => {
          const isCorrect = name === correctName;
          const isGiven = name === givenName;
          return (
            <button
              key={name}
              type="button"
              aria-disabled={!open || undefined}
              aria-describedby={lesson.kind === 'asking' && !open ? listenFirstId : undefined}
              onClick={() =>
                answer({
                  name,
                })
              }
              className={cn(
                'rmm-display flex h-9 w-full items-center justify-center rounded-app-sm border text-[1.375rem] leading-none transition-colors',
                // Waiting and finished answers read by ink and edge, never by opacity or the dim
                // ink (2.8:1): the muted ink holds 4.5:1 on the tile in every theme.
                lesson.kind === 'asking'
                  ? open
                    ? 'border-app-border-bright text-app-text'
                    : 'border-app-border text-app-text-muted'
                  : isCorrect
                    ? 'border-app-accent text-app-accent'
                    : isGiven
                      ? 'rmm-flash__struck border-app-border text-app-text-muted'
                      : 'border-app-border text-app-text-muted',
              )}
            >
              {nameOf(name)}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <SessionFrame className="rmm-ear space-y-4">
      <PracticeModeToggle />
      <SessionSheet
        session={session}
        title={title}
        question={
          <EarListenBox>
            <EarSoundRow sound={sound} inSession={inSession} onHear={hear} />
          </EarListenBox>
        }
        line={line}
        lineKey={lineKey}
        said={said}
        retry={wrong && mode === 'learning'}
      />
      <div ref={session.answersBox} className="rmm-ear__answers">
        {answers}
      </div>
    </SessionFrame>
  );
}

/**
 * The listening box: a ruled staff with nothing on it, then one row for "Hear it again" (or the
 * sound problem). The row is at least 3.5rem and the same in the placeholder; a sentence that
 * wraps in a longer language grows the row rather than spilling out of it.
 */
export function EarListenBox({ children, skeleton = false }: { children?: ReactNode; skeleton?: boolean }) {
  return (
    <div className="pt-1">
      <div aria-hidden="true" className="rmm-unit__staff mx-auto max-w-64" />
      <div className="flex min-h-14 items-center justify-center">
        {skeleton ? <div className="app-skeleton h-5 w-40" /> : children}
      </div>
    </div>
  );
}
