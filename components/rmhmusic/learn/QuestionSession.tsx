'use client';

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
import { isHeldActivation } from '@/lib/rmhmusic/learn/input/key-repeat';
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

export interface QuestionSession<C, A> {
  lesson: SessionState<C, A>;
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
  /** True once the learner has moved on by Next or Retry: only then is a new question announced. */
  announce: boolean;
  nextButton: RefObject<HTMLButtonElement | null>;
  /** The box holding the answer controls; focus returns into it after Next. */
  answerGroup: RefObject<HTMLDivElement | null>;
  /** The box below the sheet: the answers, then the result, whose first control takes focus. */
  answersBox: RefObject<HTMLDivElement | null>;
}

export function useQuestionSession<C, A>({
  machine: makeMachine,
  save,
  paused,
  focusFirst = 'button',
}: {
  /** Called once, on mount. */
  machine: () => Machine<SessionState<C, A>, SessionEvent<A>, SessionEffect>;
  save: (fx: SessionEffect, answered: readonly AnsweredQuestion<C>[]) => Promise<CompleteOutcome>;
  paused: boolean;
  /** The control inside `answerGroup` that takes focus after Next. */
  focusFirst?: string;
}): QuestionSession<C, A> {
  const hub = useLearnStore((s) => s.hub);
  const [machine] = useState(makeMachine);
  const [lesson, send] = useMachine(machine);
  // Every question's result by its index, written on Next (once per question: the machine leaves
  // `feedback` on the first Next, and a repeat rewrites the same slot).
  const answered = useRef<AnsweredQuestion<C>[]>([]);
  const [last, setLast] = useState<AnsweredQuestion<C> | null>(null);
  const [announce, setAnnounce] = useState(false);
  const nextButton = useRef<HTMLButtonElement>(null);
  const answerGroup = useRef<HTMLDivElement>(null);
  const answersBox = useRef<HTMLDivElement>(null);
  const movedOn = useRef(false);

  const perform = (effects: SessionEffect[]) => {
    for (const fx of effects) {
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
    lesson,
    card: inSession ? (lesson.cards[lesson.index] ?? null) : (last?.card ?? null),
    lastRight: last?.right ?? false,
    inSession,
    total: inSession ? lesson.cards.length : lesson.total,
    answer,
    next,
    retry,
    announce,
    nextButton,
    answerGroup,
    answersBox,
  };
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
  /** What the live region says. */
  said: string;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const { lesson } = session;
  const feedback = lesson.kind === 'feedback';
  return (
    <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
      <h2
        title={title}
        className="rmm-display line-clamp-1 h-8 text-2xl leading-8 text-(--app-text)"
      >
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
        {/* Always here so the line never reflows; hidden (and inert) until a question is answered. */}
        <button
          ref={session.nextButton}
          type="button"
          onClick={session.next}
          inert={!feedback || undefined}
          className={cn(PRIMARY_BUTTON, !feedback && 'invisible')}
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

/** The session's wrapper: cancels a repeating Enter that bubbled up from a button. */
export function SessionFrame({ className, children }: { className: string; children: ReactNode }) {
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (isHeldActivation(e.nativeEvent) && (e.target as HTMLElement).closest('button')) {
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
