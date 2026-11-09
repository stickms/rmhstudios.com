'use client';

/**
 * EarLesson — ear training (`ear-interval`): ten questions, each a sound the learner hears (two
 * notes one after the other) and names with a button. It needs no input device: the answer buttons
 * are plain interval words, and a lesson with no microphone, MIDI or keys works the same.
 *
 * The ask → feedback → next → saving → saved / failed / signed-out lifecycle is the pure machine
 * in `machines/ear.ts`. Its rule that matters here: a question can be answered only once its sound
 * has started (`played`), so an answer never counts for a question the learner could not hear.
 *
 * Sound:
 * - Every sound goes through `audio/voice.ts` and `audio/sequence.ts`; this file says what to play
 *   (the question's notes), never how it sounds.
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
 * Every box — the title line, the listening box, the sentence line, the answers — has a fixed
 * height, the same as LessonScreen's EarSkeleton, so nothing moves from loading to the result.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { hearStillWanted } from '@/lib/rmhmusic/learn/input/echo-window';
import { playSequence, type PlayingSequence } from '@/lib/rmhmusic/learn/audio/sequence';
import { onSoundChange, soundStatus, wakeSound } from '@/lib/rmhmusic/learn/audio/voice';
import {
  EAR_QUESTIONS,
  createEarMachine,
  dealQuestions,
  earPool,
  type Answer,
  type Effect,
  type Question,
  type State,
} from '@/lib/rmhmusic/learn/machines/ear';
import { starsFor, scoreFrom } from '@/lib/rmhmusic/learn/scoring/stars';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { INTERVAL_NAMES, type IntervalName } from '@/lib/rmhmusic/learn/theory/intervals';
import { cn } from '@/lib/utils';
import { TEXT_BUTTON } from './buttons';
import { LessonResult } from './LessonParts';
import { SessionFrame, SessionSheet, sessionTitle, useQuestionSession } from './QuestionSession';

/** Between the two notes of an interval (ms). */
const INTERVAL_GAP_MS = 750;

type Extra = { type: 'replay' } | { type: 'played'; index: number };

/** What the sound row shows: ready, asleep (tap to wake), waking, failed to wake, or no Web Audio. */
type Sound = 'ready' | 'asleep' | 'waking' | 'failed' | 'none';

