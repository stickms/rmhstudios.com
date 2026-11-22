/**
 * FlashcardLesson — a staff-reading lesson (`staff-flashcards`): ten cards dealt from the
 * lesson's deck, each one note on a staff, named with a letter button or by playing it. A wrong
 * answer is told in one sentence ("That was E."); a right one adds nothing but the name written
 * under the note. After the last card the result is saved like any lesson's (stars and XP through
 * `completeLesson`), with Retry or a sign-in link if that fails, and the result stays on screen.
 *
 * The session itself is `FlashcardSession`, which takes its cards and how to save the result, so
 * Practice (`PracticeLesson`) runs the same screen over the learner's remembered cards and saves
 * their reviews instead of a lesson completion.
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
 *   a different octave from the written note. A black key is never a natural's letter, so on a
 *   natural card it is simply wrong.
 * - A session with sharps, flats or key-signature cards (`isSpelledCard`) adds a ♭ ♮ ♯ choice above
 *   the piano: a letter answer is the choice then the letter (`#` and `-` on a keyboard), judged by
 *   letter AND sign; a played note is judged by what sounds, so a black key is right for F♯ and G♭
 *   alike, and the computer keys and the microphone answer by pitch class on those cards.
 * - When the computer keys ARE the learner's instrument (input `keys`, or the keys source
 *   running), the physical-keyboard letter shortcuts are off: those keys play notes there (A is
 *   C4, E is D♯4), and a key press must answer once, as the note it plays, never also as its
 *   letter.
 *
 * Every box — the title line, the staff, the sentence line, the letters, the input region — has a
 * fixed height, the same as LessonScreen's placeholder, so nothing moves from loading to the
 * result. The lesson needs no instrument: the letter buttons always answer.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { DECKS, voiceDeck, buildSession, type Card } from '@/lib/rmhmusic/learn/content/decks';
import { VOICE_RANGE_DECK, getLesson } from '@/lib/rmhmusic/learn/content/path';
import { resolveVoiceRange } from '@/lib/rmhmusic/learn/voice/range';
import { createFlashcardsMachine, type Answer, type Effect } from '@/lib/rmhmusic/learn/machines/flashcards';
import type { CompleteOutcome } from '@/lib/rmhmusic/learn/machines/learn-data';
import { describeMiss, type Miss } from '@/lib/rmhmusic/learn/miss';
import { cardAlteration, cardLetter, cardWritten, isSpelledCard } from '@/lib/rmhmusic/learn/content/spelling';
import { getPracticeMode } from '@/lib/rmhmusic/learn/practice-mode';
import { starsFor, scoreFrom } from '@/lib/rmhmusic/learn/scoring/stars';
import { isSharp } from '@/lib/rmhmusic/learn/staff';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { noteLetter, type NoteLetter } from '@/lib/rmhmusic/learn/theory/clef';
import { cn } from '@/lib/utils';
import { answerName, wrongAnswerSentences } from './flash-text';
import { DeviceRegion, LessonResult } from './LessonParts';
import { OnScreenKeyboard } from './OnScreenKeyboard';
import { PracticeModeToggle } from './PracticeModeToggle';
import {
  SaidParts,
  SessionFrame,
  SessionSheet,
  cardStateOf,
  sessionTitle,
  useQuestionSession,
  type AnsweredQuestion,
} from './QuestionSession';
import {
  STAFF_BOX,
  STAFF_GRAND_ASPECT,
  STAFF_LOW_ASPECT,
  StaffCard,
  type PlayedNote,
  type StaffCardState,
} from './StaffCard';
import { useInputPhases, useLessonInputStart, useNoteEvents, useNoteSound } from './useLearnInput';
import type { PlayOptions } from '@/lib/rmhmusic/learn/audio/voice';

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

/** The three choices before a letter on a spelled card: flat, natural, sharp. */
const SIGNS = [
  { value: -1, glyph: '♭' },
  { value: 0, glyph: '♮' },
  { value: 1, glyph: '♯' },
] as const;

const mod12 = (n: number): number => ((Math.round(n) % 12) + 12) % 12;

/** One card of a finished session and whether it was named right. */
export type Answered = AnsweredQuestion<Card>;

