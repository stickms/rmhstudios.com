/**
 * The parts every ten-question lesson shares — the flashcards (FlashcardSession: name the note on
 * the staff) and the note finder (FindNoteLesson: find it on the keys or the fretboard) — so both
 * run the same lifecycle, keep the same fixed boxes and treat focus and the keyboard the same way.
 *
 * - `useQuestionSession` holds the session machine (`machines/session.ts`): `answer`, `next` and
 *   `retry` send its events, its `complete` effect is saved through the caller's `save` (once per
 *   attempt; Retry saves again), each question's result is recorded on Next, and the last question
 *   is kept for the result screen. Focus follows the learner: after an answer given from the
 *   answer controls (or with nothing focused) it moves to Next; after Next it goes back to the
 *   answer controls (`focusFirst` inside `answerGroup`); once the session is over, to the result's
 *   first control (`answersBox`) — so a keyboard user never lands on <body>.
 * - `SessionSheet` is the question's sheet: the title line, the question itself (a staff card),
 *   and the sentence line with Next, which is always mounted (hidden and inert until a question is
 *   answered) so the line never reflows; plus the polite live region.
 * - `SessionFrame` cancels a held Enter's repeats: focus hops answer → Next → answer as questions
 *   go by, so a repeat must not activate whatever it lands on (`key-repeat.ts`).
 */

import { useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { isHeldOnControl } from '@/lib/rmhmusic/learn/input/key-repeat';
import { releaseMic } from '@/lib/rmhmusic/learn/input/mic-lifecycle';
import type { CompleteOutcome } from '@/lib/rmhmusic/learn/machines/learn-data';
import type { Machine } from '@/lib/rmhmusic/learn/machines/runner';
import type {
  SessionEffect,
  SessionEvent,
  SessionState,
} from '@/lib/rmhmusic/learn/machines/session';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { cn } from '@/lib/utils';
import { PRIMARY_BUTTON } from './buttons';
import { useMachine } from './useMachine';

/** One question of a finished session and whether it was answered right. */
export interface AnsweredQuestion<C> {
  card: C;
  right: boolean;
}

export interface QuestionSession<
  C,
  A,
  S extends SessionState<C, A> = SessionState<C, A>,
  X = never,
> {
  lesson: S;
  /** The question on screen, or once the session is over the last one answered. */
  card: C | null;
  /** Whether that last question was right (meaningful once the session is over). */
  lastRight: boolean;
  inSession: boolean;
  /** Questions in the session. */
  total: number;
  answer: (a: A) => void;
  next: () => void;
  retry: () => void;
  /** Send one of the machine's own events (the pitch match's `hear`). */
  send: (e: X) => void;
  /** True once the learner has moved on by Next or Retry: only then is a new question announced. */
  announce: boolean;
  nextButton: RefObject<HTMLButtonElement | null>;
  /** The box holding the answer controls; focus returns into it after Next. */
  answerGroup: RefObject<HTMLDivElement | null>;
  /** The box below the sheet: the answers, then the result, whose first control takes focus. */
  answersBox: RefObject<HTMLDivElement | null>;
}

/**
 * `S`, `X` and `F` let a machine whose states extend the session's (the pitch match: tries and
 * points) add its own events (`X`, sent with `send`) and effects (`F`, handed to `onEffect`); the
 * defaults are the plain session machine.
 */
export function useQuestionSession<
  C,
  A,
  S extends SessionState<C, A> = SessionState<C, A>,
  X = never,
  F extends { type: string } = never,
>({
  machine: makeMachine,
  save,
  paused,
  focusFirst = 'button',
  onEffect,
}: {
  /** Called once, on mount. */
  machine: () => Machine<S, SessionEvent<A> | X, SessionEffect | F>;
  save: (fx: SessionEffect, answered: readonly AnsweredQuestion<C>[]) => Promise<CompleteOutcome>;
  paused: boolean;
  /** The control inside `answerGroup` that takes focus after Next. */
  focusFirst?: string;
  /** Carries out the machine's own effects (anything but `complete`). */
  onEffect?: (fx: F) => void;
}): QuestionSession<C, A, S, X> {
  const hub = useLearnStore((s) => s.hub);
  const [machine] = useState(makeMachine);
  const [state, send] = useMachine(machine);
  // Read through the session's own union, which `S` extends, so the checks below narrow it.
  const lesson: SessionState<C, A> = state;
  // Every question's result by its index, written on Next (once per question: the machine leaves
  // `feedback` on the first Next, and a repeat rewrites the same slot).
  const answered = useRef<AnsweredQuestion<C>[]>([]);
  const [last, setLast] = useState<AnsweredQuestion<C> | null>(null);
  const [announce, setAnnounce] = useState(false);
  const nextButton = useRef<HTMLButtonElement>(null);
  const answerGroup = useRef<HTMLDivElement>(null);
  const answersBox = useRef<HTMLDivElement>(null);
  const movedOn = useRef(false);

  const perform = (effects: (SessionEffect | F)[]) => {
    for (const fx of effects) {
      if (!isComplete(fx)) {
        onEffect?.(fx);
        continue;
      }
      // The session is over: the result needs no microphone.
      if (hub) releaseMic(hub);
      void save(fx, answered.current.filter(Boolean)).then((outcome) =>
        perform(send({ type: 'answered', attempt: fx.attempt, outcome })),
      );
    }
  };

  const answer = (a: A) => {
    if (paused) return;
    perform(send({ type: 'answer', answer: a }));
  };

  const next = () => {
    if (lesson.kind === 'feedback') {
      const result = { card: lesson.cards[lesson.index], right: lesson.right };
      answered.current[lesson.index] = result;
      setLast(result);
    }
    movedOn.current = true;
    setAnnounce(true);
    perform(send({ type: 'next' }));
  };

  const retry = () => {
    setAnnounce(true);
    perform(send({ type: 'retry' }));
  };

  const sendOwn = (e: X) => {
    if (paused) return;
    perform(send(e));
  };

  // Next is inert and hidden in the same commit that leaves `feedback`, but the browser has not yet
  // moved focus off it when this runs, so focus on Next (or inside any inert subtree) counts as
  // nowhere.
  const index = lesson.kind === 'asking' || lesson.kind === 'feedback' ? lesson.index : -1;
  useLayoutEffect(() => {
    const active = document.activeElement;
    const nowhere =
      !active ||
      active === document.body ||
      (lesson.kind !== 'feedback' &&
        (active === nextButton.current || active.closest('[inert]') !== null));
    if (lesson.kind === 'feedback') {
      if (nowhere || answerGroup.current?.contains(active)) {
        nextButton.current?.focus({ preventScroll: true });
      }
    } else if (lesson.kind === 'asking' && movedOn.current) {
      movedOn.current = false;
      if (nowhere) {
        answerGroup.current?.querySelector<HTMLElement>(focusFirst)?.focus({ preventScroll: true });
      }
    } else if (lesson.kind !== 'asking' && nowhere) {
      // The session is over (saving, saved, failed, signed out): the result's first control —
      // Back to your lessons, Try again or Sign in — rather than <body>, as each block replaces
      // the last.
      answersBox.current
        ?.querySelector<HTMLElement>('a[href], button')
        ?.focus({ preventScroll: true });
    }
  }, [lesson.kind, index, focusFirst]);

  const inSession = lesson.kind === 'asking' || lesson.kind === 'feedback';
  return {
    lesson: state,
    card: inSession ? (lesson.cards[lesson.index] ?? null) : (last?.card ?? null),
    lastRight: last?.right ?? false,
    inSession,
    total: inSession ? lesson.cards.length : lesson.total,
    answer,
    next,
    retry,
    send: sendOwn,
    announce,
    nextButton,
    answerGroup,
    answersBox,
  };
}

function isComplete<F extends { type: string }>(fx: SessionEffect | F): fx is SessionEffect {
  return fx.type === 'complete';
}

/** The question's state as its staff card shows it. */
export function cardStateOf<C, A>(s: QuestionSession<C, A>): 'ask' | 'right' | 'wrong' {
  const { lesson } = s;
  if (lesson.kind === 'asking') return 'ask';
  if (lesson.kind === 'feedback') return lesson.right ? 'right' : 'wrong';
  return s.lastRight ? 'right' : 'wrong';
}

/** The title line: "<count>" while in session, then the done title or "Not saved yet". */
export function sessionTitle<C, A>(
  s: QuestionSession<C, A>,
  count: string,
  doneTitle: string,
  notSaved: string,
): string {
  if (s.inSession) return count;
  return s.lesson.kind === 'saved' || s.lesson.kind === 'saving' ? doneTitle : notSaved;
}

export function SessionSheet<C, A>({
  session,
  title,
  question,
  line,
  lineKey,
  said,
}: {
  session: QuestionSession<C, A>;
  title: string;
  /** The question: a staff card of a fixed box. */
  question: ReactNode;
  /** The sentence beside Next: a hint, what went wrong, or the score. */
  line: string;
  /** Changes when the sentence stands for a new thing, so it is replaced rather than edited. */
  lineKey: string;
  /** What the live region says: a string, or {@link SaidParts} for several sentences. */
  said: ReactNode;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const { lesson } = session;
  const feedback = lesson.kind === 'feedback';
  return (
    <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
      {/* Minimum heights, not clamps: one line and two lines at the normal size (so nothing moves),
          and more at large text, where a clamp would cut the count and the instruction off. */}
      <h2 className="rmm-display min-h-8 text-2xl leading-8 text-app-text">
        <span
          key={
            lesson.kind === 'asking' || lesson.kind === 'feedback'
              ? `card-${lesson.index}`
              : lesson.kind
          }
        >
          {title}
        </span>
      </h2>
      {question}
      {/* Wraps so that at large text Next drops below the sentence instead of squeezing it to a
          word a line; at the normal size the sentence's 7rem basis plus Next always fits. */}
      <div className="flex min-h-11 flex-wrap items-center gap-3">
        <div className="flex min-h-10 min-w-0 flex-[1_1_7rem] items-center justify-center">
          <p key={lineKey} className="text-sm leading-5 break-words text-app-text-muted">
            {line}
          </p>
        </div>
        {/* Not laid out (and inert) until a question is answered, so the hint has the whole row:
            a hidden-but-reserved Next left it 140px on a 320px phone and cut it to two lines. */}
        <button
          ref={session.nextButton}
          type="button"
          onClick={session.next}
          inert={!feedback || undefined}
          className={cn(PRIMARY_BUTTON, !feedback && 'hidden')}
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
  );
}

/**
 * Several sentences for the live region, each its own element. They are never joined into one
 * string with punctuation of ours ("Question 1 of 4. How many…"): each is a translated sentence on
 * its own, and a language chooses its own stops (and an RTL or CJK one does not use ". ").
 */
export function SaidParts({ parts }: { parts: readonly string[] }) {
  return (
    <>
      {parts
        .filter((part) => part !== '')
        .map((part, i) => (
          <span key={i} className="block">
            {part}
          </span>
        ))}
    </>
  );
}

/** The session's wrapper: cancels a repeating Enter that bubbled up from a button or a link. */
export function SessionFrame({ className, children }: { className: string; children: ReactNode }) {
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (isHeldOnControl({ key: e.key, repeat: e.repeat, target: e.target as HTMLElement })) {
      e.preventDefault();
    }
  };
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- cancels a repeating Enter that bubbled up from a button; the wrapper is not itself interactive
    <div className={className} onKeyDown={onKeyDown}>
      {children}
    </div>
  );
}
