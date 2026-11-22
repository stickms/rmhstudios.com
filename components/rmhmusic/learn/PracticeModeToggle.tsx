/**
 * PracticeModeToggle — Learning mode or Test mode (`lib/rmhmusic/learn/practice-mode.ts`), the
 * sanctioned `<Tabs>` strip with one line saying what the chosen mode does. The line is always
 * the height of its longer sentence's wrapped form (two lines reserved), so switching never moves
 * what is below. The choice is kept on the device and read by every drill when it deals.
 */

import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Tabs } from '@/components/ui/tabs';
import {
  DEFAULT_PRACTICE_MODE,
  getPracticeMode,
  isPracticeMode,
  setPracticeMode,
  subscribePracticeMode,
  type PracticeMode,
} from '@/lib/rmhmusic/learn/practice-mode';

/** The learner's mode; the default on the server and until hydration, then the stored one. */
export function usePracticeMode(): PracticeMode {
  return useSyncExternalStore(
    subscribePracticeMode,
    getPracticeMode,
    () => DEFAULT_PRACTICE_MODE,
  );
}

export function PracticeModeToggle({
  describe = true,
  className,
}: {
  /** Say what the mode does under the strip. */
  describe?: boolean;
  className?: string;
}) {
  const { t } = useTranslation('c-rmhmusic');
  const mode = usePracticeMode();
  return (
    <div className={className}>
      <Tabs
        tabs={[
          { id: 'learning', label: t('mode-learning', { defaultValue: 'Learning' }) },
          { id: 'test', label: t('mode-test', { defaultValue: 'Test' }) },
        ]}
        value={mode}
        onChange={(id) => {
          if (isPracticeMode(id)) setPracticeMode(id);
        }}
        size="sm"
        aria-label={t('mode-practice', { defaultValue: 'Practice mode' })}
      />
      {describe ? (
        <p className="mt-2 min-h-10 text-sm leading-5 text-app-text-muted">
          {mode === 'learning'
            ? t('mode-learning-says', {
                defaultValue:
                  'Wrong answers show what you played, and the question stays until you get it right.',
              })
            : t('mode-test-says', {
                defaultValue: 'One answer per question, then on to the next.',
              })}
        </p>
      ) : null}
    </div>
  );
}
