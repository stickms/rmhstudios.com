/**
 * KeySignatureLesson — naming a key from its signature (`key-signature`: Major key signatures,
 * Minor key signatures): ten staff cards, each showing the sharps or flats a key writes at the
 * start of a treble or bass staff, and four buttons naming keys; the learner picks the one the
 * signature belongs to. Pure recognition: it needs no instrument, so it is on the singer's path
 * too.
 *
 * The lifecycle (asking, feedback, next, saving, saved / failed / signed out; one answer per
 * card, one save per attempt) is the shared session machine through `useQuestionSession`, as in
 * the flashcards. The card is an image with a text equivalent in words ("Key signature: 3 flats,
 * treble clef"), and the answers are native buttons in a group, so the keyboard and a screen reader
 * reach them; the right answer is marked with a check and the wrong pick with a cross, never
 * by colour alone. Every box is a fixed height, the same as LessonScreen's KeySignatureSkeleton.
 */

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  createKeySignatureMachine,
  keyLessonMode,
  keySignatureQuestions,
  type KeyAnswer,
  type KeyQuestion,
} from '@/lib/rmhmusic/learn/machines/key-signature';
import { isolateLtr } from '@/lib/rmhmusic/learn/note-list';
import { scoreFrom, starsFor } from '@/lib/rmhmusic/learn/scoring/stars';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { clefStep, type Clef } from '@/lib/rmhmusic/learn/theory/clef';
import {
  keyId,
  keySignature,
  keyTonicGlyphs,
  signaturePositions,
  type Key,
  type KeySignature,
} from '@/lib/rmhmusic/learn/theory/key-signatures';
import { CARD_GAP, CARD_H, CARD_W, cardY, flatPath, sharpPath } from '@/lib/rmhmusic/learn/staff-card-layout';
import { cn } from '@/lib/utils';
import { LessonResult } from './LessonParts';
import { SessionFrame, SessionSheet, sessionTitle, useQuestionSession } from './QuestionSession';
import { STAFF_BOX, StaffRuling } from './StaffCard';

/** Where the first accidental goes, and the gap to the next (SVG units, after the clef). */
const SIG_X0 = 54;
const SIG_DX = 11;

/** The signature in words: "3 flats, treble clef" — the card's text equivalent. */
export function describeSignature(t: TFunction<'music-scales'>, sig: KeySignature, clef: Clef): string {
  const clefWord =
    clef === 'treble'
      ? t('clef-treble', {
          defaultValue: 'treble clef',
        })
      : t('clef-bass', {
          defaultValue: 'bass clef',
        });
  if (sig.accidental === null) {
    return t('sig-card-none', {
      clef: clefWord,
      defaultValue: 'Key signature: no sharps or flats, {{clef}}',
    });
  }
  if (sig.accidental === 'sharp') {
    return t('sig-card-sharps', {
      count: sig.count,
      clef: clefWord,
      defaultValue_one: 'Key signature: {{count}} sharp, {{clef}}',
      defaultValue: 'Key signature: {{count}} sharps, {{clef}}',
    });
  }
  return t('sig-card-flats', {
    count: sig.count,
    clef: clefWord,
    defaultValue_one: 'Key signature: {{count}} flat, {{clef}}',
    defaultValue: 'Key signature: {{count}} flats, {{clef}}',
  });
}

/** One key signature on a staff: the staff, its clef and the accidentals, drawn by hand. */
export function KeySignatureCard({
  sig,
  clef,
  label,
  className,
}: {
  sig: KeySignature;
  clef: Clef;
  /** The text equivalent (`describeSignature`). */
  label: string;
  className?: string;
}) {
  const marks = signaturePositions(sig, clef);
  return (
    <figure className={cn(STAFF_BOX, className)}>
      <svg
        viewBox={`0 0 ${CARD_W} ${CARD_H}`}
        role="img"
        aria-label={label}
        className="block h-auto w-full text-app-text"
      >
        <StaffRuling clef={clef} />
        <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          {marks.map((midi, i) => {
            const x = SIG_X0 + i * SIG_DX;
            const y = cardY(clefStep(clef, midi));
            return (
              <path
                key={`${i}-${midi}`}
                d={sig.accidental === 'sharp' ? sharpPath(x, y) : flatPath(x, y + CARD_GAP / 4)}
              />
            );
          })}
        </g>
      </svg>
    </figure>
  );
}

/** "G major": the tonic as printed and the mode's word, set in one key so languages can reorder. */
function keyName(t: TFunction<'music-scales'>, key: Key): string {
  const mode =
    key.mode === 'major'
      ? t('mode-major', {
          defaultValue: 'major',
        })
      : t('mode-minor', {
          defaultValue: 'minor',
        });
  return t('key-name', {
    tonic: isolateLtr(keyTonicGlyphs(key)),
    mode,
    defaultValue: '{{tonic}} {{mode}}',
  });
}

