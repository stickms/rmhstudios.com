/**
 * PracticeLesson — `/rmhmusic/practice`: a flashcard session over the learner's remembered cards.
 * It deals the cards that are due, most overdue first, topped up to ten with cards never asked
 * before from the shipped reading lessons' decks of the learner's path (`buildPracticeSession`;
 * a singer's is their range's deck, drawn as the range reads it, a tenor's with the treble 8), and
 * runs the same screen as a reading lesson (`FlashcardSession`, `flashcardsMachine`, unchanged).
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
  useLayoutEffect,
  useMemo,
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
  isVoiceRange,
  staffCardRange,
  voiceReading,
} from '@/lib/rmhmusic/learn/voice/range';
import { beginSoundSession } from '@/lib/rmhmusic/learn/audio/instruments/engine';
import type { PlayOptions } from '@/lib/rmhmusic/learn/audio/voice';
import { useLearnerSound } from './SoundDialog';
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
  octaveClef,
  lowCard,
}: {
  cards: Card[];
  paused: boolean;
  /** A tenor's cards: the treble clef with the small 8 (sounding an octave below the page). */
  octaveClef: boolean;
  /** An alto's cards: the low card (the range reaches G3). */
  lowCard: boolean;
}) {
  const {
    t,
  } =
    useTranslation(
      'c-rmhmusic',
    );
  // The learner's sound, in its own sound session (as a lesson: loading, then samples or the tone).
  const soundId =
    useLearnerSound();
  const sound =
    useMemo<PlayOptions>(
      () => ({
        instrument:
          soundId,
      }),
      [
        soundId,
      ],
    );
  // Before the session's own effects can sound anything (see LessonScreen).
  useLayoutEffect(
    () =>
      beginSoundSession(
        soundId,
      ),
    [
      soundId,
    ],
  );
  return (
    <FlashcardSession
      cards={
        cards
      }
      octaveClef={
        octaveClef
      }
      lowCard={
        lowCard
      }
      paused={
        paused
      }
      sound={
        sound
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
    octaveClef,
    setOctaveClef,
  ] =
    useState(
      false,
    );
  const [
    lowCard,
    setLowCard,
  ] =
    useState(
      false,
    );
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
    // A singer practises their range's deck, read the way their range reads (a tenor's 8).
    const profile =
      useLearnStore.getState()
        .profile;
    const range =
      profile?.instrument ===
        'voice' &&
      isVoiceRange(
        profile.voiceRange,
      )
        ? profile.voiceRange
        : null;
    setOctaveClef(
      range !==
        null &&
        voiceReading(
          range,
        )
          .octaveClef,
    );
    setLowCard(
      range !==
        null &&
        staffCardRange(
          range,
        ) ===
          'low',
    );
    setSession(
      buildPracticeSession(
        rows,
        practiceDecks(
          profile?.instrument,
          range,
        ),
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
          octaveClef={
            octaveClef
          }
          lowCard={
            lowCard
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
