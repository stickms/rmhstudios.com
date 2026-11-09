'use client';

/**
 * RhythmLesson — the rhythm unit's lessons, picked by lesson id (`machines/rhythm.ts`):
 *
 * - `rhythm-note-values`: four questions, each a note value shown (`NoteValues`) and answered with
 *   how many beats it lasts, on plain answer buttons. No input device and no sound needed.
 * - `rhythm-44-vs-34`: five questions, each a bar pattern the metronome plays (an accent on the
 *   first beat of each bar), answered "3 beats" or "4 beats". Like the ear lessons, a pattern must
 *   be heard before it can be answered, "Hear it again" replays it without a penalty, and with a
 *   sleeping or blocked audio context the same place says so and a tap wakes it (the decisions are
 *   the ear lessons' pure ones, `audio/ear-playback.ts`).
 * - `rhythm-tap-the-beat`: `TapBeatLesson`.
 *
 * Both question lessons run the session lifecycle (ask, feedback, next, saving, saved / failed
 * with Retry / signed out) through `useQuestionSession`, and every box has the height of
 * LessonScreen's RhythmSkeleton: the sheet (title line, an 8rem question box, the sentence line)
 * and the 12.5rem answers box.
 *
 * The metronome click is a neutral synth click: it does not depend on the instrument setting.
 */

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  autoPlay,
  hearAction,
  soundRowOf,
  type Waking,
} from '@/lib/rmhmusic/learn/audio/ear-playback';
import { createPatternPlayback } from '@/lib/rmhmusic/learn/audio/pattern-playback';
import {
  onSoundChange,
  soundStatus,
  wakeSound,
  type SoundStatus,
} from '@/lib/rmhmusic/learn/audio/voice';
import { hearStillWanted } from '@/lib/rmhmusic/learn/input/echo-window';
import {
  BEATS_OF,
  METER_QUESTIONS,
  NOTE_VALUES,
  createMeterMachine,
  createValueMachine,
  dealMeters,
  dealValues,
  rhythmActivity,
  type BeatsPerBar,
  type MeterAnswer,
  type MeterEffect,
  type MeterQuestion,
  type MeterState,
  type ValueAnswer,
  type ValueQuestion,
} from '@/lib/rmhmusic/learn/machines/rhythm';
import { scoreFrom, starsFor } from '@/lib/rmhmusic/learn/scoring/stars';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { getAudioContext } from '@/lib/shared/platform';
import { cn } from '@/lib/utils';
import { EarSoundRow, soundProblem } from './EarSoundRow';
import { LessonResult } from './LessonParts';
import { NoteValues, beatsLabel, valueName } from './NoteValues';
import {
  SaidParts,
  SessionFrame,
  SessionSheet,
  sessionTitle,
  useQuestionSession,
} from './QuestionSession';
import { TapBeatLesson } from './TapBeatLesson';

/** The metronome's tempo in the 4/4-versus-3/4 lesson (beats per minute). */
const METER_BPM = 100;

export function RhythmLesson({
  lessonId,
  paused = false,
}: {
  lessonId: string;
  /** A dialog is open over the lesson: nothing answers, and what is playing stops. */
  paused?: boolean;
}) {
  switch (rhythmActivity(lessonId)) {
    case 'values':
      return <NoteValuesLesson lessonId={lessonId} paused={paused} />;
    case 'meter':
      return <MeterLesson lessonId={lessonId} paused={paused} />;
    case 'tap':
      return <TapBeatLesson lessonId={lessonId} paused={paused} />;
    default:
      return null;
  }
}

