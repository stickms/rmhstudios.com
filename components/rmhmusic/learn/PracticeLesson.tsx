/**
 * PracticeLesson — `/rmhmusic/practice`: a flashcard session over the learner's remembered cards.
 * It deals the cards that are due, most overdue first, topped up to ten with cards never asked
 * before from the shipped reading lessons' decks (`buildPracticeSession`), and runs the same
 * screen as a reading lesson (`FlashcardSession`, `flashcardsMachine`, unchanged).
 *
 * When the session ends it posts one review per card — `good` for a right answer, `again` for a
 * wrong one, no timers — and the server schedules each card with its own clock. Practice
 * completes no lesson and pays no XP or stars, so there is nothing to farm: its result is the
 * sentence saying how many notes were named. A failed post keeps the result on screen with Retry
 * (which posts the same reviews again), a sign-out with a sign-in link back here.
 *
 * The session is dealt once, when both the profile (for the input) and the cards have loaded, and
 * then held, so a later change to the stored cards (this session's own save) never re-deals it.
 */

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Card } from '@/lib/rmhmusic/learn/content/decks';
import {
  buildPracticeSession,
  practiceDecks,
  stateFromRow,
} from '@/lib/rmhmusic/learn/content/practice';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
} from './buttons';
import {
  FlashcardSession,
  type Answered,
} from './FlashcardLesson';
import { InputSetup } from './InputSetup';
import {
  FlashcardSkeleton,
  Shell,
} from './LessonScreen';
import { useInputRelease } from './useLearnInput';
import { useArrival } from '@/components/ui/arrive';

const RETURN_TO =
  '/rmhmusic/practice';

/** What a finished session posts: one review per card, in the order they were asked. */
function reviewsOf(
  answered: readonly Answered[],
) {
  return answered.map(
    (
      a,
    ) => ({
      cardId:
        a
          .card
          .id,
      grade:
        a.right
          ? ('good' as const)
          : ('again' as const),
    }),
  );
}

