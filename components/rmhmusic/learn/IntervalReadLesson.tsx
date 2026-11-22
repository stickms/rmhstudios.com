/**
 * IntervalReadLesson — reading intervals off the staff (`staff-intervals`: the "Read intervals" unit):
 * ten questions, each two notes written one after the other, named with the buttons. The first
 * lessons ask by size (second … octave, counted in lines and spaces); the later ones by quality
 * (minor third, perfect fifth, tritone …). What each lesson asks, and how the notes are written, is
 * `theory/staff-intervals.ts`; this is the screen.
 *
 * Pure reading: it needs no instrument and plays no sound, so there is no input to set up and no
 * audio to wait for. The lifecycle (asking → feedback → next → saving → saved / failed / signed-out,
 * one save per attempt) is the shared session machine through `useQuestionSession`, as in the
 * flashcards, and so are the sheet, the focus moves and the held-Enter guard (`QuestionSession.tsx`).
 *
 * Learning or Test mode (`PracticeModeToggle`): after a wrong answer the sheet draws the second note
 * the answer would have written, in red pencil beside the right one (`SprintSheet`'s `played`), and
 * says what was said, what it is and how far off the answer was (`interval-text.ts`). In Learning
 * mode the same question comes back until it is answered right (Next reads "Try again"); only the
 * first answer scores and is graded.
 *
 * Each question is an FSRS item (`int:up:third`): after the lesson saves, its reviews are posted
 * best-effort (`interval-review.ts`), graded from the first answer and the time to it, and a failed
 * post never changes the lesson's own save. The questions are dealt due and weak items first.
 *
 * Every box is a fixed height, the same as LessonScreen's IntervalSkeleton: the mode toggle, the
 * sheet (title line, the staff and the note names under it, the sentence line) and the 12.5rem answers
 * box (up to four rows of two buttons).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { buildIntervalSession, intervalReviews } from '@/lib/rmhmusic/learn/interval-review';
import { INTERVAL_QUESTIONS, createStaffIntervalsMachine } from '@/lib/rmhmusic/learn/machines/staff-intervals';
import { getPracticeMode } from '@/lib/rmhmusic/learn/practice-mode';
import { scoreFrom, starsFor } from '@/lib/rmhmusic/learn/scoring/stars';
import { BAR_X, CARD_NOTE_X } from '@/lib/rmhmusic/learn/staff-card-layout';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import {
  impliedSecond,
  staffIntervalLesson,
  type IntervalAnswer,
  type IntervalQuestion,
  type StaffIntervalLesson,
} from '@/lib/rmhmusic/learn/theory/staff-intervals';
import { cn } from '@/lib/utils';
import { intervalCardLabel, intervalHint, intervalLabel, intervalMissSentences } from './interval-text';
import { LessonResult } from './LessonParts';
import { PracticeModeToggle, usePracticeMode } from './PracticeModeToggle';
import {
  SaidParts,
  SessionFrame,
  SessionSheet,
  cardStateOf,
  sessionTitle,
  useQuestionSession,
} from './QuestionSession';
import { STAFF_BOX, SprintSheet } from './StaffCard';

/**
 * How far right of the written second note the red "your answer" note sits, in the card's SVG units:
 * clear of a neighbouring head (a head is about 13 wide) and of its own accidental. `SprintSheet`
 * lays played notes out as a chord at the card's note column, so this is that column's offset.
 */
const PLAYED_BESIDE = 28;
const PLAYED_DX = BAR_X[1] + PLAYED_BESIDE - CARD_NOTE_X;

export function IntervalReadLesson({ lessonId, paused = false }: { lessonId: string; paused?: boolean }) {
  const lesson = staffIntervalLesson(lessonId);
  if (!lesson) return null;
  return <IntervalSession lessonId={lessonId} lesson={lesson} paused={paused} />;
}

