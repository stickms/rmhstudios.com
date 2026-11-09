'use client';

/**
 * FlashcardLesson — a staff-reading lesson (`staff-flashcards`): ten cards dealt from the
 * lesson's deck, each one note on a staff, named with a letter button or by playing it. A wrong
 * answer is told in one sentence ("That was E."); a right one adds nothing but the name written
 * under the note. After the last card the result is saved like any lesson's (stars and XP through
 * `completeLesson`), with Retry or a sign-in link if that fails, and the result stays on screen.
 *
 * The ask → feedback → next → saving → saved / failed / signed-out lifecycle is the pure machine
 * in `machines/flashcards.ts`: an answer leaves `asking` synchronously, so a double tap, a key
 * repeat or two notes in one tick answer a card once.
 *
 * How an answer is read:
 * - the letter buttons, and the letters A–G on a physical keyboard, answer by letter (any octave);
 * - the on-screen piano and a MIDI controller answer by the exact note played (octave included);
 * - the computer keys and the microphone answer by the letter of the note played: the computer
 *   keys span one octave (C4–C5) while the decks reach B3 and A5, and a voice or a guitar sounds in
 *   a different octave from the written note. A black key is never a natural's letter, so it is
 *   simply wrong.
 * - When the computer keys ARE the learner's instrument (input `keys`, or the keys source
 *   running), the physical-keyboard letter shortcuts are off: those keys play notes there (A is
 *   C4, E is D♯4), and a key press must answer once, as the note it plays, never also as its
 *   letter.
 *
 * Every box — the title line, the staff, the sentence line, the letters, the input region — has a
 * fixed height, the same as LessonScreen's placeholder, so nothing moves from loading to the
 * result. The lesson needs no instrument: the letter buttons always answer.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DECKS, buildSession, type Card } from '@/lib/rmhmusic/learn/content/decks';
import { getLesson } from '@/lib/rmhmusic/learn/content/path';
import { releaseMic } from '@/lib/rmhmusic/learn/input/mic-lifecycle';
import {
  createFlashcardsMachine,
  type Answer,
  type Effect,
} from '@/lib/rmhmusic/learn/machines/flashcards';
import { midiToName } from '@/lib/rmhmusic/learn/pitch/notes';
import { starsFor, scoreFrom } from '@/lib/rmhmusic/learn/scoring/stars';
import { isSharp } from '@/lib/rmhmusic/learn/staff';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { noteLetter, type NoteLetter } from '@/lib/rmhmusic/learn/theory/clef';
import { cn } from '@/lib/utils';
import { PRIMARY_BUTTON } from './buttons';
import { DeviceRegion, LessonResult } from './LessonParts';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { STAFF_BOX, StaffCard, type StaffCardState } from './StaffCard';
import { useInputPhases, useLessonInputStart, useNoteEvents, useNoteSound } from './useLearnInput';
import { useMachine } from './useMachine';

/** Cards in one lesson. */
export const SESSION_CARDS = 10;

const LETTERS: readonly NoteLetter[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

/** True when a key press here is typing, not an answer (form fields, rich text). */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}

/** The letter the learner gave (letter answers) or the note they played (midi answers). */
function answerName(answer: Answer): string {
  return answer.kind === 'letter' ? answer.letter : midiToName(answer.midi);
}

