/**
 * PracticeSettings — the two knobs on how cards are scheduled and introduced
 * (`srs/practice-settings.ts`): the retention target (how sure of a note you want to be when it comes
 * back) and how many cards you have never seen Practice may introduce in a day. Both save on the
 * learner's profile through the store, like the microphone's settings. Each says in a sentence what
 * moving it trades off, because "90%" means nothing to someone who has never heard of spaced
 * repetition.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useLearnStore } from '@/lib/rmhmusic/learn/store';
import {
  DEFAULT_NEW_PER_DAY,
  DEFAULT_RETENTION,
  MAX_NEW_PER_DAY,
  MAX_RETENTION,
  MIN_NEW_PER_DAY,
  MIN_RETENTION,
  clampNewPerDay,
  retentionPercent,
} from '@/lib/rmhmusic/learn/srs/practice-settings';
import { SECONDARY_BUTTON } from './buttons';

export function PracticeSettings() {
  const { t } = useTranslation('c-rmhmusic');
  const ready = useLearnStore((s) => s.profile !== null);
  const retention = useLearnStore((s) => s.profile?.retention ?? DEFAULT_RETENTION);
  const newPerDay = useLearnStore((s) => s.profile?.newPerDay ?? DEFAULT_NEW_PER_DAY);
  const failed = useLearnStore((s) => s.saveFailed.includes('retention') || s.saveFailed.includes('newPerDay'));
  const retentionId = useId();
  const newId = useId();
  const percent = retentionPercent(retention);
  const store = useLearnStore.getState;
  const percentText = t('settings-retention-value', { value: percent, defaultValue: '{{value}}%' });
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3 text-sm">
          <label htmlFor={retentionId} className="text-app-text">
            {t('settings-retention', { defaultValue: 'Retention target' })}
          </label>
          <span className="text-app-text-muted">{percentText}</span>
        </div>
        <input
          id={retentionId}
          type="range"
          min={Math.round(MIN_RETENTION * 100)}
          max={Math.round(MAX_RETENTION * 100)}
          step={1}
          value={percent}
          disabled={!ready}
          aria-valuetext={percentText}
          onChange={(e) => void store().setRetention(Number(e.target.value) / 100)}
          className="h-11 w-full accent-app-accent"
        />
        <p className="text-sm text-app-text-muted">
          {t('settings-retention-hint', {
            defaultValue:
              'How sure you want to be of a note when it comes back. Higher: cards return sooner and you review more. Lower: fewer reviews, more forgetting.',
          })}
        </p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span id={newId} className="text-app-text">
            {t('settings-new-per-day', { defaultValue: 'New cards a day' })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`${SECONDARY_BUTTON} min-w-11 px-0`}
              disabled={!ready || newPerDay <= MIN_NEW_PER_DAY}
              aria-label={t('settings-new-less', { defaultValue: 'Fewer new cards a day' })}
              onClick={() => void store().setNewPerDay(clampNewPerDay(newPerDay - 1))}
            >
              <span aria-hidden="true">−</span>
            </button>
            <output aria-labelledby={newId} aria-live="polite" className="min-w-8 text-center text-app-text">
              {newPerDay}
            </output>
            <button
              type="button"
              className={`${SECONDARY_BUTTON} min-w-11 px-0`}
              disabled={!ready || newPerDay >= MAX_NEW_PER_DAY}
              aria-label={t('settings-new-more', { defaultValue: 'More new cards a day' })}
              onClick={() => void store().setNewPerDay(clampNewPerDay(newPerDay + 1))}
            >
              <span aria-hidden="true">+</span>
            </button>
          </div>
        </div>
        <p className="text-sm text-app-text-muted">
          {t('settings-new-hint', {
            defaultValue:
              'The most cards you have never seen that Practice adds in a day. Cards that are due always come back. 0 adds none.',
          })}
        </p>
      </div>
      {failed ? (
        <p role="status" className="text-sm text-app-danger">
          {t('settings-save-failed', { defaultValue: "Couldn't save that. Try again." })}
        </p>
      ) : null}
    </div>
  );
}
