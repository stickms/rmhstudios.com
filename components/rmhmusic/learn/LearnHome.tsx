'use client';

/**
 * LearnHome — RMH Music's landing: the catalog card's art as a hero, the heading, the instrument
 * toggle, the input in use, and the learning path on one sheet of manuscript paper (units →
 * lessons). A document
 * (`.app-page`), so the page scrolls and mobile Safari's bars collapse.
 *
 * No layout shift between loading and loaded: the header, hero, heading and every row keep the
 * same boxes in both states (the skeleton is built from the same rows, `HomeSkeleton`), and the
 * lines whose text arrives later reserve their height.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Guitar, Piano } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { useBackOrFallback } from '@/hooks/useBackOrFallback';
import { PATH } from '@/lib/rmhmusic/learn/content/path';
import { hasDueReviewedCard } from '@/lib/rmhmusic/learn/content/practice';
import { releaseMic } from '@/lib/rmhmusic/learn/input/mic-lifecycle';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import type { LessonProgressRow } from '@/lib/rmhmusic/learn/store';
import type { Instrument } from '@/lib/rmhmusic/learn/schemas';
import { PRIMARY_BUTTON, TEXT_BUTTON } from './buttons';
import { HomeHero } from './HomeHero';
import { InputSetup } from './InputSetup';
import { ModeToggle } from './ModeToggle';
import { PathUnit } from './PathUnit';
import { StreakChip } from './StreakChip';
import { useInputRelease } from './useLearnInput';

/**
 * The input in use: a quiet line ("Playing with: On-screen keys") and, under it, a text button to
 * change it. Always two stacked boxes of fixed size, never side by side, so nothing here depends
 * on how long a translation is: the line is clamped to two lines inside a box two lines tall
 * (`INPUT_TEXT`), and the button is one line that truncates (`INPUT_BUTTON`). Both are in rem, so
 * at 200% text they grow together, and the skeleton reserves the same two boxes. The line sits at
 * the bottom of its box, against the button it belongs with.
 *
 * The button's row (`INPUT_ROW`, one 44px line in both states) also holds, at its far end, a
 * quiet "Practice" link while at least one reviewed card is due. The row is there before the link
 * is, so the link appearing (the cards load after the profile) moves nothing.
 */
const INPUT_TEXT = 'flex h-10 min-w-0 items-end';
const INPUT_BUTTON = 'max-w-full min-w-0';
const INPUT_ROW = 'flex h-11 min-w-0 items-center gap-4';

/** Loading placeholder, built from the static path so it is as tall as the loaded page. */
function HomeSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <div className="app-skeleton h-12 w-full pointer-coarse:h-13" />
      <div>
        <div className={INPUT_TEXT}>
          <span className="app-skeleton h-5 w-48 max-w-full" />
        </div>
        <div className={INPUT_ROW}>
          <span className="app-skeleton h-5 w-28 max-w-full" />
        </div>
      </div>
      <div className="rmm-sheet">
        {PATH.map((unit) => (
          <PathUnit key={unit.id} unit={unit} progress={new Map()} placeholder />
        ))}
      </div>
    </div>
  );
}