export function KeySignatureLesson({
  lessonId,
  paused = false,
}: {
  lessonId: string;
  /** A dialog is open over the lesson: nothing answers. */
  paused?: boolean;
}) {
  const { t } = useTranslation('music-scales');
  const [questions] = useState(() => keySignatureQuestions(lessonId));
  const mode = keyLessonMode(lessonId);
  const session = useQuestionSession<KeyQuestion, KeyAnswer>({
    machine: () => createKeySignatureMachine(questions),
    save: (fx) => useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score),
    paused,
    focusFirst: 'button[data-choice]',
  });
  const { lesson, total, answer, answerGroup } = session;
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const question = session.card;
  const sig = question ? keySignature(question.key) : null;
  const description = question && sig ? describeSignature(t, sig, question.clef) : '';
  const asking = lesson.kind === 'asking';

  const title = sessionTitle(
    session,
    inSession
      ? t('question-count', {
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

  const prompt =
    mode === 'major'
      ? t('key-prompt-major', {
          defaultValue: 'Which major key has this signature?',
        })
      : t('key-prompt-minor', {
          defaultValue: 'Which minor key has this signature?',
        });

  let line: string;
  let lineKey = 'hint';
  if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}`;
    const name = question ? keyName(t, question.key) : '';
    line = lesson.right
      ? t('key-right', {
          name,
          defaultValue: 'Right: {{name}}.',
        })
      : t('key-not-quite', {
          name,
          defaultValue: 'Not quite: that is {{name}}.',
        });
  } else if (!inSession) {
    lineKey = 'score';
    line = t('key-score', {
      correct: lesson.correct,
      total,
      defaultValue: 'You named {{correct}} of {{total}} keys.',
    });
  } else {
    line =
      mode === 'major'
        ? t('key-hint-major', {
            defaultValue: 'Count the sharps or flats, then pick the key.',
          })
        : t('key-hint-minor', {
            defaultValue: 'A minor key shares its signature with a major key. Pick the minor.',
          });
  }
  const said = lesson.kind === 'asking' ? (session.announce ? `${title}. ${description}` : '') : line;

  if (!inSession) {
    const stars = lesson.kind === 'saved' ? lesson.stars : starsFor(scoreFrom(lesson.correct, total));
    return (
      <SessionFrame className="space-y-4">
        <SessionSheet
          session={session}
          title={title}
          question={<div className="min-h-40" />}
          line={line}
          lineKey={lineKey}
          said={said}
        />
        <div ref={session.answersBox}>
          <LessonResult
            kind={lesson.kind}
            stars={stars}
            returnTo={`/rmhmusic/lesson/${lessonId}`}
            onRetry={session.retry}
            className="flex-1"
          />
        </div>
      </SessionFrame>
    );
  }

  const picked = lesson.kind === 'feedback' ? lesson.answer.id : null;
  const rightId = question ? keyId(question.key) : '';
  return (
    <SessionFrame className="space-y-4">
      <SessionSheet
        session={session}
        title={title}
        question={
          <div className="space-y-2">
            {question && sig ? <KeySignatureCard sig={sig} clef={question.clef} label={description} /> : null}
            <p className="text-sm leading-5 text-app-text-muted">{prompt}</p>
          </div>
        }
        line={line}
        lineKey={lineKey}
        said={said}
      />
      <div ref={answerGroup}>
        <div
          ref={session.answersBox}
          role="group"
          aria-label={t('key-choices', {
            defaultValue: 'Keys to choose from',
          })}
          className="grid grid-cols-2 gap-3"
        >
          {(question?.choices ?? []).map((choice) => {
            const id = keyId(choice);
            const isRight = !asking && id === rightId;
            const isWrong = !asking && id === picked && id !== rightId;
            const name = keyName(t, choice);
            return (
              <button
                key={id}
                type="button"
                data-choice=""
                aria-disabled={!asking || undefined}
                onClick={() =>
                  answer({
                    id,
                  })
                }
                className={cn(
                  'inline-flex min-h-11 items-center justify-center gap-2 rounded-app-sm border px-4 text-base font-medium text-app-text transition-colors',
                  isRight
                    ? 'border-app-accent'
                    : isWrong
                      ? 'border-app-danger'
                      : 'border-app-border hover:bg-app-surface-hover',
                )}
              >
                <span>{name}</span>
                {isRight ? (
                  <>
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="sr-only">
                      {t('choice-right', {
                        defaultValue: 'right answer',
                      })}
                    </span>
                  </>
                ) : null}
                {isWrong ? (
                  <>
                    <X className="h-4 w-4 shrink-0 text-app-danger" aria-hidden="true" />
                    <span className="sr-only">
                      {t('choice-wrong', {
                        defaultValue: 'your answer, not right',
                      })}
                    </span>
                  </>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </SessionFrame>
  );
}
