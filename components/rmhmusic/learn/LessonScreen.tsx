'use client';

/**
 * LessonScreen — the page around one lesson (`/rmhmusic/lesson/<id>`): a way back to the path,
 * "Change input", and the activity for the lesson's mode (see `isPlayable`), each behind a
 * placeholder of exactly its own boxes. An unknown or unshipped lesson gets a friendly "not
 * available yet" page with a link home, never a crash or a blank. A document (`.app-page`).
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getLesson } from '@/lib/rmhmusic/learn/content/path';
import { isPlayable } from '@/lib/rmhmusic/learn/content/routing';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './buttons';
import { EarLesson, EarListenBox } from './EarLesson';
import { FirstNoteLesson } from './FirstNoteLesson';
import { FindNoteLesson, FindNoteStaffBox } from './FindNoteLesson';
import { FlashcardLesson } from './FlashcardLesson';
import { InputSetup } from './InputSetup';
import { MatchNoteLesson, MatchStaffBox } from './MatchNoteLesson';
import { ModeToggle } from './ModeToggle';
import { ChordNameBox, PlayChordLesson } from './PlayChordLesson';
import { RhythmLesson } from './RhythmLesson';
import { STAFF_BOX } from './StaffCard';
import { useInputRelease } from './useLearnInput';

export function Shell({
  title,
  action,
  busy = false,
  children,
}: {
  title: string;
  action?: ReactNode;
  /** The lesson is still loading: the main region says so to screen readers. */
  busy?: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation('c-rmhmusic');
  return (
    <div className="app-page">
      <div className="rmm-column mx-auto flex w-full max-w-3xl flex-1 flex-col pr-[max(1.25rem,var(--safe-right))] pl-[max(1.25rem,var(--safe-left))]">
        {/* With large text the toggle and "Change input" wrap below the back link (kept at the
            end), and below each other if they must, rather than widen the page. */}
        <header className="flex flex-wrap items-center justify-between gap-2 pt-[calc(0.5rem+var(--safe-top))]">
          <Link
            to="/rmhmusic"
            className="-ms-3 flex min-h-11 min-w-0 items-center gap-1.5 rounded-(--app-radius-sm) px-3 text-sm font-medium text-(--app-text-muted) transition-colors hover:text-(--app-text)"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 rtl-flip" aria-hidden="true" />
            <span>{t('back-to-lessons', { defaultValue: 'Back to lessons' })}</span>
          </Link>
          <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            <ModeToggle />
            {action}
          </div>
        </header>
        <main
          aria-busy={busy || undefined}
          className="flex-1 space-y-4 pt-4 pb-[calc(2rem+var(--safe-bottom))]"
        >
          {busy && (
            <p role="status" className="sr-only">
              {t('loading-lesson', { defaultValue: 'Loading the lesson…' })}
            </p>
          )}
          <h1 className="rmm-display text-[2.25rem] leading-[2.75rem] break-words text-(--app-text) sm:text-[2.75rem] sm:leading-[3.25rem]">
            {title}
          </h1>
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * The loading placeholder: the same boxes as the lesson — the instruction page (title line, a
 * three-line hint, the staff) and the input region (`.rmm-input-region`), which the lesson keeps
 * the same size for every input and every state — so loading → loaded → done moves nothing.
 */
function LessonSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <div className="h-15">
          <div className="app-skeleton mx-auto h-5 w-56 max-w-full" />
        </div>
        <div className="mx-auto w-full max-w-64 pt-2">
          <div className="app-skeleton aspect-[200/132] w-full" />
          <div className="min-h-9" />
        </div>
      </section>
      <div className="rmm-input-region">
        <div className="app-skeleton h-full w-full" />
      </div>
    </div>
  );
}

/**
 * The flashcard lesson's placeholder: its boxes exactly — the card's sheet (title line, the staff
 * and the answer line under it, the sentence line) and below it the letters and the input region
 * (`.rmm-flash__answers`, whose heights the stylesheet fixes for every width).
 */