function IntervalSession({
  lessonId,
  lesson: setting,
  paused,
}: {
  lessonId: string;
  lesson: StaffIntervalLesson;
  paused: boolean;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const [questions] = useState(() => {
    // The learner's due and weak items first, when their cards have already loaded (the home loads
    // them); otherwise the plain, evenly spread deal.
    const { cards, cardsStatus } = useLearnStore.getState();
    return buildIntervalSession(
      setting,
      cardsStatus === 'ready' ? cards : [],
      Date.now(),
      INTERVAL_QUESTIONS,
      Math.random,
    );
  });
  const mode = usePracticeMode();

  const session = useQuestionSession<IntervalQuestion, IntervalAnswer>({
    machine: () => createStaffIntervalsMachine(questions, () => getPracticeMode() === 'learning'),
    save: async (fx, answered) => {
      const outcome = await useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score);
      // The reviews follow the lesson's own save and never change its outcome: a failed post just
      // leaves the schedule as it was.
      if (outcome === 'saved') {
        try {
          const reviews = intervalReviews(answered);
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
  });
  const { lesson, total, answer, answerGroup } = session;
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const card = session.card;
  const wrong = lesson.kind === 'feedback' && !lesson.right;

  const title = sessionTitle(
    session,
    inSession
      ? t('interval-read-count', {
          n: lesson.index + 1,
          total,
          defaultValue: 'Interval {{n}} of {{total}}',
        })
      : '',
    t('lesson-complete', { defaultValue: 'Lesson complete' }),
    t('lesson-not-saved', { defaultValue: 'Not saved yet' }),
  );

  // The sentence line: the instruction while asking; after a wrong answer what was said against what
  // it is, and how far off; the score at the end.
  let line: React.ReactNode = '';
  let lineKey = 'hint';
  let missParts: string[] = [];
  if (lesson.kind === 'asking') {
    line = intervalHint(t, setting.tier);
  } else if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}-${lesson.misses ?? 0}`;
    if (!lesson.right && card) {
      missParts = intervalMissSentences(t, card, lesson.answer.name);
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
    line = t('interval-read-score', {
      correct: lesson.correct,
      total,
      count: Number(total),
      defaultValue_one: 'You named {{correct}} of {{total}} interval.',
      defaultValue: 'You named {{correct}} of {{total}} intervals.',
    });
  }

  // What a screen reader hears once a question is answered, the next one when it is dealt (its
  // visible title), and the score at the end.
  const said: React.ReactNode =
    lesson.kind === 'feedback' ? (
      lesson.right && card ? (
        t('interval-read-right-sr', {
          name: intervalLabel(t, card.answer),
          defaultValue: 'Right: {{name}}.',
        })
      ) : (
        <SaidParts parts={missParts} />
      )
    ) : lesson.kind === 'asking' ? (
      session.announce ? (
        title
      ) : (
        ''
      )
    ) : inSession ? (
      ''
    ) : typeof line === 'string' ? (
      line
    ) : (
      ''
    );

  const question = card ? (
    <SprintSheet
      clef={card.clef}
      notes={[card.first, card.second]}
      arrangement="bar"
      state={cardStateOf(session)}
      label={intervalCardLabel(t, card, lesson.kind === 'feedback' || !inSession)}
      played={
        wrong && lesson.kind === 'feedback' ? { notes: [impliedSecond(card, lesson.answer.name)], dx: PLAYED_DX } : null
      }
    />
  ) : (
    <div aria-hidden="true" className={STAFF_BOX}>
      <div className="aspect-[200/102] w-full" />
      <div className="h-9" />
    </div>
  );

  let answers: React.ReactNode;
  if (!inSession) {
    const stars = lesson.kind === 'saved' ? lesson.stars : starsFor(scoreFrom(lesson.correct, total));
    answers = (
      <LessonResult
        kind={lesson.kind}
        stars={stars}
        returnTo={`/rmhmusic/lesson/${lessonId}`}
        onRetry={session.retry}
        className="flex-1"
      />
    );
  } else {
    const asking = lesson.kind === 'asking';
    const given = lesson.kind === 'feedback' && !lesson.right ? lesson.answer.name : null;
    answers = (
      <div
        ref={answerGroup}
        role="group"
        aria-label={t('interval-read-choices', { defaultValue: 'Interval names' })}
        className="rmm-interval__choices"
      >
        {setting.pool.map((name) => (
          <button
            key={name}
            type="button"
            aria-disabled={!asking || undefined}
            onClick={() => answer({ name })}
            className={cn(
              'rmm-display flex h-9 min-w-0 items-center justify-center rounded-app-sm border px-2 text-center text-base leading-5 transition-colors',
              asking
                ? 'border-app-border-bright text-app-text'
                : card && card.answer === name
                  ? 'border-app-accent text-app-accent'
                  : given === name
                    ? 'rmm-flash__struck border-app-border text-app-text-muted'
                    : 'border-app-border text-app-text-muted',
            )}
          >
            {intervalLabel(t, name)}
          </button>
        ))}
      </div>
    );
  }

  return (
    <SessionFrame className="rmm-interval space-y-4">
      <PracticeModeToggle />
      <SessionSheet
        session={session}
        title={title}
        question={question}
        line={line}
        lineKey={lineKey}
        said={said}
        retry={mode === 'learning' && wrong}
      />
      <div ref={session.answersBox} className="rmm-interval__answers">
        {answers}
      </div>
    </SessionFrame>
  );
}