export function FlashcardLesson({
  lessonId,
  paused = false,
}: {
  lessonId: string;
  /** A dialog is open over the lesson: nothing answers. */
  paused?: boolean;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const hub = useLearnStore((s) => s.hub);
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  const [machine] = useState(() => {
    const deck = DECKS[getLesson(lessonId)?.deck ?? ''];
    return createFlashcardsMachine(deck ? buildSession(deck, SESSION_CARDS, Math.random) : []);
  });
  const [lesson, send] = useMachine(machine);
  const phases = useInputPhases();
  useNoteSound(!paused);
  useLessonInputStart();

  // The card and how it went, kept for the result screen (the machine's result states hold only
  // the score), so the sheet still shows the last card once the session ends.
  const [last, setLast] = useState<{ card: Card; right: boolean } | null>(null);

  const needsDevice = input === 'mic' || input === 'midi';
  const inputOn = !needsDevice || phases[input] === 'active';
  const keysPlayNotes = input === 'keys' || phases.keys === 'active';

  const perform = (effects: Effect[]) => {
    for (const fx of effects) {
      // The session is over: the result needs no microphone.
      if (hub) releaseMic(hub);
      void useLearnStore
        .getState()
        .completeLesson(lessonId, fx.stars, fx.score)
        .then((outcome) => perform(send({ type: 'answered', attempt: fx.attempt, outcome })));
    }
  };

  const answer = (a: Answer) => {
    if (paused) return;
    perform(send({ type: 'answer', answer: a }));
  };

  const nextButton = useRef<HTMLButtonElement>(null);
  const letterGroup = useRef<HTMLDivElement>(null);
  const movedOn = useRef(false);

  const next = () => {
    if (lesson.kind === 'feedback') {
      setLast({ card: lesson.cards[lesson.index], right: lesson.right });
    }
    movedOn.current = true;
    perform(send({ type: 'next' }));
  };

  useNoteEvents((e) => {
    if (e.type !== 'on') return;
    if (e.source === 'keys' || e.source === 'mic') {
      answer(
        isSharp(e.midi)
          ? { kind: 'midi', midi: e.midi }
          : { kind: 'letter', letter: noteLetter(e.midi) },
      );
    } else {
      answer({ kind: 'midi', midi: e.midi });
    }
  });

  // The letters A–G on a physical keyboard, unless those keys are playing notes (see above).
  const answerRef = useRef(answer);
  useEffect(() => {
    answerRef.current = answer;
  });
  useEffect(() => {
    if (keysPlayNotes) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return;
      // Typing in a field never answers; while the setup dialog is open the lesson is `paused`.
      if (isTypingTarget(e.target)) return;
      const letter = e.key.toUpperCase();
      if (!(LETTERS as readonly string[]).includes(letter)) return;
      answerRef.current({ kind: 'letter', letter });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keysPlayNotes]);

  // Focus follows the learner: after an answer given from the letters (or with nothing focused),
  // to Next; after Next, back to the letters — so a keyboard user never lands on <body>. Next is
  // inert and hidden in the same commit that leaves `feedback`, but the browser has not yet moved
  // focus off it when this runs, so focus on Next (or inside any inert subtree) counts as nowhere.
  const index = lesson.kind === 'asking' || lesson.kind === 'feedback' ? lesson.index : -1;
  useLayoutEffect(() => {
    const active = document.activeElement;
    const nowhere =
      !active ||
      active === document.body ||
      (lesson.kind === 'asking' &&
        (active === nextButton.current || active.closest('[inert]') !== null));
    if (lesson.kind === 'feedback') {
      if (nowhere || letterGroup.current?.contains(active)) {
        nextButton.current?.focus({ preventScroll: true });
      }
    } else if (lesson.kind === 'asking' && movedOn.current) {
      movedOn.current = false;
      if (nowhere) letterGroup.current?.querySelector('button')?.focus({ preventScroll: true });
    }
  }, [lesson.kind, index]);

  const retry = () => perform(send({ type: 'retry' }));

  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  const total = inSession ? lesson.cards.length : lesson.total;
  const card: Card | null = inSession ? (lesson.cards[lesson.index] ?? null) : (last?.card ?? null);
  const cardState: StaffCardState =
    lesson.kind === 'asking'
      ? 'ask'
      : lesson.kind === 'feedback'
        ? lesson.right
          ? 'right'
          : 'wrong'
        : last?.right
          ? 'right'
          : 'wrong';

  const title = inSession
    ? t('flash-card-count', {
        n: lesson.index + 1,
        total,
        defaultValue: 'Card {{n}} of {{total}}',
      })
    : lesson.kind === 'saved' || lesson.kind === 'saving'
      ? t('lesson-complete', { defaultValue: 'Lesson complete' })
      : t('lesson-not-saved', { defaultValue: 'Not saved yet' });

  const hint =
    input === 'keys'
      ? t('flash-hint-keys', {
          defaultValue: 'Tap its letter, or play it on your computer keys.',
        })
      : input === 'midi'
        ? t('flash-hint-midi', {
            defaultValue: 'Tap its letter, or play it on your MIDI controller.',
          })
        : input === 'mic'
          ? t('flash-hint-mic', { defaultValue: 'Tap its letter, or play or sing it.' })
          : t('flash-hint-screen', {
              defaultValue: 'Tap its letter, or play it on the piano below.',
            });

  // The sentence line: the hint while asking; after a wrong answer what the note was (with its
  // octave when a note was played, since then the octave counted); the score at the end.
  let line = '';
  let lineKey = 'hint';
  if (lesson.kind === 'asking') {
    line = hint;
  } else if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}`;
    if (!lesson.right) {
      const c = lesson.cards[lesson.index];
      line = t('flash-that-was', {
        note: lesson.answer.kind === 'midi' ? midiToName(c.midi) : noteLetter(c.midi),
        defaultValue: 'That was {{note}}.',
      });
    }
  } else {
    lineKey = 'score';
    line = t('flash-score', {
      correct: lesson.correct,
      total,
      defaultValue: 'You named {{correct}} of {{total}} notes.',
    });
  }

  // What a screen reader hears once a card is answered, and the score at the end.
  const said =
    lesson.kind === 'feedback'
      ? lesson.right
        ? t('flash-right-sr', {
            note: answerName(lesson.answer),
            defaultValue: 'Right: {{note}}.',
          })
        : line
      : inSession
        ? ''
        : line;

  const correctLetter =
    lesson.kind === 'feedback' ? noteLetter(lesson.cards[lesson.index].midi) : null;
  const givenLetter =
    lesson.kind === 'feedback' && lesson.answer.kind === 'letter' ? lesson.answer.letter : null;

  let answers: ReactNode;
  if (!inSession) {
    const stars =
      lesson.kind === 'saved' ? lesson.stars : starsFor(scoreFrom(lesson.correct, total));
    answers = (
      <LessonResult
        kind={lesson.kind}
        stars={stars}
        lessonId={lessonId}
        onRetry={retry}
        className="flex-1"
      />
    );
  } else {
    let region: ReactNode;
    if (needsDevice) {
      region = <DeviceRegion input={input} on={inputOn} />;
    } else if (input === 'keys') {
      region = (
        <div className="rmm-sheet flex h-full items-center justify-center p-4 text-center">
          <p className="text-sm leading-6 text-(--app-text-muted)">
            {t('flash-keys-region', {
              defaultValue:
                'Your computer keys are a piano: A, S, D, F, G, H, J and K play C, D, E, F, G, A, B and C.',
            })}
          </p>
        </div>
      );
    } else {
      // As in the first lesson: the keys bleed into the page gutter so seven white keys stay ≥ 44px.
      region = <OnScreenKeyboard className="-mx-2 max-[332px]:-mx-3.5 sm:mx-0" />;
    }
    const asking = lesson.kind === 'asking';
    answers = (
      <>
        <div
          ref={letterGroup}
          role="group"
          aria-label={t('flash-letters', { defaultValue: 'Note names' })}
          className="rmm-flash__letters"
        >
          {LETTERS.map((letter) => {
            const isCorrect = letter === correctLetter;
            const isGiven = letter === givenLetter;
            return (
              <button
                key={letter}
                type="button"
                aria-label={letter}
                aria-keyshortcuts={keysPlayNotes ? undefined : letter}
                aria-disabled={!asking || undefined}
                onClick={() => answer({ kind: 'letter', letter })}
                className={cn(
                  'rmm-display flex h-full min-h-11 min-w-0 items-center justify-center rounded-(--app-radius-sm) border text-[1.375rem] leading-none transition-colors',
                  asking
                    ? 'border-(--app-border-bright) text-(--app-text)'
                    : isCorrect
                      ? 'border-(--app-accent) text-(--app-accent)'
                      : isGiven
                        ? 'rmm-flash__struck border-(--app-border) text-(--app-text-dim)'
                        : 'border-(--app-border) text-(--app-text-dim)',
                )}
              >
                {letter}
              </button>
            );
          })}
        </div>
        <div className="rmm-input-region">{region}</div>
      </>
    );
  }

  return (
    <div className="rmm-flash space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <h2
          title={title}
          className="rmm-display line-clamp-1 h-8 text-2xl leading-8 text-(--app-text)"
        >
          <span key={inSession ? `card-${lesson.index}` : lesson.kind}>{title}</span>
        </h2>
        {card ? (
          <StaffCard card={card} state={cardState} />
        ) : (
          <div aria-hidden="true" className={STAFF_BOX}>
            <div className="aspect-[200/102] w-full" />
            <div className="h-9" />
          </div>
        )}
        <div className="flex h-11 items-center gap-3">
          <div className="flex h-10 min-w-0 flex-1 items-center justify-center">
            <p
              key={lineKey}
              title={line || undefined}
              className="line-clamp-2 text-sm leading-5 text-(--app-text-muted)"
            >
              {line}
            </p>
          </div>
          {/* Always here so the line never reflows; hidden (and inert) until a card is answered. */}
          <button
            ref={nextButton}
            type="button"
            onClick={next}
            inert={lesson.kind !== 'feedback' || undefined}
            className={cn(PRIMARY_BUTTON, lesson.kind !== 'feedback' && 'invisible')}
          >
            {t('flash-next', { defaultValue: 'Next' })}
          </button>
          {/* Inside this row, not after it: as the section's last child it would take the
              row's place in the section's spacing (space-y spaces all but the last child). */}
          <p className="sr-only" aria-live="polite">
            {said}
          </p>
        </div>
      </section>
      <div className="rmm-flash__answers">{answers}</div>
    </div>
  );
}