export function FlashcardSkeleton() {
  return (
    <div aria-hidden="true" className="rmm-flash space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <div className={STAFF_BOX}>
          <div className="app-skeleton aspect-[200/102] w-full" />
          <div className="h-9" />
        </div>
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="rmm-flash__answers">
        <div className="rmm-flash__letters">
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="app-skeleton h-full w-full" />
          ))}
        </div>
        <div className="rmm-input-region">
          <div className="app-skeleton h-full w-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * The note finder's placeholder: its boxes exactly — the target's sheet (title line, the low staff
 * card with its name drawn inside it, the sentence line), then the board and the input line
 * (`.rmm-find__answers`, one height on piano and guitar, so the placeholder needs no instrument).
 */
function FindNoteSkeleton() {
  return (
    <div aria-hidden="true" className="rmm-find space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <FindNoteStaffBox skeleton />
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="rmm-find__answers">
        <div className="rmm-find__board max-[359px]:-mx-2 max-[332px]:-mx-3.5">
          <div className="app-skeleton h-full w-full" />
        </div>
        <div className="rmm-find__device" />
      </div>
    </div>
  );
}

/**
 * The pitch match's placeholder: its boxes exactly — the target's sheet (title line, the staff card,
 * the Hear-it row, the sentence line), then the keys and the input line
 * (`.rmm-match__answers`).
 */
function MatchNoteSkeleton() {
  return (
    <div aria-hidden="true" className="rmm-match space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <MatchStaffBox skeleton />
        <div className="h-11" />
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="rmm-match__answers">
        <div className="rmm-input-region">
          <div className="app-skeleton h-full w-full" />
        </div>
        <div className="rmm-find__device" />
      </div>
    </div>
  );
}

/**
 * The ear lessons' placeholder: their boxes exactly — the listening sheet (title line, the empty
 * staff and the sound row, the sentence line) and the answers box (`.rmm-ear__answers`).
 */
function EarSkeleton() {
  return (
    <div aria-hidden="true" className="rmm-ear space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <EarListenBox skeleton />
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="rmm-ear__answers">
        <div className="app-skeleton h-full w-full" />
      </div>
    </div>
  );
}

/**
 * The chord-playing lesson's placeholder: its boxes exactly — the sheet (title line, the chord's
 * name, the sentence line) and the input region below it.
 */
function PlayChordSkeleton() {
  return (
    <div aria-hidden="true" className="rmm-chord space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <ChordNameBox skeleton />
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="rmm-input-region">
        <div className="app-skeleton h-full w-full" />
      </div>
    </div>
  );
}

/**
 * The rhythm lessons' placeholder: their boxes exactly — the sheet (title line, the 8rem question
 * box, the sentence line) and the 12.5rem answers box (`.rmm-rhythm__answers`). All three rhythm
 * lessons share it.
 */
function RhythmSkeleton() {
  return (
    <div aria-hidden="true" className="rmm-rhythm space-y-4">
      <section className="rmm-sheet space-y-2 p-5 text-center sm:p-6">
        <div className="h-8">
          <div className="app-skeleton mx-auto h-8 w-40" />
        </div>
        <div className="rmm-values">
          <div className="app-skeleton h-full w-full" />
        </div>
        <div className="flex h-11 items-center">
          <div className="app-skeleton h-5 w-56 max-w-full" />
        </div>
      </section>
      <div className="rmm-rhythm__answers">
        <div className="app-skeleton h-full w-full" />
      </div>
    </div>
  );
}

