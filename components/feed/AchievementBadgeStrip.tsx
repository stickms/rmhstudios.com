'use client';

/**
 * Compact achievement showcase for profile headers: the user's three best
 * unlocked badges (highest tier, then most recent) plus an unlocked count.
 * Clicking it jumps to the profile's Achievements tab.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import { TIER_ORDER, TIER_COLORS, type AchievementTier } from '@/lib/achievements/catalog';

interface StripAchievement {
  id: string;
  name: string;
  icon: string;
  tier: AchievementTier;
  unlocked: boolean;
  unlockedAt: string | null;
}

export function AchievementBadgeStrip({
  userId,
  onShowAll,
}: {
  userId: string;
  onShowAll?: () => void;
}) {
  const { t } = useTranslation('feed');
  const [top, setTop] = useState<StripAchievement[]>([]);
  const [unlockedCount, setUnlockedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/achievements/${encodeURIComponent(userId)}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = (await res.json()) as {
          stats: { unlocked: number };
          achievements: StripAchievement[];
        };
        if (cancelled) return;
        const unlocked = data.achievements
          .filter((a) => a.unlocked)
          .sort(
            (a, b) =>
              TIER_ORDER[b.tier] - TIER_ORDER[a.tier] ||
              new Date(b.unlockedAt ?? 0).getTime() - new Date(a.unlockedAt ?? 0).getTime()
          );
        setTop(unlocked.slice(0, 3));
        setUnlockedCount(data.stats.unlocked);
      } catch {
        // Strip is decorative — fail silently.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (top.length === 0) return null;

  return (
    <button
      onClick={onShowAll}
      className="mb-3 flex items-center gap-2 rounded-full border border-site-border bg-site-surface/40 py-1 pl-1.5 pr-3 text-sm transition-colors hover:bg-site-surface"
      title={t('achievements-showcase', { defaultValue: 'View all achievements' })}
    >
      <span className="flex items-center">
        {top.map((a, i) => (
          <span
            key={a.id}
            title={a.name}
            className={`flex h-7 w-7 items-center justify-center rounded-full border-2 bg-site-bg text-sm leading-none ${i > 0 ? '-ml-1.5' : ''}`}
            style={{ borderColor: TIER_COLORS[a.tier] }}
          >
            <span aria-hidden>{a.icon}</span>
            <span className="sr-only">{a.name}</span>
          </span>
        ))}
      </span>
      <span className="flex items-center gap-1 text-site-text-dim">
        <Trophy className="h-3.5 w-3.5 text-site-warning" aria-hidden />
        {t('achievements-count', { count: unlockedCount, defaultValue: '{{count}} achievements' })}
      </span>
    </button>
  );
}
