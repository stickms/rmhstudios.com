'use client';

/**
 * The "new personal best" moment (plan U4) — the instant after a good run is
 * when people share, so this is where the share sheet lives.
 *
 * Loaded lazily through `ResultMomentSlot` and only when the score endpoint
 * reported a moment, so an ordinary run never downloads it. The share itself
 * reuses `ShareMomentSheet` (the §13 stat-card flow), which creates the
 * `SharedMoment` only when the player actually presses share.
 */

import { lazy, Suspense, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2, Trophy, X } from 'lucide-react';
import { m as motion } from 'framer-motion';
import { useCelebration } from '@/hooks/useCelebration';
import { SPRING } from '@/lib/motion';
import type { ScoreMomentView } from './result-moment-slot';

const ShareMomentSheet = lazy(() =>
  import('@/components/share/ShareMomentSheet').then((m) => ({ default: m.ShareMomentSheet })),
);

export default function ResultMoment({
  moment,
  gameName,
  onDismiss,
}: {
  moment: ScoreMomentView;
  gameName: string;
  onDismiss: () => void;
}) {
  const { t } = useTranslation('c-game');
  const celebrate = useCelebration();
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    void celebrate({ origin: { y: 0.25 } });
  }, [celebrate]);

  const score = moment.score.toLocaleString();
  const headline =
    moment.kind === 'first-score'
      ? t('moment-first', { defaultValue: 'First score on the board' })
      : t('moment-pb', { defaultValue: 'New personal best' });
  const detail = [
    moment.previous !== null
      ? t('moment-previous', { defaultValue: 'Previous best {{value}}', value: moment.previous.toLocaleString() })
      : null,
    moment.rank !== null
      ? t('moment-rank', { defaultValue: 'Rank #{{rank}}', rank: moment.rank.toLocaleString() })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <>
      <motion.div
        role="status"
        aria-live="polite"
        initial={{ opacity: 0, y: -16, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={SPRING.snappy}
        className="glass-overlay pointer-events-auto fixed left-1/2 top-[calc(var(--safe-top,0px)+1rem)] z-50 flex w-[min(92vw,22rem)] -translate-x-1/2 items-center gap-3 rounded-site p-3"
        data-slot="result-moment"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-site-accent text-site-accent-fg">
          <Trophy className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium uppercase tracking-wide text-site-text-muted">
            {headline}
          </span>
          <span className="block text-lg font-semibold tabular-nums text-site-text">{score}</span>
          {detail ? <span className="block truncate text-xs text-site-text-muted">{detail}</span> : null}
        </span>
        <button
          type="button"
          onClick={() => setSharing(true)}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-site-accent px-3 text-sm font-medium text-site-accent-fg transition-opacity hover:opacity-90"
        >
          <Share2 className="h-4 w-4" aria-hidden />
          {t('moment-share', { defaultValue: 'Share' })}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('moment-dismiss', { defaultValue: 'Dismiss' })}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-site-text-muted transition-colors hover:bg-site-surface-hover hover:text-site-text"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </motion.div>
      {sharing ? (
        <Suspense fallback={null}>
          <ShareMomentSheet
            open={sharing}
            onOpenChange={setSharing}
            kind="arcade"
            payload={{ title: gameName, value: score, subtitle: [headline, detail].filter(Boolean).join(' · ') }}
          />
        </Suspense>
      ) : null}
    </>
  );
}