/** A staff-reading lesson: ten cards from the lesson's deck, saved as a lesson completion. */
export function FlashcardLesson({
  lessonId,
  paused = false,
  sound,
}: {
  lessonId: string;
  /** A dialog is open over the lesson: nothing answers. */
  paused?: boolean;
  /** How the learner's notes are voiced (the lesson's sound); the synth when absent. */
  sound?: PlayOptions;
}) {
  const { t } = useTranslation('c-rmhmusic');
  // A singer's staff lesson deals from their range's deck (`voice-range`), read once at mount.
  const [deck] = useState(() => {
    const named = getLesson(lessonId)?.deck ?? '';
    return named === VOICE_RANGE_DECK
      ? voiceDeck(resolveVoiceRange(useLearnStore.getState().profile?.voiceRange))
      : DECKS[named];
  });
  const [cards] = useState(() => {
    return deck ? buildSession(deck, SESSION_CARDS, Math.random) : [];
  });
  return (
    <FlashcardSession
      cards={cards}
      octaveClef={deck?.octaveClef ?? false}
      lowCard={deck?.lowCard ?? false}
      paused={paused}
      sound={sound}
      save={(fx) => useLearnStore.getState().completeLesson(lessonId, fx.stars, fx.score)}
      doneTitle={t('lesson-complete', {
        defaultValue: 'Lesson complete',
      })}
      returnTo={`/rmhmusic/lesson/${lessonId}`}
    />
  );
}

/**
 * One flashcard session over `cards` (at least one). `save` is called once per save attempt, when
 * the session ends and on Retry, with the machine's `complete` effect and every card answered, in
 * order; it resolves with how the save went. `stars: false` leaves the noteheads off the result
 * (a session that earns none).
 */
