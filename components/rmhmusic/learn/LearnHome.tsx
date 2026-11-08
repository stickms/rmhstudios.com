'use client';

/**
 * LearnHome — RMH Music's landing: the catalog card's art as a hero, the instrument toggle, the
 * input in use, and the learning path as notebook pages (units → lessons). A document
 * (`.app-page`), so the page scrolls and mobile Safari's bars collapse.
 *
 * No layout shift between loading and loaded: the header, hero, heading and every row keep the
 * same boxes in both states (the skeleton is built from the same rows, `HomeSkeleton`), and the
 * lines whose text arrives later reserve their height.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Guitar, Piano, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { useBackOrFallback } from '@/hooks/useBackOrFallback';
import { PATH } from '@/lib/rmhmusic/learn/content/path';
import { releaseMic } from '@/lib/rmhmusic/learn/input/mic-lifecycle';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import type { LessonProgressRow } from '@/lib/rmhmusic/learn/store';
import type { Instrument } from '@/lib/rmhmusic/learn/schemas';
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from './buttons';
import { HomeHero } from './HomeHero';
import { InputSetup } from './InputSetup';
import { ModeToggle } from './ModeToggle';
import { PathUnit } from './PathUnit';
import { StreakChip } from './StreakChip';
import { useInputRelease } from './useLearnInput';

/**
 * The "Playing with … / Set up input" row, the same box loaded or not: the text, clamped to two
 * lines, sits in a box two lines tall (`INPUT_ROW_TEXT`) beside a 44px button, so a long
 * translation cannot change its height. With large text (200%) the two no longer fit side by side,
 * and the button wraps below the text instead of crushing it; the skeleton wraps the same way.
 */
const INPUT_ROW = 'flex min-h-11 flex-wrap items-center justify-between gap-3';
const INPUT_ROW_TEXT = 'flex min-h-10 min-w-0 flex-[1_1_7rem] items-center';

/** Loading placeholder, built from the static path so it is as tall as the loaded page. */
function HomeSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <div className="app-skeleton h-12 w-full pointer-coarse:h-13" />
      <div className={INPUT_ROW}>
        <span className={INPUT_ROW_TEXT}>
          <span className="app-skeleton h-5 w-40 max-w-full" />
        </span>
        <span className="app-skeleton h-11 w-36 max-w-full shrink-0" />
      </div>
      {PATH.map((unit) => (
        <PathUnit key={unit.id} unit={unit} progress={new Map()} placeholder />
      ))}
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

  // The store is empty until `load()` runs in the browser, never during SSR.
  useEffect(() => {
    void useLearnStore.getState().load();
  }, []);

  const rows = useMemo(
    () => new Map<string, LessonProgressRow>(progress.map((r) => [r.lessonId, r])),
    [progress],
  );
  const available = PATH.flatMap((u) => u.lessons).filter((l) => l.available);
  const started = available.filter((l) => rows.has(l.id)).length;
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
        <div className={INPUT_ROW}>
          <div className={INPUT_ROW_TEXT}>
            <p className="line-clamp-2 min-w-0 text-sm leading-5 text-(--app-text-muted)">
              {t('input-playing-with', {
                input: inputName,
                defaultValue: 'Playing with: {{input}}',
              })}
            </p>
          </div>
          <button
            ref={setupButton}
            type="button"
            onClick={() => onSetupChange(true)}
            className={`${SECONDARY_BUTTON} shrink-0`}
          >
            <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('setup-input', { defaultValue: 'Set up input' })}
          </button>
        </div>
        {instrumentFailed && (
          <p role="status" className="text-sm text-(--app-danger)">
            {t('error-save', { defaultValue: "Couldn't save that change. Try again." })}
          </p>
        )}
        {PATH.map((unit) => (
          <PathUnit key={unit.id} unit={unit} progress={rows} onOpenLesson={onOpenLesson} />
        ))}
      </div>
    );
  }

  return (
    <div className="app-page">
      <div className="rmm-column mx-auto flex w-full max-w-3xl flex-1 flex-col pr-[max(1.25rem,var(--safe-right))] pl-[max(1.25rem,var(--safe-left))] min-[1800px]:max-w-4xl">
        {/* Every full-screen app ships a labelled way out. With large text on a narrow phone the
            toggle and streak chip wrap below it (kept at the end) rather than widen the page. */}
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
            <ModeToggle />
            <StreakChip />
          </div>
        </header>

        <main aria-busy={loading || undefined} className="flex-1 space-y-4 pt-3 pb-8">
          {loading && (
            <p role="status" className="sr-only">
              {t('loading-lessons', { defaultValue: 'Loading your lessons…' })}
            </p>
          )}
          <HomeHero />
          <div>
            <h1 className="rmm-display text-3xl font-bold tracking-tight text-(--app-text)">
              {ready
                ? instrument === 'guitar'
                  ? t('heading-guitar', { defaultValue: 'Learn guitar' })
                  : t('heading-piano', { defaultValue: 'Learn piano' })
                : t('heading-default', { defaultValue: 'Learn music' })}
            </h1>
            {/* Reserved in every state: two lines on a phone (a long translation wraps), one above 400px. */}
            <p className="mt-1 line-clamp-2 min-h-12 text-(--app-text-muted) min-[401px]:line-clamp-1 min-[401px]:min-h-6">
              {ready ? (
                t('lessons-started', {
                  count: available.length,
                  started,
                  defaultValue_one: '{{started}} of {{count}} lesson started',
                  defaultValue: '{{started}} of {{count}} lessons started',
                })
              ) : status === 'error' ? null : (
                <span aria-hidden="true" className="app-skeleton block h-6 w-44" />
              )}
            </p>
          </div>
          {body}
        </main>
        <InputSetup open={setupOpen} onOpenChange={onSetupChange} returnFocus={setupButton} />
      </div>
    </div>
  );
}
