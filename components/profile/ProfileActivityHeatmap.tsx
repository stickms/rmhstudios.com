'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { HEATMAP_WEEKS, heatLevel, postingStreaks, windowDays } from '@/lib/profile/activity';

/** Opacity of the accent per shade; 0 is the empty-cell wash. */
const LEVEL_MIX = [14, 30, 50, 72, 100] as const;

/**
 * Posts-per-day grid for a profile (last 26 weeks). Decorative cells are
 * aria-hidden; the summary line carries the information for assistive tech.
 */
export default function ProfileActivityHeatmap({ userId }: { userId: string }) {
  const { t } = useTranslation('feed');
  const [data, setData] = useState<{ days: Record<string, number>; total: number } | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/profile/${encodeURIComponent(userId)}/activity`, { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json && typeof json.days === 'object') setData(json);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);

  const { weeks, streaks } = useMemo(() => {
    if (!data) return { weeks: [], streaks: { current: 0, longest: 0 } };
    const days = windowDays(data.days, new Date());
    const max = Math.max(0, ...days.map((d) => d.count));
    const cols: Array<Array<{ date: string; count: number; level: number }>> = [];
    for (let i = 0; i < days.length; i += 7) {
      cols.push(days.slice(i, i + 7).map((d) => ({ ...d, level: heatLevel(d.count, max) })));
    }
    return { weeks: cols, streaks: postingStreaks(days) };
  }, [data]);

  if (!data || data.total === 0) return null;

  return (
    <section className="glass-fill rounded-site p-4" aria-label={t('activity-title', { defaultValue: 'Posting activity' })}>
      <p className="mb-1 font-mono text-xs text-site-text-muted">
        {t('activity-summary', {
          defaultValue: 'Posts in the last {{weeks}} weeks: {{total}}',
          total: data.total,
          weeks: HEATMAP_WEEKS,
        })}
      </p>
      {streaks.longest > 1 ? (
        <p className="mb-3 font-mono text-xs text-site-text-muted">
          {t('activity-streak', {
            defaultValue: 'Current streak: {{current}} days · Longest: {{longest}} days',
            current: streaks.current,
            longest: streaks.longest,
          })}
        </p>
      ) : null}
      <div aria-hidden>
        <div
          className="grid max-w-full gap-0.5"
          style={{ gridTemplateColumns: `repeat(${weeks.length || 1}, minmax(0, 14px))` }}
        >
          {weeks.map((week, wi) => (
            <div key={wi} className="grid gap-0.5">
              {week.map((cell) => (
                <div
                  key={cell.date}
                  className="aspect-square w-full rounded-xs"
                  style={{
                    background: `color-mix(in srgb, var(--site-accent) ${LEVEL_MIX[cell.level]}%, transparent)`,
                  }}
                  title={`${cell.date}: ${cell.count}`}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-end gap-1 font-mono text-xs text-site-text-muted">
          <span>{t('activity-legend-less', { defaultValue: 'Less' })}</span>
          {LEVEL_MIX.map((mix) => (
            <span
              key={mix}
              className="size-2.5 rounded-xs"
              style={{ background: `color-mix(in srgb, var(--site-accent) ${mix}%, transparent)` }}
            />
          ))}
          <span>{t('activity-legend-more', { defaultValue: 'More' })}</span>
        </div>
      </div>
    </section>
  );
}