export function FlashcardSession({
  cards,
  paused = false,
  save,
  doneTitle,
  returnTo,
  stars: showStars = true,
  sound,
  octaveClef = false,
  lowCard = false,
}: {
  cards: Card[];
  /** The deck reads with the treble clef's small 8 (a tenor's range). */
  octaveClef?: boolean;
  /** The deck is drawn on the low card (an alto's range reaches G3). */
  lowCard?: boolean;
  /** A dialog is open over the session: nothing answers. */
  paused?: boolean;
  save: (fx: Effect, answered: readonly Answered[]) => Promise<CompleteOutcome>;
  /** The title once the session is over and saving or saved. */
  doneTitle: string;
  /** Where the sign-in link comes back to. */
  returnTo: string;
  stars?: boolean;
  /** How the learner's notes are voiced (the lesson's sound); the synth when absent. */
  sound?: PlayOptions;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const input = useLearnStore((s) => s.profile?.input ?? 'screen');
  const session = useQuestionSession<Card, Answer>({
    machine: () => createFlashcardsMachine(cards, () => getPracticeMode() === 'learning'),
    save,
    paused,
  });
  const { lesson, total, answer, answerGroup } = session;
  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  // A session with sharps, flats or key cards asks for the sign as well as the letter (fixed for the whole session).
  const needsSigns = cards.some(isSpelledCard);
  // A session of grand-staff cards: the empty card box before the first card takes the grand card's height.
  const grandCards = cards.some((c) => c.grand === true);
  // The sign chosen for the question on screen; a new question (or a retry) starts at natural.
  const askKey = lesson.kind === 'asking' ? `${lesson.index}:${lesson.misses ?? 0}` : null;
  const [pick, setPick] = useState<{ key: string | null; sign: -1 | 0 | 1 }>({ key: null, sign: 0 });
  const sign: -1 | 0 | 1 = needsSigns && pick.key === askKey ? pick.sign : 0;
  const choose = (value: -1 | 0 | 1) => {
    if (askKey === null) return;
    // Choosing the same sign again takes it back to natural.
    setPick({ key: askKey, sign: sign === value ? 0 : value });
  };
  const chooseRef = useRef(choose);
  const signRef = useRef(sign);
  useEffect(() => {
    chooseRef.current = choose;
    signRef.current = sign;
  });
  const phases = useInputPhases();
  useNoteSound(!paused, sound);
  useLessonInputStart();

  const needsDevice = input === 'mic' || input === 'midi';
  const inputOn = !needsDevice || phases[input] === 'active';
  const keysPlayNotes = input === 'keys' || phases.keys === 'active';

  useNoteEvents((e) => {
    if (e.type !== 'on') return;
    if (e.source === 'keys' || e.source === 'mic') {
      answer(
        needsSigns
          ? // Sharps, flats and keys: any note, white or black, judged by its pitch class (no octave is known).
            { kind: 'pitch-class', pc: mod12(e.midi) }
          : isSharp(e.midi)
            ? {
                kind: 'midi',
                midi: e.midi,
              }
            : {
                kind: 'letter',
                letter: noteLetter(e.midi),
              },
      );
    } else {
      answer({
        kind: 'midi',
        midi: e.midi,
      });
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
      // `#` picks sharp and `-` picks flat when the session asks for the sign (again to take it back).
      if (e.key === '#' || e.key === '-') {
        if (!needsSigns) return;
        e.preventDefault();
        chooseRef.current(e.key === '#' ? 1 : -1);
        return;
      }
      const letter = e.key.toUpperCase();
      if (!(LETTERS as readonly string[]).includes(letter)) return;
      answerRef.current({
        kind: 'letter',
        letter,
        ...(needsSigns ? { accidental: signRef.current } : {}),
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [keysPlayNotes, needsSigns]);

  const card = session.card;
  const cardState: StaffCardState = cardStateOf(session);

  const title = sessionTitle(
    session,
    inSession
      ? t('flash-card-count', {
          n: lesson.index + 1,
          total,
          defaultValue: 'Card {{n}} of {{total}}',
        })
      : '',
    doneTitle,
    t('lesson-not-saved', {
      defaultValue: 'Not saved yet',
    }),
  );
  const hint = needsSigns
    ? t('flash-hint-signs', {
        defaultValue: 'Choose ♭, ♮ or ♯, then tap its letter, or play it.',
      })
    : input === 'keys'
      ? t('flash-hint-keys', {
          defaultValue: 'Tap its letter, or play it on your computer keys.',
        })
      : input === 'midi'
        ? t('flash-hint-midi', {
            defaultValue: 'Tap its letter, or play it on your MIDI controller.',
          })
        : input === 'mic'
          ? t('flash-hint-mic', {
              defaultValue: 'Tap its letter, or play or sing it.',
            })
          : t('flash-hint-screen', {
              defaultValue: 'Tap its letter, or play it on the piano below.',
            });

  // The sentence line: the hint while asking; after a wrong answer what was played against the
  // right note (with how far off it sits on the staff); the score at the end.
  let line: ReactNode = '';
  let lineKey = 'hint';
  // The sentences of a wrong answer, one string each (the live region reads them as they are).
  let missParts: string[] = [];
  let miss: Miss | null = null;
  if (lesson.kind === 'asking') {
    line = hint;
  } else if (lesson.kind === 'feedback') {
    lineKey = `fb-${lesson.index}-${lesson.misses ?? 0}`;
    if (!lesson.right) {
      const c = lesson.cards[lesson.index];
      // A black key played for a card spelled with flats is drawn as a flat, the card's own spelling.
      miss = describeMiss(c.midi, lesson.answer, { written: cardWritten(c), spell: cardAlteration(c) < 0 ? -1 : 1 });
      missParts = wrongAnswerSentences(t, c, miss, lesson.answer);
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
    line = t('flash-score', {
      correct: lesson.correct,
      total,
      count: Number(total),
      defaultValue_one: 'You named {{correct}} of {{total}} note.',
      defaultValue: 'You named {{correct}} of {{total}} notes.',
    });
  }

  // What a screen reader hears once a card is answered, the next card when it is dealt (its
  // visible title, "Card 2 of 10"), and the score at the end.
  const said: ReactNode =
    lesson.kind === 'feedback' ? (
      lesson.right ? (
        t('flash-right-sr', {
          note: answerName(lesson.answer),
          defaultValue: 'Right: {{note}}.',
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

  // The letter a note is WRITTEN on (a B♭ is a B), so the right tile is the one the card is spelled with.
  const correctLetter = lesson.kind === 'feedback' ? cardLetter(lesson.cards[lesson.index]) : null;
  const givenLetter = lesson.kind === 'feedback' && lesson.answer.kind === 'letter' ? lesson.answer.letter : null;
  // After an answer the sign row shows what the card needed and, on a letter answer, what was chosen.
  const correctSign = lesson.kind === 'feedback' ? cardAlteration(lesson.cards[lesson.index]) : null;
  const givenSign =
    lesson.kind === 'feedback' && lesson.answer.kind === 'letter' ? (lesson.answer.accidental ?? 0) : null;

  let answers: ReactNode;
  if (!inSession) {
    const stars = lesson.kind === 'saved' ? lesson.stars : starsFor(scoreFrom(lesson.correct, total));
    answers = (
      <LessonResult
        kind={lesson.kind}
        stars={showStars ? stars : null}
        returnTo={returnTo}
        onRetry={session.retry}
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
          <p className="text-sm leading-6 text-app-text-muted">
            {t('flash-keys-region', {
              defaultValue: 'Your computer keys are a piano: A, S, D, F, G, H, J and K play C, D, E, F, G, A, B and C.',
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
          ref={answerGroup}
          role="group"
          aria-label={t('flash-letters', {
            defaultValue: 'Note names',
          })}
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
                onClick={() =>
                  answer({
                    kind: 'letter',
                    letter,
                    ...(needsSigns ? { accidental: sign } : {}),
                  })
                }
                className={cn(
                  'rmm-display flex h-full min-h-9 min-w-0 items-center justify-center rounded-app-sm border text-[1.375rem] leading-none transition-colors',
                  asking
                    ? 'border-app-border-bright text-app-text'
                    : isCorrect
                      ? 'border-app-accent text-app-accent'
                      : isGiven
                        ? 'rmm-flash__struck border-app-border text-app-text-dim'
                        : 'border-app-border text-app-text-dim',
                )}
              >
                {letter}
              </button>
            );
          })}
        </div>
        {needsSigns ? (
          <div
            role="group"
            aria-label={t('flash-signs', {
              defaultValue: 'Sharp, flat or natural',
            })}
            className="rmm-flash__signs"
          >
            {SIGNS.map(({ value, glyph }) => {
              const picked = asking ? sign === value : givenSign === value;
              const isCorrect = !asking && correctSign === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-label={
                    value > 0
                      ? t('flash-sign-sharp', { defaultValue: 'Sharp' })
                      : value < 0
                        ? t('flash-sign-flat', { defaultValue: 'Flat' })
                        : t('flash-sign-natural', { defaultValue: 'Natural' })
                  }
                  aria-pressed={picked}
                  aria-keyshortcuts={value > 0 ? '#' : value < 0 ? '-' : undefined}
                  aria-disabled={!asking || undefined}
                  onClick={() => choose(value)}
                  className={cn(
                    'rmm-display flex h-full min-h-9 min-w-0 items-center justify-center rounded-app-sm border text-[1.375rem] leading-none transition-colors',
                    asking
                      ? picked
                        ? 'border-app-accent text-app-accent'
                        : 'border-app-border-bright text-app-text'
                      : isCorrect
                        ? 'border-app-accent text-app-accent'
                        : picked
                          ? 'rmm-flash__struck border-app-border text-app-text-dim'
                          : 'border-app-border text-app-text-dim',
                  )}
                >
                  {glyph}
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="rmm-input-region">{region}</div>
      </>
    );
  }

  return (
    <SessionFrame className="rmm-flash space-y-4">
      <PracticeModeToggle />
      <SessionSheet
        session={session}
        title={title}
        question={
          card ? (
            <StaffCard
              card={card}
              announcePlace
              octaveClef={octaveClef}
              range={lowCard ? 'low' : 'deck'}
              state={cardState}
              played={
                miss
                  ? ({ midi: miss.midi, written: miss.written, accidental: miss.accidental } satisfies PlayedNote)
                  : null
              }
            />
          ) : (
            <div aria-hidden="true" className={STAFF_BOX}>
              <div
                className={cn(
                  grandCards ? STAFF_GRAND_ASPECT : lowCard ? STAFF_LOW_ASPECT : 'aspect-[200/102]',
                  'w-full',
                )}
              />
              <div className="h-9" />
            </div>
          )
        }
        line={line}
        lineKey={lineKey}
        said={said}
        retry={lesson.kind === 'feedback' && !lesson.right && getPracticeMode() === 'learning'}
      />
      <div ref={session.answersBox} className={cn('rmm-flash__answers', needsSigns && 'rmm-flash__answers--signs')}>
        {answers}
      </div>
    </SessionFrame>
  );
}
