import { useEffect } from 'react';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { errorField, fetchJson } from '@/lib/http';
import { toast } from '@/lib/toast';
import { Trophy, Users, Gamepad2, Coins, Hammer, Sparkles, Lock } from'lucide-react';
import { AchievementMedal } from './AchievementMedal';
import { useTranslation } from'react-i18next';
import { Spinner } from'@/components/ui/spinner';
import { EmptyState } from'@/components/ui/empty-state';
import {
 TIER_COLORS,
 CATEGORY_LABELS,
 type AchievementCategory,
 type AchievementTier,
} from'@/lib/achievements/catalog';
import { ColumnHeader } from'./ColumnHeader';
import { AchievementTips } from'@/components/arcade/AchievementTips';
import { useArrival } from '@/components/ui/arrive';
import { Skeleton } from '@/components/ui/skeleton';
import { AchievementFilters, type AchievementListView } from '@/components/achievements/AchievementFilters';
import { AchievementProgress } from '@/components/achievements/AchievementProgress';
import { ClosestStrip } from '@/components/achievements/ClosestStrip';
import { TrackedStrip, type StripRow } from '@/components/achievements/TrackedStrip';
import { TrackToggle } from '@/components/achievements/TrackToggle';
import { CompareWithField } from '@/components/achievements/CompareWithField';
import {
 TRACKED_ACHIEVEMENTS_KEY,
 setAchievementTracked,
 trackedAchievementsQuery,
} from '@/lib/achievements/tracking.queries';
import { closest, filterAchievements, sortAchievements } from '@/lib/achievements/tracking';

// Library icons per achievement category (replaces emoji badges).
const CATEGORY_ICON: Record<AchievementCategory, typeof Users> = {
 social: Users,
 games: Gamepad2,
 economy: Coins,
 creator: Hammer,
 special: Sparkles,
};

interface AchievementView {
 id: string;
 name: string;
 description: string;
 icon: string;
 category: AchievementCategory;
 tier: AchievementTier;
 group: string | null;
 target: number;
 coinReward: number;
 secret: boolean;
 unlocked: boolean;
 unlockedAt: string | null;
 progress: number;
}
interface Payload {
 stats: { unlocked: number; total: number; coinsEarned: number };
 achievements: AchievementView[];
}

const CATEGORY_ORDER: AchievementCategory[] = ['social','games','creator','economy','special'];