function Practice({
  cards,
  paused,
}: {
  cards: Card[];
  paused: boolean;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  return (
    <FlashcardSession
      cards={
        cards
      }
      paused={
        paused
      }
      save={(
        _fx,
        answered,
      ) =>
        useLearnStore
          .getState()
          .saveReviews(
            reviewsOf(
              answered,
            ),
          )
      }
      doneTitle={t(
        'practice-done',
        {
          defaultValue:
            'Practice done',
        },
      )}
      returnTo={
        RETURN_TO
      }
      stars={
        false
      }
    />
  );
}

export function PracticeLesson() {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  const status =
    useLearnStore(
      (
        s,
      ) =>
        s.status,
    );
  const error =
    useLearnStore(
      (
        s,
      ) =>
        s.error,
    );
  const cardsStatus =
    useLearnStore(
      (
        s,
      ) =>
        s.cardsStatus,
    );
  const [
    setupOpen,
    setSetupOpen,
  ] =
    useState(
      false,
    );
  const setupButton =
    useRef<HTMLButtonElement>(
      null,
    );
  useInputRelease();

  // Dealt once (see the header). Until then null; an empty deal means nothing is due or new.
  const [
    session,
    setSession,
  ] =
    useState<
      | Card[]
      | null
    >(
      null,
    );
  if (
    session ===
      null &&
    status ===
      'ready' &&
    cardsStatus ===
      'ready'
  ) {
    const rows =
      useLearnStore
        .getState()
        .cards.map(
          (
            r,
          ) => ({
            cardId:
              r.cardId,
            state:
              stateFromRow(
                r,
              ),
          }),
        );
    setSession(
      buildPracticeSession(
        rows,
        practiceDecks(),
        Date.now(),
        Math.random,
      ),
    );
  }

  useEffect(() => {
    const store =
      useLearnStore.getState();
    void store.load();
    void store.loadCards();
  }, []);

  const signIn =
    (
      <div
        role="alert"
        className="rmm-sheet space-y-3 p-5"
      >
        <p className="text-app-text">
          {t(
            'error-signed-out',
            {
              defaultValue:
                'Your session ended. Sign in again to continue.',
            },
          )}
        </p>
        <Link
          to="/login"
          search={{
            callbackURL:
              RETURN_TO,
          }}
          className={
            PRIMARY_BUTTON
          }
        >
          {t(
            'sign-in',
            {
              defaultValue:
                'Sign in',
            },
          )}
        </Link>
      </div>
    );

  let body: ReactNode;
  let loading = false;
  if (
    session !==
      null &&
    session.length >
      0
  ) {
    body =
      (
        <Practice
          cards={
            session
          }
          paused={
            setupOpen
          }
        />
      );
  } else if (
    session !==
    null
  ) {
    body =
      (
        <div className="rmm-sheet space-y-3 p-5">
          <p className="text-app-text-muted">
            {t(
              'practice-nothing-due',
              {
                defaultValue:
                  'Nothing to practise right now. Come back when a card is due.',
              },
            )}
          </p>
          <Link
            to="/rmhmusic"
            className={
              PRIMARY_BUTTON
            }
          >
            {t(
              'lesson-back-to-path',
              {
                defaultValue:
                  'Back to your lessons',
              },
            )}
          </Link>
        </div>
      );
  } else if (
    (status ===
      'error' &&
      error ===
        'unauthorized') ||
    cardsStatus ===
      'unauthorized'
  ) {
    body =
      signIn;
  } else if (
    status ===
      'error' ||
    cardsStatus ===
      'load_failed'
  ) {
    body =
      (
        <div
          role="alert"
          className="rmm-sheet space-y-3 p-5"
        >
          <p className="text-app-text">
            {t(
              'practice-load-failed',
              {
                defaultValue:
                  "Couldn't load your practice cards.",
              },
            )}
          </p>
          <button
            type="button"
            onClick={() => {
              const store =
                useLearnStore.getState();
              void store.load();
              void store.loadCards();
            }}
            className={
              PRIMARY_BUTTON
            }
          >
            {t(
              'retry',
              {
                defaultValue:
                  'Try again',
              },
            )}
          </button>
        </div>
      );
  } else {
    loading = true;
    body =
      (
        <FlashcardSkeleton />
      );
  }
  const arrival =
    useArrival(
      !loading,
    );

  const ready =
    session !==
      null &&
    session.length >
      0;
  return (
    <Shell
      title={t(
        'practice',
        {
          defaultValue:
            'Practice',
        },
      )}
      busy={
        session ===
          null &&
        status !==
          'error' &&
        cardsStatus !==
          'load_failed'
      }
      action={
        // As in a lesson: always in the header so nothing moves, hidden (and inert) until the
        // session is on screen. Icon-only under 400px.
        <div
          className={
            ready
              ? undefined
              : 'invisible'
          }
          inert={
            !ready ||
            undefined
          }
        >
          <button
            ref={
              setupButton
            }
            type="button"
            onClick={() =>
              setSetupOpen(
                true,
              )
            }
            aria-label={t(
              'change-input',
              {
                defaultValue:
                  'Change input',
              },
            )}
            className={`${SECONDARY_BUTTON} min-w-11 max-[399px]:px-0`}
          >
            <SlidersHorizontal
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            />
            <span
              aria-hidden="true"
              className="max-[399px]:hidden"
            >
              {t(
                'change-input',
                {
                  defaultValue:
                    'Change input',
                },
              )}
            </span>
          </button>
        </div>
      }
    >
      <div
        className={
          arrival
        }
      >
        {
          body
        }
      </div>
      <InputSetup
        open={
          setupOpen
        }
        onOpenChange={
          setSetupOpen
        }
        returnFocus={
          setupButton
        }
      />
    </Shell>
  );
}
