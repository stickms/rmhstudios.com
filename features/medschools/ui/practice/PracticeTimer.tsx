import { useEffect, useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { PRACTICE_SECONDS, formatClock, initialTimer, timerReducer, type PracticeSeconds } from '../../engine/practice';
import { OptionGroup } from '../OptionGroup';

/**
 * The practice countdown. It starts only when the member presses Start (a response to input, R5), changes once a second
 * with no animation, and its one interval is cleared on pause, finish and unmount. Presentational: no network, no storage.
 */
export function PracticeTimer({ resetKey }: { resetKey: string }) {
  const { t } = useTranslation('medschools');
  const [s, dispatch] = useReducer(timerReducer, undefined, () => initialTimer(120));
  const running = s.status === 'running';

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => dispatch({ type: 'tick' }), 1000);
    return () => clearInterval(id);
  }, [running]);

  // A new question starts a fresh clock.
  useEffect(() => {
    dispatch({ type: 'reset' });
  }, [resetKey]);

  const minutes = (n: number) =>
    t('practice-minutes', {
      count: n,
      defaultValue_one: '{{count}} minute',
      defaultValue_other: '{{count}} minutes',
      defaultValue: '{{count}} minutes',
    });
  return (
    <div className="flex flex-col gap-3 border-b border-site-border pb-4">
      <OptionGroup<`${PracticeSeconds}`>
        label={t('practice-length-label', { defaultValue: 'Time to answer' })}
        value={`${s.duration}`}
        options={PRACTICE_SECONDS.map((n) => ({ value: `${n}` as const, label: minutes(n / 60) }))}
        onChange={(v) => dispatch({ type: 'duration', seconds: Number(v) as PracticeSeconds })}
      />
      <p
        className="t-title m-0 font-mono tabular-nums"
        role="timer"
        aria-label={t('practice-clock-label', { defaultValue: 'Time left' })}
        data-status={s.status}
      >
        {formatClock(s.remaining)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button type="button" variant="default" onClick={() => dispatch({ type: 'pause' })}>
            {t('practice-pause', { defaultValue: 'Pause' })}
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            disabled={s.status === 'done'}
            onClick={() => dispatch({ type: 'start' })}
          >
            {s.status === 'paused'
              ? t('practice-resume', { defaultValue: 'Resume' })
              : t('practice-start', { defaultValue: 'Start' })}
          </Button>
        )}
        <Button
          type="button"
          variant="default"
          disabled={s.status === 'idle'}
          onClick={() => dispatch({ type: 'reset' })}
        >
          {t('practice-reset', { defaultValue: 'Reset' })}
        </Button>
        <span role="status" className="t-meta">
          {s.status === 'done' ? t('practice-done', { defaultValue: 'Time is up.' }) : ''}
        </span>
      </div>
    </div>
  );
}