export function AchievementsColumn({
 userId,
 hideHeader = false,
 own = false,
 initialData,
 onLoaded,
}: {
 userId: string;
 hideHeader?: boolean;
 /** The viewer's own achievements: adds tracking, the "Closest to unlocking" strip and the list filters. */
 own?: boolean;
 /** Called once the list has rendered with data (the profile scrolls its tab bar into view then). */
 onLoaded?: () => void;
 /** Achievement payload prefetched by the route loader; `null`when signed out. */
 initialData?: Payload | null;
}) {
 const { t } = useTranslation('feed');
 const { t: tn } = useTranslation('achievement-tracker');
 const queryClient = useQueryClient();
 // The route loader's payload seeds the cache so the grid paints immediately; otherwise
 // (another tab, another user) it is fetched like any query.
 const { data, isPending: loading } = useQuery({
 queryKey: ['achievements', userId],
 queryFn: () => fetchJson<Payload>(`/api/achievements/${encodeURIComponent(userId)}`),
 ...(initialData ? { initialData } : {}),
 staleTime: 15_000,
 });
 const hasData = Boolean(data);
 const trackedQuery = useQuery(trackedAchievementsQuery(own));
 const [view, setView] = useState<AchievementListView>({ state: 'all', category: 'all', sort: 'catalog' });
 const toggle = useMutation({
 mutationFn: ({ id, tracked }: { id: string; tracked: boolean }) => setAchievementTracked(id, tracked),
 onSuccess: (next) => queryClient.setQueryData(TRACKED_ACHIEVEMENTS_KEY, next),
 onError: (error) => {
 toast.error(
 errorField(error, 'code') === 'limit'
 ? tn('track-limit', {
 count: trackedQuery.data?.max ?? 5,
 defaultValue: 'You can track up to {{count}} achievements. Untrack one first.',
 })
 : tn('track-failed', { defaultValue: 'Could not update your tracked achievements.' }),
 );
 },
 });
 const busyId = toggle.isPending ? (toggle.variables?.id ?? null) : null;
 const trackedIds = useMemo(() => new Set(trackedQuery.data?.tracked ?? []), [trackedQuery.data]);
 const rarity = useMemo(
 () => new Map(Object.entries(trackedQuery.data?.rarity ?? {}).map(([id, pct]) => [id, { pct }])),
 [trackedQuery.data],
 );
 useEffect(() => {
 if (hasData) onLoaded?.();
 // Once per arrival of data; a new `onLoaded` identity each render must not re-fire it.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 }, [hasData]);
 // Steel M9: achievements fetched here replace the spinner; the loader's seed is there on first paint.
 const arrival = useArrival(!loading);

 if (loading) {
 return (
 <div className="flex justify-center px-4 pt-4 pb-12">
 <Spinner />
 </div>
 );
 }
 if (!data) {
 return (
 <EmptyState
 className={arrival}
 description={t('could-not-load-achievements', {
 defaultValue:'Could not load achievements.',
 })}
 />
 );
 }

 const byId = new Map(data.achievements.map((a) => [a.id, a]));
 const trackedLoaded = own && trackedQuery.data !== undefined;
 const toRow = (id: string, progress: number): StripRow | null => {
 const a = byId.get(id);
 return a ? { id, name: a.name, progress, target: a.target } : null;
 };
 const closestRows = trackedLoaded
 ? closest(
 data.achievements,
 data.achievements.map((a) => ({ achievementId: a.id, progress: a.progress, unlockedAt: a.unlockedAt })),
 rarity,
 )
 .map((e) => toRow(e.id, e.progress))
 .filter((r): r is StripRow => r !== null)
 : [];
 const trackedRows = (trackedQuery.data?.tracked ?? [])
 .filter((id) => byId.get(id)?.unlocked === false)
 .map((id) => toRow(id, byId.get(id)?.progress ?? 0))
 .filter((r): r is StripRow => r !== null);
 const shown = own
 ? sortAchievements(
 filterAchievements(data.achievements, {
 state: view.state,
 category: view.category === 'all' ? null : view.category,
 tracked: trackedIds,
 }),
 view.sort,
 rarity,
 )
 : data.achievements;
 const onToggle = (id: string, tracked: boolean) => toggle.mutate({ id, tracked });

 const pct = data.stats.total ? Math.round((data.stats.unlocked / data.stats.total) * 100) : 0;

 // The `{' '}` separators below are load-bearing. They used to be `{''}`, and
 // because JSX drops the newline between the count and the following word the
 // page rendered "0 / 79unlocked" and "0earned" with no space at all. (Written
 // here rather than as a JSX comment beside the strings: a `{/* … */}` directly
 // before a `t()` call makes i18next-parser skip the key entirely.)
 const Stats = (
 <>
 <div className="flex items-center gap-3 text-sm text-site-text-muted">
 <span>
 <strong className="text-site-text">{data.stats.unlocked}</strong> / {data.stats.total}{' '}
 {t('unlocked', { defaultValue:'Unlocked!'})}
 </span>
 <span aria-hidden>·</span>
 <span className="inline-flex items-center gap-1">
 <Coins className="h-3.5 w-3.5 text-site-warning"/> {data.stats.coinsEarned}{' '}
 {t('earned', { defaultValue:'earned'})}
 </span>
 </div>
 <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-site-surface">
 <div
 className="h-full w-full rounded-full bg-site-accent origin-left transition-transform duration-site-slow"
 style={{ transform: `scaleX(${pct / 100})`}}
 />
 </div>
 </>
 );

 return (
 <div className={arrival}>
 {/* hideHeader === embedded in /progress or ProfileColumn, which supply
 the page header (and the drawer button); only the stats survive. */}
 {hideHeader ? (
 <div className="pt-4">{Stats}</div>
 ) : (
 <>
 <ColumnHeader
 icon={Trophy}
 title={t('achievements-header', { defaultValue:'Achievements'})}
 />
 <div className="pt-4">{Stats}</div>
 </>
 )}

 {own && <CompareWithField />}
 {own && trackedQuery.isPending && <Skeleton className="mt-6 h-24 w-full" />}
 {own && trackedQuery.isError && (
 <p className="t-meta pt-6">
 {tn('tracked-load-failed', { defaultValue: 'Could not load your tracked achievements.' })}
 </p>
 )}
 {trackedLoaded && (
 <>
 <TrackedStrip
 rows={trackedRows}
 max={trackedQuery.data?.max ?? 5}
 busyId={busyId}
 onUntrack={(id) => onToggle(id, true)}
 />
 <ClosestStrip rows={closestRows} tracked={trackedIds} busyId={busyId} onToggle={onToggle} />
 </>
 )}
 {own && (
 <AchievementFilters
 value={view}
 categories={CATEGORY_ORDER.map((id) => ({ id, label: CATEGORY_LABELS[id] }))}
 onChange={setView}
 />
 )}

 {own && shown.length === 0 && (
 <EmptyState
 description={tn('no-matches', { defaultValue: 'No achievements match these filters.' })}
 />
 )}
 <div className="space-y-6 pt-4 pb-12">
 {CATEGORY_ORDER.map((cat) => {
 const list = shown.filter((a) => a.category === cat);
 if (list.length === 0) return null;
 return (
 <section key={cat}>
 <h2 className="site-section-label mb-3">
 {CATEGORY_LABELS[cat]}
 </h2>
 <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
 {list.map((a) => {
 const incremental = a.target > 1 && !a.unlocked;
 return (
 <div
 key={a.id}
 className={`flex items-start gap-3 rounded-site px-4 py-3 transition-colors ${
 a.unlocked ?'':'opacity-70'
 }`}
 >
 {(() => {
 const Icon = a.secret && !a.unlocked ? Lock : CATEGORY_ICON[a.category];
 return (
 <div
 className="flex h-10 w-10 shrink-0 items-center justify-center rounded-site-sm"
 style={{
 background: a.unlocked
 ? `${TIER_COLORS[a.tier]}22`
 :'var(--site-surface)',
 }}
 >
 <Icon
 className="h-5 w-5"
 style={{
 color: a.unlocked ? TIER_COLORS[a.tier] :'var(--site-text-muted)',
 }}
 />
 </div>
 );
 })()}
 <div className="min-w-0 flex-1">
 <div className="flex items-center gap-2">
 <p className="truncate text-sm font-semibold text-site-text">{a.name}</p>
 <AchievementMedal tier={a.tier} />
 </div>
 <p className="mt-1 text-xs text-site-text-muted">{a.description}</p>
 {incremental && (
 <div className="mt-2">
 <AchievementProgress name={a.name} progress={a.progress} target={a.target} />
 <p className="mt-1 text-xs text-site-text-muted">
 {a.progress} / {a.target}
 </p>
 </div>
 )}
 {!(a.secret && !a.unlocked) && <AchievementTips achievementId={a.id} name={a.name} />}
 {own && !a.unlocked && !a.secret && (
 <div className="mt-2">
 <TrackToggle
 name={a.name}
 tracked={trackedIds.has(a.id)}
 busy={busyId === a.id}
 onToggle={() => onToggle(a.id, trackedIds.has(a.id))}
 />
 </div>
 )}
 {a.unlocked && a.coinReward > 0 && (
 <p className="mt-1 inline-flex items-center gap-1 text-xs text-site-text-muted">
 <Coins className="h-3 w-3 text-site-warning"/> +{a.coinReward}
 </p>
 )}
 </div>
 </div>
 );
 })}
 </div>
 </section>
 );
 })}
 </div>
 </div>
 );
}