export function LessonScreen({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation('c-rmhmusic');
  const status = useLearnStore((s) => s.status);
  const error = useLearnStore((s) => s.error);
  const [setupOpen, setSetupOpen] = useState(false);
  // Once the lesson has been on screen, it stays: a session that expires (or a save that fails)
  // mid-lesson is the lesson's to show — its result stays up with a sign-in link or Retry — so the
  // store's `unauthorized` must not swap it for the load-time sign-in page and lose the result.
  const [started, setStarted] = useState(false);
  if (status === 'ready' && !started) setStarted(true);
  const setupButton = useRef<HTMLButtonElement>(null);
  // Leaving the screen (any route change) or hiding the tab stops the mic; the screen sees it
  // through the hub's phases (useInputPhases), so nothing here needs to re-render.
  useInputRelease();
  const lesson = getLesson(lessonId);
  const playable = isPlayable(lesson);

  // The store is empty until `load()` runs in the browser (a no-op when the home already loaded it).
  useEffect(() => {
    if (playable) void useLearnStore.getState().load();
  }, [playable]);

  if (!lesson || !playable) {
    return (
      <Shell title={t('lesson-unavailable-title', { defaultValue: 'Not available yet' })}>
        <div className="rmm-sheet space-y-3 p-5">
          <p className="text-(--app-text-muted)">
            {t('lesson-unavailable-body', {
              defaultValue:
                "This lesson isn't ready yet. Pick another one from your learning path.",
            })}
          </p>
          <Link to="/rmhmusic" className={PRIMARY_BUTTON}>
            {t('lesson-back-to-path', { defaultValue: 'Back to your lessons' })}
          </Link>
        </div>
      </Shell>
    );
  }

  let body: ReactNode;
  if (started) {
    body =
      lesson.mode === 'staff-flashcards' ? (
        <FlashcardLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} />
      ) : lesson.mode === 'keyboard-map' || lesson.mode === 'fretboard' ? (
        <FindNoteLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} />
      ) : lesson.mode === 'match-note' ? (
        <MatchNoteLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} />
      ) : lesson.mode === 'ear-interval' || lesson.mode === 'ear-chord' ? (
        <EarLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} />
      ) : lesson.mode === 'play-chord' ? (
        <PlayChordLesson
          key={lesson.id}
          lessonId={lesson.id}
          paused={setupOpen}
          onChangeInput={() => setSetupOpen(true)}
        />
      ) : lesson.mode === 'rhythm-basics' ? (
        <RhythmLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} />
      ) : (
        <FirstNoteLesson key={lesson.id} lessonId={lesson.id} paused={setupOpen} />
      );
  } else if (status === 'error' && error === 'unauthorized') {
    body = (
      <div role="alert" className="rmm-sheet space-y-3 p-5">
        <p className="text-(--app-text)">
          {t('error-signed-out', {
            defaultValue: 'Your session ended. Sign in again to continue.',
          })}
        </p>
        <Link
          to="/login"
          search={{ callbackURL: `/rmhmusic/lesson/${lesson.id}` }}
          className={PRIMARY_BUTTON}
        >
          {t('sign-in', { defaultValue: 'Sign in' })}
        </Link>
      </div>
    );
  } else if (status === 'error') {
    body = (
      <div role="alert" className="rmm-sheet space-y-3 p-5">
        <p className="text-(--app-text)">
          {t('error-lesson-load', { defaultValue: "Couldn't load this lesson." })}
        </p>
        <button
          type="button"
          onClick={() => void useLearnStore.getState().load()}
          className={PRIMARY_BUTTON}
        >
          {t('retry', { defaultValue: 'Try again' })}
        </button>
      </div>
    );
  } else {
    // Not started yet: the placeholder of exactly the lesson's boxes (the first render after
    // `ready` takes the branch above).
    body =
      lesson.mode === 'staff-flashcards' ? (
        <FlashcardSkeleton />
      ) : lesson.mode === 'keyboard-map' || lesson.mode === 'fretboard' ? (
        <FindNoteSkeleton />
      ) : lesson.mode === 'match-note' ? (
        <MatchNoteSkeleton />
      ) : lesson.mode === 'ear-interval' || lesson.mode === 'ear-chord' ? (
        <EarSkeleton />
      ) : lesson.mode === 'play-chord' ? (
        <PlayChordSkeleton />
      ) : lesson.mode === 'rhythm-basics' ? (
        <RhythmSkeleton />
      ) : (
        <LessonSkeleton />
      );
  }

  const ready = status === 'ready';
  return (
    <Shell
      title={lesson.title}
      busy={status !== 'ready' && status !== 'error'}
      action={
        // Always in the header so nothing moves when the lesson loads; hidden (and inert) until
        // then. Icon-only under 400px, where the label would crowd the header.
        <div className={ready ? undefined : 'invisible'} inert={!ready || undefined}>
          <button
            ref={setupButton}
            type="button"
            onClick={() => setSetupOpen(true)}
            aria-label={t('change-input', { defaultValue: 'Change input' })}
            className={`${SECONDARY_BUTTON} min-w-11 max-[399px]:px-0`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span aria-hidden="true" className="max-[399px]:hidden">
              {t('change-input', { defaultValue: 'Change input' })}
            </span>
          </button>
        </div>
      }
    >
      {/* The lesson title is an English catalogue string for now, localised in a later phase. */}
      {body}
      <InputSetup open={setupOpen} onOpenChange={setSetupOpen} returnFocus={setupButton} />
    </Shell>
  );
}