export function EarLesson({
  lessonId,
  paused = false,
}: {
  lessonId: string;
  /** A dialog is open over the lesson: nothing answers. */
  paused?: boolean;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const pool = earPool(lessonId);
  const [questions] = useState(() => dealQuestions(pool, EAR_QUESTIONS, Math.random));
  // The lesson is rendered only once the store has loaded in the browser (never on the server), so
  // the audio state can be read at once: the sound row is right from its first paint.
  const [status, setStatus] = useState<Exclude<Sound, 'waking' | 'failed'>>(readStatus);
  const [waking, setWaking] = useState<'idle' | 'waking' | 'failed'>('idle');
  const mounted = useRef(false);
  const waiting = useRef(false);
  const indexRef = useRef(-1);
  const playing = useRef<PlayingSequence | null>(null);
  const sendRef = useRef<(e: Extra) => void>(() => {});

  const session = useQuestionSession<Question, Answer, State, Extra, Effect>({
    machine: () => createEarMachine(questions),
    save: (fx) => useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score),
    paused,
    focusFirst: 'button',
    onEffect: (fx) => {
      if (fx.type !== 'play') return;
      playing.current?.cancel();
      const seq = playSequence(fx.notes, INTERVAL_GAP_MS);
      playing.current = seq;
      if (seq.started) sendRef.current({ type: 'played', index: fx.index });
      else refresh();
    },
  });
  const { lesson, total, answer, answerGroup } = session;
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const index = inSession ? lesson.index : -1;
  useEffect(() => {
    sendRef.current = session.send;
  });

  function refresh() {
    const s = readStatus();
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
      playing.current?.cancel();
      playing.current = null;
    };
  }, []);

  // A new question (or the end): the last one's sound stops, and a new one sounds by itself when
  // sound is ready. Otherwise the row asks for a tap.
  useEffect(() => {
    indexRef.current = index;
    playing.current?.cancel();
    playing.current = null;
  }, [index]);
  const askingUnheard = lesson.kind === 'asking' && !lesson.heard;
  useEffect(() => {
    if (!askingUnheard || paused || status !== 'ready') return;
    if (soundStatus() === 'ready') sendRef.current({ type: 'replay' });
  }, [askingUnheard, index, paused, status]);

  // Hear it again, or turn sound on. One tap waits at a time, and a sound that waited plays only
  // for the question it was asked on.
  const hear = () => {
    if (waiting.current || paused) return;
    const now = soundStatus();
    if (now === 'none') {
      setStatus('none');
      return;
    }
    if (now === 'ready') {
      setStatus('ready');
      session.send({ type: 'replay' });
      return;
    }
    const askedIndex = indexRef.current;
    waiting.current = true;
    setWaking('waking');
    void wakeSound().then((ok) => {
      waiting.current = false;
      if (!mounted.current) return;
      setWaking(ok ? 'idle' : 'failed');
      refresh();
      if (ok && hearStillWanted({ askedIndex, currentIndex: indexRef.current, mounted: true })) {
        sendRef.current({ type: 'replay' });
      }
    });
  };

  const sound: Sound =
    status === 'ready'
      ? 'ready'
      : status === 'none'
        ? 'none'
        : waking === 'idle'
          ? 'asleep'
          : waking;

  const title = sessionTitle(
    session,
    inSession
      ? t('ear-count', { n: lesson.index + 1, total, defaultValue: 'Question {{n}} of {{total}}' })
      : '',
    t('lesson-complete', { defaultValue: 'Lesson complete' }),
    t('lesson-not-saved', { defaultValue: 'Not saved yet' }),
  );

  const nameOf = (name: IntervalName) => intervalName(t, name);

  // The sentence line: the instruction while asking; after a wrong answer what it was; the score.
  let line = '';
  let lineKey = 'hint';
  let wrong = false;
  if (lesson.kind === 'asking') {
    line = t('ear-hint-interval', { defaultValue: 'Listen, then pick the interval.' });
  } else if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}`;
    if (!lesson.right) {
      wrong = true;
      line = t('ear-that-was-interval', {
        name: nameOf(lesson.cards[lesson.index].answer),
        defaultValue: 'That was the {{name}}.',
      });
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
  const said =
    lesson.kind === 'feedback'
      ? lesson.right
        ? t('ear-right-sr', {
            name: nameOf(lesson.cards[lesson.index].answer),
            defaultValue: 'Right: {{name}}.',
          })
        : line
      : lesson.kind === 'asking'
        ? [session.announce ? title : '', problem].filter(Boolean).join('. ')
        : inSession
          ? ''
          : line;

  const correctName = lesson.kind === 'feedback' ? lesson.cards[lesson.index].answer : null;
  const givenName = lesson.kind === 'feedback' && wrong ? lesson.answer.name : null;

  let answers: ReactNode;
  if (!inSession) {
    const stars =
      lesson.kind === 'saved' ? lesson.stars : starsFor(scoreFrom(lesson.correct, total));
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
        aria-label={t('ear-choices-interval', { defaultValue: 'Intervals' })}
        className="rmm-ear__choices"
      >
        {INTERVAL_NAMES.filter((name) => pool.includes(name)).map((name) => {
          const isCorrect = name === correctName;
          const isGiven = name === givenName;
          return (
            <button
              key={name}
              type="button"
              aria-disabled={!open || undefined}
              onClick={() => answer({ name })}
              className={cn(
                'rmm-display flex h-11 w-full items-center justify-center rounded-(--app-radius-sm) border text-[1.375rem] leading-none transition-colors',
                lesson.kind === 'asking'
                  ? cn(
                      'border-(--app-border-bright) text-(--app-text)',
                      !open && 'text-(--app-text-dim)',
                    )
                  : isCorrect
                    ? 'border-(--app-accent) text-(--app-accent)'
                    : isGiven
                      ? 'rmm-flash__struck border-(--app-border) text-(--app-text-dim)'
                      : 'border-(--app-border) text-(--app-text-dim)',
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
      <SessionSheet
        session={session}
        title={title}
        question={
          <EarListenBox>
            {sound === 'none' ? (
              <p className="px-2 text-sm leading-5 text-(--app-text-muted)">{problem}</p>
            ) : (
              <button
                type="button"
                onClick={hear}
                aria-busy={sound === 'waking' || undefined}
                className={cn(
                  TEXT_BUTTON,
                  'w-full justify-center text-center leading-5',
                  !inSession && 'invisible',
                )}
                inert={!inSession || undefined}
              >
                {sound === 'ready'
                  ? t('ear-hear-again', { defaultValue: 'Hear it again' })
                  : problem}
              </button>
            )}
          </EarListenBox>
        }
        line={line}
        lineKey={lineKey}
        said={said}
      />
      <div ref={session.answersBox} className="rmm-ear__answers">
        {answers}
      </div>
    </SessionFrame>
  );
}

/**
 * The listening box: a ruled staff with nothing on it, then one row for "Hear it again" (or the
 * sound problem). Fixed heights, the same in the placeholder.
 */
export function EarListenBox({
  children,
  skeleton = false,
}: {
  children?: ReactNode;
  skeleton?: boolean;
}) {
  return (
    <div className="pt-1">
      <div aria-hidden="true" className="rmm-unit__staff mx-auto max-w-64" />
      <div className="flex h-14 items-center justify-center">
        {skeleton ? <div className="app-skeleton h-5 w-40" /> : children}
      </div>
    </div>
  );
}

function readStatus(): 'ready' | 'asleep' | 'none' {
  const s = soundStatus();
  return s === 'ready' ? 'ready' : s === 'none' ? 'none' : 'asleep';
}

type T = TFunction<'c-rmhmusic'>;

/** What the sound row says when it is not "Hear it again". */
function soundProblem(t: T, sound: Sound): string {
  switch (sound) {
    case 'asleep':
      return t('ear-sound-asleep', { defaultValue: "Sound isn't playing. Tap to turn it on." });
    case 'waking':
      return t('ear-sound-waking', { defaultValue: 'Turning sound on…' });
    case 'failed':
      return t('ear-sound-failed', {
        defaultValue: "Sound still isn't playing. Tap to try again.",
      });
    case 'none':
      return t('ear-sound-none', { defaultValue: "This browser can't play sound." });
    default:
      return '';
  }
}

/** An interval's word, one key each (never joined to other words). */
function intervalName(t: T, name: IntervalName): string {
  switch (name) {
    case 'unison':
      return t('ear-interval-unison', { defaultValue: 'unison' });
    case 'second':
      return t('ear-interval-second', { defaultValue: 'second' });
    case 'third':
      return t('ear-interval-third', { defaultValue: 'third' });
    case 'fourth':
      return t('ear-interval-fourth', { defaultValue: 'fourth' });
    case 'fifth':
      return t('ear-interval-fifth', { defaultValue: 'fifth' });
    case 'sixth':
      return t('ear-interval-sixth', { defaultValue: 'sixth' });
    case 'seventh':
      return t('ear-interval-seventh', { defaultValue: 'seventh' });
    case 'octave':
      return t('ear-interval-octave', { defaultValue: 'octave' });
  }
}
