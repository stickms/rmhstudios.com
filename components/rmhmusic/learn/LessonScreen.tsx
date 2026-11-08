'use client';

/**
 * LessonScreen — the page around one lesson (`/rmhmusic/lesson/<id>`): a way
 * back to the path, "Change input", and the lesson's activity. An unknown id,
 * or a lesson that has not shipped yet, gets a friendly "not available yet"
 * page with a link home — never a crash or a blank. A document (`.app-page`).
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { ArrowLeft, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getLesson } from '@/lib/rmhmusic/learn/content/path';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './buttons';
import { FirstNoteLesson } from './FirstNoteLesson';
import { InputSetup } from './InputSetup';
import { ModeToggle } from './ModeToggle';
import { useInputRelease } from './useLearnInput';

function Shell({
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
        <header className="flex items-center justify-between gap-2 pt-[calc(0.5rem+var(--safe-top))]">
          <Link
            to="/rmhmusic"
            className="-ms-3 flex min-h-11 min-w-0 items-center gap-1.5 rounded-(--app-radius-sm) px-3 text-sm font-medium text-(--app-text-muted) transition-colors hover:text-(--app-text)"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 rtl-flip" aria-hidden="true" />
            <span className="truncate">
              {t('back-to-lessons', { defaultValue: 'Back to lessons' })}
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
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
          <h1 className="rmm-display text-3xl font-bold tracking-tight text-(--app-text)">
            {title}
          </h1>
          {children}
        </main>
      </div>
    </div>
  );
}

export function LessonScreen({ lessonId }: { lessonId: string }) {
  const { t } = useTranslation('c-rmhmusic');
  const status = useLearnStore((s) => s.status);
  const error = useLearnStore((s) => s.error);
  const [setupOpen, setSetupOpen] = useState(false);
  const setupButton = useRef<HTMLButtonElement>(null);
  // Leaving the screen (any route change) or hiding the tab stops the mic; the screen sees it
  // through the hub's phases (useInputPhases), so nothing here needs to re-render.
  useInputRelease();
  const lesson = getLesson(lessonId);
  const playable = lesson?.available === true && lesson.mode === 'play-note';

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
  if (status === 'error' && error === 'unauthorized') {
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
  } else if (status !== 'ready') {
    body = (
      <div aria-hidden="true" className="space-y-4">
        <div className="app-skeleton h-44 w-full" />
        <div className="app-skeleton h-40 w-full sm:h-48" />
      </div>
    );
  } else {
    body = <FirstNoteLesson lessonId={lesson.id} paused={setupOpen} />;
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
