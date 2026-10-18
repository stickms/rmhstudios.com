'use client';

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { clearActivity, showActivity } from '@/lib/access/activity';
import { getAccessPrefs } from '@/lib/access/prefs';
import { formatClockTime } from '@/lib/access/format';
import { useAccessPrefs } from '@/lib/access/use-access-prefs';
import type { TimerPhase } from '@/lib/rmhstudy/types';

/**
 * Keeps one tag-replaced notification in step with the RMHStudy timer. It
 * re-posts only when the PHASE or the paused flag changes (the body carries the
 * end time, so a running countdown never needs a per-second update) and closes
 * it when the timer goes idle or the room is left.
 */
export function useStudyActivityNotification(opts: {
  phase: TimerPhase;
  isPaused: boolean;
  remainingMs: number;
  roomCode: string | undefined;
}) {
  const { t, i18n } = useTranslation('f-access');
  const enabled = useAccessPrefs().activity;
  const remaining = useRef(opts.remainingMs);
  remaining.current = opts.remainingMs;
  const { phase, isPaused, roomCode } = opts;

  useEffect(() => {
    if (!enabled || !roomCode || phase === 'idle') {
      void clearActivity();
      return;
    }
    const label =
      phase === 'working'
        ? t('act-focus', { defaultValue: 'Focus time' })
        : phase === 'short_break'
          ? t('act-short', { defaultValue: 'Short break' })
          : t('act-long', { defaultValue: 'Long break' });
    const mins = Math.max(1, Math.ceil(remaining.current / 60_000));
    const body = isPaused
      ? t('act-paused', {
          defaultValue: '{{phase}} paused, {{minutes}} min left',
          phase: label,
          minutes: mins,
        })
      : t('act-running', {
          defaultValue: '{{phase}} until {{time}}',
          phase: label,
          time: formatClockTime(Date.now() + remaining.current, getAccessPrefs(), i18n.language),
        });
    void showActivity({
      title: t('act-title', { defaultValue: 'RMHStudy timer' }),
      body,
      url: `/rmhstudy/${roomCode}`,
    });
  }, [enabled, phase, isPaused, roomCode, t, i18n.language]);

  useEffect(() => () => void clearActivity(), []);
}
