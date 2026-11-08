'use client';

/**
 * LearnHome — RMH Music's landing: streak, instrument toggle and the learning
 * path (units → lessons). A document (`.app-page`), so the page scrolls and
 * mobile Safari's bars collapse.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Guitar, Piano, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LiquidTabs } from '@/components/ui/liquid-tabs';
import { useBackOrFallback } from '@/hooks/useBackOrFallback';
import { PATH } from '@/lib/rmhmusic/learn/content/path';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import type { LessonProgressRow } from '@/lib/rmhmusic/learn/store';
import type { Instrument } from '@/lib/rmhmusic/learn/schemas';
import { SECONDARY_BUTTON } from './buttons';
import { InputSetup } from './InputSetup';
import { PathUnit } from './PathUnit';
import { StreakChip } from './StreakChip';

/** Loading placeholder, built from the static path so it is as tall as the loaded page. */
function HomeSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-4">
      <div className="app-skeleton h-12 w-full pointer-coarse:h-13" />
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
  const onOpenLesson = (lessonId: string) =>
    void navigate({ to: '/rmhmusic/lesson/$lessonId', params: { lessonId } });
  const onSetupChange = (open: boolean) => {
    setSetupOpen(open);
    // The microphone listens only while it is being set up or used in a lesson.
    if (!open) useLearnStore.getState().hub?.stop('mic');
  };
  const profile = useLearnStore((s) => s.profile);
  const progress = useLearnStore((s) => s.progress);
  const status = useLearnStore((s) => s.status);
  const error = useLearnStore((s) => s.error);

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
      <div role="alert" className="app-glass space-y-3 rounded-(--app-radius) p-4">
        <p className="text-(--app-text)">
          {error === 'unauthorized'
            ? t('error-signed-out', {
                defaultValue: 'Your session ended. Sign in again to continue.',
              })
            : t('error-load', { defaultValue: "Couldn't load your lessons." })}
        </p>
        {error === 'unauthorized' ? (
          <Link
            to="/login"
            search={{ callbackURL: '/rmhmusic' }}
            className="inline-flex min-h-11 items-center rounded-(--app-radius-sm) bg-(--app-accent) px-5 text-sm font-semibold text-(--app-accent-fg) transition-colors hover:bg-(--app-accent-hover)"
          >
            {t('sign-in', { defaultValue: 'Sign in' })}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => void useLearnStore.getState().load()}
            className="min-h-11 rounded-(--app-radius-sm) bg-(--app-accent) px-5 text-sm font-semibold text-(--app-accent-fg) transition-colors hover:bg-(--app-accent-hover)"
          >
            {t('retry', { defaultValue: 'Try again' })}
          </button>
        )}
      </div>
    );
  } else if (status !== 'ready' || !profile) {
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-(--app-text-muted)">
            {t('input-playing-with', {
              input: inputName,
              defaultValue: 'Playing with: {{input}}',
            })}
          </p>
          <button type="button" onClick={() => onSetupChange(true)} className={SECONDARY_BUTTON}>
            <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('setup-input', { defaultValue: 'Set up input' })}
          </button>
        </div>
        {error === 'save_failed' && (
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
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col pr-[max(1rem,var(--safe-right))] pl-[max(1rem,var(--safe-left))]">
        {/* Every full-screen app ships a labelled way out. */}
        <header className="flex items-center justify-between gap-3 pt-[calc(0.5rem+var(--safe-top))]">
          <Link
            to="/apps"
            onClick={goBack}
            className="-ms-3 flex min-h-11 items-center gap-1.5 rounded-(--app-radius-sm) px-3 text-sm font-medium text-(--app-text-muted) transition-colors hover:text-(--app-text)"
          >
            <ArrowLeft className="h-4 w-4 shrink-0 rtl-flip" aria-hidden="true" />
            {t('back-to-builds', { defaultValue: 'Back to Builds' })}
          </Link>
          <StreakChip />
        </header>

        <main className="flex-1 space-y-4 pt-4 pb-8">
          <div>
            <h1
              className="text-3xl font-bold tracking-tight text-(--app-text)"
              style={{ fontFamily: 'var(--app-font-display)' }}
            >
              {status === 'ready' && profile
                ? instrument === 'guitar'
                  ? t('heading-guitar', { defaultValue: 'Learn guitar' })
                  : t('heading-piano', { defaultValue: 'Learn piano' })
                : t('heading-default', { defaultValue: 'Learn music' })}
            </h1>
            {/* The line is reserved in every state so the toggle and units do not move when data arrives. */}
            <p className="mt-1 min-h-6 text-(--app-text-muted)">
              {status === 'ready' && profile ? (
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
        <InputSetup open={setupOpen} onOpenChange={onSetupChange} />
      </div>
    </div>
  );
}