/** The 12.5rem box under the sheet, and what fills it. */
function Answers({
  box,
  children,
}: {
  box: React.RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  return (
    <div ref={box} className="rmm-rhythm__answers">
      {children}
    </div>
  );
}

/** One answer button, in the ear lessons' look. */
function ChoiceButton({
  label,
  state,
  open = true,
  describedBy,
  onClick,
}: {
  label: string;
  /** While asking: how it reads; once answered: right, the learner's wrong pick, or neither. */
  state: 'asking' | 'right' | 'wrong' | 'other';
  open?: boolean;
  describedBy?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-disabled={!open || undefined}
      aria-describedby={describedBy}
      onClick={onClick}
      className={cn(
        'rmm-display flex h-11 w-full items-center justify-center rounded-(--app-radius-sm) border text-[1.375rem] leading-none transition-colors',
        // Waiting and finished answers read by ink and edge, never by opacity or the dim ink.
        state === 'asking'
          ? open
            ? 'border-(--app-border-bright) text-(--app-text)'
            : 'border-(--app-border) text-(--app-text-muted)'
          : state === 'right'
            ? 'border-(--app-accent) text-(--app-accent)'
            : state === 'wrong'
              ? 'rmm-flash__struck border-(--app-border) text-(--app-text-muted)'
              : 'border-(--app-border) text-(--app-text-muted)',
      )}
    >
      {label}
    </button>
  );
}

// ── Note values ─────────────────────────────────────────────────────────────────────────────

function NoteValuesLesson({ lessonId, paused }: { lessonId: string; paused: boolean }) {
  const { t } = useTranslation('c-rmhmusic');
  const [questions] = useState(() => dealValues(Math.random));
  const session = useQuestionSession<ValueQuestion, ValueAnswer>({
    machine: () => createValueMachine(questions),
    save: (fx) => useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score),
    paused,
    focusFirst: 'button',
  });
  const { lesson, total, answer, answerGroup } = session;
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const card = inSession ? lesson.cards[lesson.index] : null;

  const title = sessionTitle(
    session,
    inSession
      ? t('rhythm-count', {
          n: lesson.index + 1,
          total,
          defaultValue: 'Question {{n}} of {{total}}',
        })
      : '',
    t('lesson-complete', { defaultValue: 'Lesson complete' }),
    t('lesson-not-saved', { defaultValue: 'Not saved yet' }),
  );

  let line = '';
  let lineKey = 'hint';
  if (lesson.kind === 'asking') {
    line = t('rhythm-values-hint', {
      defaultValue: 'How many beats does the underlined note last?',
    });
  } else if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}`;
    if (!lesson.right && card) {
      line = t('rhythm-values-was', {
        name: valueName(t, card.value),
        beats: beatsLabel(t, BEATS_OF[card.value]),
        defaultValue: 'Not quite: the {{name}} note lasts {{beats}}.',
      });
    }
  } else {
    lineKey = 'score';
    line = t('rhythm-values-score', {
      correct: lesson.correct,
      total,
      defaultValue: 'You got {{correct}} of {{total}} right.',
    });
  }
  const said =
    lesson.kind === 'feedback' ? (
      lesson.right ? (
        t('rhythm-values-right-sr', {
          beats: card ? beatsLabel(t, BEATS_OF[card.value]) : '',
          defaultValue: 'Right: {{beats}}.',
        })
      ) : (
        line
      )
    ) : lesson.kind === 'asking' ? (
      session.announce ? (
        // The count and the question are two sentences, each a key of its own.
        <SaidParts parts={[title, line]} />
      ) : (
        ''
      )
    ) : inSession ? (
      ''
    ) : (
      line
    );

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
    answers = (
      <div
        ref={answerGroup}
        role="group"
        aria-label={t('rhythm-values-choices', { defaultValue: 'How many beats' })}
        className="rmm-rhythm__choices"
      >
        {NOTE_VALUES.map((value) => {
          const beats = BEATS_OF[value];
          const given = lesson.kind === 'feedback' && !lesson.right ? lesson.answer.beats : null;
          return (
            <ChoiceButton
              key={value}
              label={beatsLabel(t, beats)}
              state={
                lesson.kind === 'asking'
                  ? 'asking'
                  : card && BEATS_OF[card.value] === beats
                    ? 'right'
                    : given === beats
                      ? 'wrong'
                      : 'other'
              }
              onClick={() => answer({ beats })}
            />
          );
        })}
      </div>
    );
  }

  return (
    <SessionFrame className="rmm-rhythm space-y-4">
      <SessionSheet
        session={session}
        title={title}
        question={<NoteValues asked={card?.value ?? null} counts={lesson.kind !== 'asking'} />}
        line={line}
        lineKey={lineKey}
        said={said}
      />
      <Answers box={session.answersBox}>{answers}</Answers>
    </SessionFrame>
  );
}

// ── 4/4 versus 3/4 ──────────────────────────────────────────────────────────────────────────

type Extra = { type: 'replay' } | { type: 'played'; index: number };

function MeterLesson({ lessonId, paused }: { lessonId: string; paused: boolean }) {
  const { t } = useTranslation('c-rmhmusic');
  const [questions] = useState(() => dealMeters(METER_QUESTIONS, Math.random));
  // The lesson is rendered only once the store has loaded in the browser, so the audio state can
  // be read at once: the sound row is right from its first paint.
  const [status, setStatus] = useState<SoundStatus>(soundStatus);
  const [waking, setWaking] = useState<Waking>('idle');
  const mounted = useRef(false);
  const waiting = useRef(false);
  const indexRef = useRef(-1);
  const sentFor = useRef<number | null>(null);
  const sendRef = useRef<(e: Extra) => void>(() => {});
  const listenFirstId = useId();
  const [playback] = useState(() =>
    createPatternPlayback({
      ctx: getAudioContext,
      bpm: METER_BPM,
      ready: () => soundStatus() === 'ready',
      onHeard: (index) => sendRef.current({ type: 'played', index }),
    }),
  );

  const session = useQuestionSession<MeterQuestion, MeterAnswer, MeterState, Extra, MeterEffect>({
    machine: () => createMeterMachine(questions),
    save: (fx) => useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score),
    paused,
    focusFirst: 'button',
    onEffect: (fx) => {
      if (fx.type !== 'play') return;
      // `played` follows from the playback once the last click has sounded, not before.
      if (!playback.start(fx.index, fx.beatsPerBar)) refresh();
    },
  });
  const { lesson, total, answer, answerGroup } = session;
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const index = inSession ? lesson.index : -1;
  useEffect(() => {
    sendRef.current = session.send;
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

  // A new question plays by itself when sound is ready, once, from a timer so StrictMode's
  // mount-cleanup-mount starts it once (as in the ear lessons).
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
      sendRef.current({ type: 'replay' });
    }, 0);
    return () => clearTimeout(timer);
  }, [askingUnheard, index, paused, status]);

  const hear = () => {
    const action = hearAction({ status: soundStatus(), waiting: waiting.current, paused });
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
        session.send({ type: 'replay' });
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
            hearStillWanted({ askedIndex, currentIndex: indexRef.current, mounted: true })
          ) {
            sendRef.current({ type: 'replay' });
          }
        });
      }
    }
  };

  const sound = soundRowOf(status, waking);
  const title = sessionTitle(
    session,
    inSession
      ? t('rhythm-count', {
          n: lesson.index + 1,
          total,
          defaultValue: 'Question {{n}} of {{total}}',
        })
      : '',
    t('lesson-complete', { defaultValue: 'Lesson complete' }),
    t('lesson-not-saved', { defaultValue: 'Not saved yet' }),
  );

  let line = '';
  let lineKey = 'hint';
  if (lesson.kind === 'asking') {
    line = t('rhythm-meter-hint', {
      defaultValue: 'Listen for the accent, then pick how many beats are in each bar.',
    });
  } else if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}`;
    if (!lesson.right) {
      line = t('rhythm-meter-was', {
        count: lesson.cards[lesson.index].beatsPerBar,
        defaultValue_one: 'That bar had {{count}} beat.',
        defaultValue: 'That bar had {{count}} beats.',
      });
    }
  } else {
    lineKey = 'score';
    line = t('rhythm-meter-score', {
      correct: lesson.correct,
      total,
      defaultValue: 'You got {{correct}} of {{total}} right.',
    });
  }
  const problem = soundProblem(t, sound);
  const said =
    lesson.kind === 'feedback' ? (
      lesson.right ? (
        t('rhythm-meter-right-sr', {
          count: lesson.cards[lesson.index].beatsPerBar,
          defaultValue: 'Right: {{count}} beats in a bar.',
        })
      ) : (
        line
      )
    ) : lesson.kind === 'asking' ? (
      <SaidParts parts={[session.announce ? title : '', problem]} />
    ) : inSession ? (
      ''
    ) : (
      line
    );

  const correct: BeatsPerBar | null =
    lesson.kind === 'feedback' ? lesson.cards[lesson.index].beatsPerBar : null;
  const given: BeatsPerBar | null =
    lesson.kind === 'feedback' && !lesson.right ? lesson.answer.beatsPerBar : null;

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
        aria-label={t('rhythm-meter-choices', { defaultValue: 'Beats in a bar' })}
        className="rmm-rhythm__choices"
      >
        {/* Why the answers are not open yet, read after each one's name until the pattern has played. */}
        <span id={listenFirstId} className="sr-only">
          {t('ear-listen-first', { defaultValue: 'Listen first.' })}
        </span>
        {([3, 4] as const).map((beatsPerBar) => (
          <ChoiceButton
            key={beatsPerBar}
            label={beatsLabel(t, beatsPerBar)}
            open={open}
            describedBy={lesson.kind === 'asking' && !open ? listenFirstId : undefined}
            state={
              lesson.kind === 'asking'
                ? 'asking'
                : beatsPerBar === correct
                  ? 'right'
                  : beatsPerBar === given
                    ? 'wrong'
                    : 'other'
            }
            onClick={() => answer({ beatsPerBar })}
          />
        ))}
      </div>
    );
  }

  return (
    <SessionFrame className="rmm-rhythm space-y-4">
      <SessionSheet
        session={session}
        title={title}
        question={
          <div className="rmm-values flex items-center justify-center">
            <EarSoundRow sound={sound} inSession={inSession} onHear={hear} />
          </div>
        }
        line={line}
        lineKey={lineKey}
        said={said}
      />
      <Answers box={session.answersBox}>{answers}</Answers>
    </SessionFrame>
  );
}
