'use client';

/**
 * Compact achievement showcase for profile headers: the user's three best
 * unlocked badges (highest tier, then most recent) plus an unlocked count.
 * Clicking it jumps to the profile's Achievements tab.
 */

import { useEffect, useState } from'react';
import { useTranslation } from'react-i18next';
import { Trophy } from'lucide-react';
import { TIER_COLORS } from'@/lib/achievements/catalog';
import {
 pickAchievementStrip,
 type AchievementStripData,
 type StripAchievement,
} from'@/lib/achievements/strip';

export function AchievementBadgeStrip({
 userId,
 initial,
 onShowAll,
}: {
 userId: string;
 /** Server-rendered strip (profile loader). When present, nothing is fetched. */
 initial?: AchievementStripData;
 onShowAll?: () => void;
}) {
 const { t } = useTranslation('feed');
 const [top, setTop] = useState<StripAchievement[]>(initial?.top ?? []);
 const [unlockedCount, setUnlockedCount] = useState(initial?.unlocked ?? 0);
 // Read once: a later client refetch of the profile carries no strip, and that
 // must not trigger a fetch for data the page already painted.
 const [seeded] = useState(Boolean(initial));

 useEffect(() => {
 if (seeded) return;
 let cancelled = false;
 (async () => {
 try {
 const res = await fetch(`/api/achievements/${encodeURIComponent(userId)}`, {
 credentials:'include',
 });
 if (!res.ok) return;
 const data = (await res.json()) as {
 stats: { unlocked: number };
 achievements: StripAchievement[];
 };
 if (cancelled) return;
 const strip = pickAchievementStrip(data);
 setTop(strip.top);
 setUnlockedCount(strip.unlocked);
 } catch {
 // Strip is decorative — fail silently.
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [userId, seeded]);

 if (top.length === 0) return null;

 return (
 <button
 onClick={onShowAll}
 className="mb-3 flex items-center gap-2 rounded-full border border-site-border bg-site-surface/40 py-1 pl-1.5 pr-3 text-sm transition-colors hover:bg-site-surface-hover"
 title={t('achievements-showcase', { defaultValue:'View all achievements'})}
 >
 <span className="flex items-center">
 {top.map((a, i) => (
 <span
 key={a.id}
 title={a.name}
 className={`flex h-7 w-7 items-center justify-center rounded-full border-2 bg-site-bg text-sm leading-none ${i > 0 ?'-ml-1.5':''}`}
 style={{ borderColor: TIER_COLORS[a.tier] }}
 >
 <span aria-hidden>{a.icon}</span>
 <span className="sr-only">{a.name}</span>
 </span>
 ))}
 </span>
 <span className="flex items-center gap-1 text-site-text-dim">
 <Trophy className="h-3.5 w-3.5 text-site-warning"aria-hidden />
 {t('achievements-count', { count: unlockedCount, defaultValue:'{{count}} achievements'})}
 </span>
 </button>
 );
}