export function LearnHome() {
  const { t } = useTranslation('c-rmhmusic');
  const goBack = useBackOrFallback();
  const navigate = useNavigate();
  const [setupOpen, setSetupOpen] = useState(false);
  const setupButton = useRef<HTMLButtonElement>(null);
  const onOpenLesson = (lessonId: string) =>
    void navigate({ to: '/rmhmusic/lesson/$lessonId', params: { lessonId } });
  // Leaving the screen (any route change) or hiding the tab stops the mic; the screen sees it
  // through the hub's phases (useInputPhases), so nothing here needs to re-render.
  useInputRelease();
  const onSetupChange = (open: boolean) => {
    setSetupOpen(open);
    // The microphone listens only while it is being set up or used in a lesson.
    const { hub } = useLearnStore.getState();
    if (!open && hub) releaseMic(hub);
  };
  const profile = useLearnStore((s) => s.profile);
  const progress = useLearnStore((s) => s.progress);
  const status = useLearnStore((s) => s.status);
  const error = useLearnStore((s) => s.error);
  // Only the home's own action (the instrument toggle) reports a failed save here.
  const instrumentFailed = useLearnStore((s) => s.saveFailed.includes('instrument'));

  // The store is empty until `load()` runs in the browser, never during SSR. The cards load on
  // their own: a failure there only means no Practice link.
  useEffect(() => {
    const store = useLearnStore.getState();
    void store.load();
    void store.loadCards();
  }, []);
  const cards = useLearnStore((s) => s.cards);
  const practiceDue = useMemo(() => hasDueReviewedCard(cards, Date.now()), [cards]);

  const rows = useMemo(
    () => new Map<string, LessonProgressRow>(progress.map((r) => [r.lessonId, r])),
    [progress],
  );
  const ready = status === 'ready' && !!profile;
  const loading = !ready && status !== 'error';

  const instrument = profile?.instrument ?? 'piano';
  const tabs = [
    { id: 'piano', label: t('instrument-piano', { defaultValue: 'Piano' }), icon: Piano },
    { id: 'guitar', label: t('instrument-guitar', { defaultValue: 'Guitar' }), icon: Guitar },
  ];

  const inputNames = {
    screen: t('input-screen', { defaultValue: 'On-screen keys' }),
    keys: t('input-keys', { defaultValue: 'Computer keyboard' }),
    midi: t('input-midi', { defaultValue: 'MIDI controller' }),
    mic: t('input-mic', { defaultValue: 'Microphone' }),
  };
  const inputName = inputNames[profile?.input ?? 'screen'];
  const inputLine = t('input-playing-with', {
    input: inputName,
    defaultValue: 'Playing with: {{input}}',
  });

  let body;
  if (status === 'error') {
    body = (
      <div role="alert" className="rmm-sheet space-y-3 p-4">
        <p className="text-(--app-text)">
          {error === 'unauthorized'
            ? t('error-signed-out', {
                defaultValue: 'Your session ended. Sign in again to continue.',
              })
            : t('error-load', { defaultValue: "Couldn't load your lessons." })}
        </p>
        {error === 'unauthorized' ? (
          <Link to="/login" search={{ callbackURL: '/rmhmusic' }} className={PRIMARY_BUTTON}>
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void useLearnStore.getState().load()}
            className={PRIMARY_BUTTON}
          >
            {t('retry', { defaultValue: 'Try again' })}
          </button>
        )}
      </div>
    );
  } else if (!ready) {
    body = <HomeSkeleton />;
  } else {
    body = (
      <div className="space-y-4">
        <LiquidTabs
          tabs={tabs}
          value={instrument}
          onChange={(id) => void useLearnStore.getState().setInstrument(id as Instrument)}
          aria-label={t('instrument-label', { defaultValue: 'Instrument' })}
        />
        <div>
          <div className={INPUT_TEXT}>
            <p
              title={inputLine}
              className="line-clamp-2 min-w-0 text-sm leading-5 text-(--app-text-muted)"
            >
              {inputLine}
            </p>
          </div>
          <div className={INPUT_ROW}>
            <button
              ref={setupButton}
              type="button"
              onClick={() => onSetupChange(true)}
              className={`${TEXT_BUTTON} ${INPUT_BUTTON}`}
            >
              <span className="truncate">{t('setup-input', { defaultValue: 'Set up input' })}</span>
            </button>
            {practiceDue && (
              <Link to="/rmhmusic/practice" className={`${TEXT_BUTTON} ms-auto shrink-0`}>
                {t('practice', { defaultValue: 'Practice' })}
              </Link>
            )}
          </div>
        </div>
        {instrumentFailed && (
          <p role="status" className="text-sm text-(--app-danger)">
            {t('error-save', { defaultValue: "Couldn't save that change. Try again." })}
          </p>
        )}
        <div className="rmm-sheet">
          {PATH.map((unit) => (
            <PathUnit key={unit.id} unit={unit} progress={rows} onOpenLesson={onOpenLesson} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="rmm-column mx-auto flex w-full max-w-3xl flex-1 flex-col pr-[max(1.25rem,var(--safe-right))] pl-[max(1.25rem,var(--safe-left))] min-[1800px]:max-w-4xl">
        {/* Every full-screen app ships a labelled way out. With large text on a narrow phone the
            streak and toggle wrap below it (kept at the end) rather than widen the page. The
            streak comes first, so its empty slot (no streak) sits inside, not at the edge. */}
        <header className="flex flex-wrap items-center justify-between gap-2 pt-[calc(0.5rem+var(--safe-top))]">
          <Link
            to="/apps"
            onClick={goBack}
            className="-ms-3 flex min-h-11 min-w-0 items-center gap-1.5 rounded-(--app-radius-sm) px-3 text-sm font-medium text-(--app-text-muted) transition-colors hover:text-(--app-text)"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 rtl-flip" aria-hidden="true" />
            <span className="truncate">
              {t('back-to-builds', { defaultValue: 'Back to Builds' })}
            </span>
          </Link>
          <div className="ms-auto flex shrink-0 items-center gap-2">
            <StreakChip />
            <ModeToggle />
          </div>
        </header>

        <main aria-busy={loading || undefined} className="flex-1 space-y-4 pt-3 pb-8">
          {loading && (
            <p role="status" className="sr-only">
              {t('loading-lessons', { defaultValue: 'Loading your lessons…' })}
            </p>
          )}
          <HomeHero />
          <h1 className="rmm-display text-[2.5rem] leading-[3rem] text-(--app-text) sm:text-5xl sm:leading-[3.5rem]">
            {ready
              ? instrument === 'guitar'
                ? t('heading-guitar', { defaultValue: 'Learn guitar' })
                : t('heading-piano', { defaultValue: 'Learn piano' })
              : t('heading-default', { defaultValue: 'Learn music' })}
          </h1>
          {body}
        </main>
        <InputSetup open={setupOpen} onOpenChange={onSetupChange} returnFocus={setupButton} />
      </div>
    </div>
  );
}
