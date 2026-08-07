'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { WidgetFrame } from '@/components/ui/widget-frame';
import { DIFFICULTIES, type Difficulty } from '@/lib/slice-it/constants';

/**
 * The Slice It! profile showcase module (X6).
 *
 * One fetch, to `/api/slice-it/showcase` — a cached aggregate (see
 * `lib/slice-it/showcase.server.ts`), not the six-query dedicated player page.
 * A showcase module renders on every profile view; this one has to be cheap
 * enough that adding it costs the page nothing worth noticing.
 */

interface SliceItLampCounts {
  difficulty: Difficulty;
  cleared: number;
  fullCombo: number;
  perfect: number;
}

interface SliceItShowcaseStats {
  skillRating: number;
  chartsCleared: number;
  bestAccuracy: number | null;
  lampsByDifficulty: SliceItLampCounts[];
}

const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Easy',
  normal: 'Normal',
  hard: 'Hard',
  expert: 'Expert',
};

export function SliceItModule({ title, userId }: { title: string; userId: string }) {
  const { t } = useTranslation('c-profile-modules');
  // `undefined` = still loading, `null` = loaded and there is nothing to show.
  const [stats, setStats] = useState<SliceItShowcaseStats | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/slice-it/showcase?userId=${encodeURIComponent(userId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { stats: SliceItShowcaseStats | null } | null) => {
        if (!cancelled) setStats(data?.stats ?? null);
      })
      .catch(() => {
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const playedTiers = stats?.lampsByDifficulty.filter((l) => l.cleared > 0) ?? [];

  return (
    <WidgetFrame
      title={title}
      loading={stats === undefined}
      empty={stats === null}
      emptyTitle={t('no-slice-it', { defaultValue: 'No Slice It! runs yet' })}
    >
      {stats ? (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat
              label={t('skill-rating', { defaultValue: 'Skill rating' })}
              value={Math.round(stats.skillRating)}
            />
            <Stat
              label={t('best-accuracy', { defaultValue: 'Best accuracy' })}
              value={stats.bestAccuracy != null ? `${(stats.bestAccuracy * 100).toFixed(2)}%` : '—'}
            />
            <Stat
              label={t('charts-cleared', { defaultValue: 'Charts cleared' })}
              value={stats.chartsCleared}
            />
          </div>
          {playedTiers.length > 0 ? (
            <ul className="space-y-1">
              {DIFFICULTIES.filter((d) => playedTiers.some((l) => l.difficulty === d)).map((difficulty) => {
                const lamp = playedTiers.find((l) => l.difficulty === difficulty)!;
                return (
                  <li
                    key={difficulty}
                    className="flex items-center justify-between text-sm text-site-text"
                  >
                    <span className="text-site-text-muted">{DIFFICULTY_LABELS[difficulty]}</span>
                    <span>
                      {t('lamp-cleared', { defaultValue: '{{count}} cleared', count: lamp.cleared })}
                      {lamp.fullCombo > 0
                        ? ` · ${t('lamp-fc', { defaultValue: '{{count}} FC', count: lamp.fullCombo })}`
                        : ''}
                      {lamp.perfect > 0
                        ? ` · ${t('lamp-perfect', { defaultValue: '{{count}} perfect', count: lamp.perfect })}`
                        : ''}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}
    </WidgetFrame>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-lg font-semibold text-site-text">{value}</div>
      <div className="text-xs text-site-text-muted">{label}</div>
    </div>
  );
}
