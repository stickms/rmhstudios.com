'use client';

import { useTranslation } from 'react-i18next';
import { StarRating } from '@/components/games/StarRating';
import type { RatingAgg } from '@/lib/games/reviews';
import { formatLastPlayed, formatPlaytime } from '@/lib/games/format-playtime';
import type { PlaytimeActivity } from '@/lib/playtime/types';

/**
 * Steam's activity strip: your time on the title, when you last played, how far
 * you are through its achievements, how it is rated. Achievements hide when the
 * title has none; signed out, the first two cells explain why they are empty.
 */
export function ActivityStrip({
  kind,
  activity,
  achievementsDone,
  achievementsTotal,
  agg,
  signedIn,
  showRating,
}: {
  kind: 'game' | 'app';
  activity: PlaytimeActivity | null;
  achievementsDone: number;
  achievementsTotal: number;
  agg: RatingAgg;
  signedIn: boolean;
  showRating: boolean;
}) {
  const { t } = useTranslation('games-hub');
  const last = formatLastPlayed(activity?.lastPlayedAt ?? null);
  const lastLabel =
    last.key === 'never'
      ? t('detail-never', { defaultValue: 'Not yet' })
      : last.key === 'today'
        ? t('detail-today', { defaultValue: 'Today' })
        : last.key === 'yesterday'
          ? t('detail-yesterday', { defaultValue: 'Yesterday' })
          : t('detail-days-ago-n', { defaultValue: '{{n}} days ago', n: last.days });

  return (
    <section
      aria-label={t('detail-activity', { defaultValue: 'Your activity' })}
      className="glass-fill rounded-site px-5 py-4"
    >
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {signedIn ? (
          <>
            <Cell
              label={
                kind === 'app'
                  ? t('detail-time-used', { defaultValue: 'Time used' })
                  : t('detail-playtime', { defaultValue: 'Playtime' })
              }
              value={formatPlaytime(activity?.totalSeconds ?? 0)}
              note={t('detail-last-2-weeks', {
                defaultValue: '{{time}} in the last 2 weeks',
                time: formatPlaytime(activity?.last2WeeksSeconds ?? 0),
              })}
            />
            <Cell
              label={t('detail-last-played', { defaultValue: 'Last played' })}
              value={lastLabel}
            />
          </>
        ) : (
          <div className="col-span-2">
            <dt className="font-mono text-xs text-site-text-muted">
              {kind === 'app'
                ? t('detail-time-used', { defaultValue: 'Time used' })
                : t('detail-playtime', { defaultValue: 'Playtime' })}
            </dt>
            <dd className="mt-1 text-sm text-site-text">
              {t('detail-signin-track', {
                defaultValue: 'Sign in to track your time and progress.',
              })}
            </dd>
          </div>
        )}
        {achievementsTotal > 0 ? (
          <Cell
            label={t('detail-achievements', { defaultValue: 'Achievements' })}
            value={`${achievementsDone} / ${achievementsTotal}`}
          />
        ) : null}
        {showRating ? (
          <div>
            <dt className="font-mono text-xs text-site-text-muted">
              {t('rating', { defaultValue: 'Rating' })}
            </dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <StarRating
                value={Math.round(agg.average)}
                size={14}
                label={t('rating', { defaultValue: 'Rating' })}
              />
              <span className="font-mono text-sm text-site-text">
                {agg.count > 0
                  ? `${agg.average} · ${agg.count}`
                  : t('no-ratings', { defaultValue: 'No ratings yet' })}
              </span>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function Cell({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="font-mono text-xs text-site-text-muted">{label}</dt>
      <dd className="mt-1 font-mono text-lg font-medium text-site-text">{value}</dd>
      {note ? <dd className="mt-0.5 text-xs text-site-text-muted">{note}</dd> : null}
    </div>
  );
}
