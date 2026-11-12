import { useEffect, useState } from'react';
import { Flame, Trophy, CalendarCheck, Check } from'lucide-react';
import { CoinIcon } from'@/components/rmhcoins/CoinIcon';
import { Spinner } from'@/components/ui/spinner';
import { EmptyState } from'@/components/ui/empty-state';
import { useTranslation } from'react-i18next';
import { api } from '@/lib/contract/client';
import { getStreakApi } from '@/lib/streak.contract';
import { ColumnHeader } from'./ColumnHeader';

interface StreakState {
 current: number;
 longest: number;
 totalCheckIns: number;
 checkedInToday: boolean;
 reward: number;
}

// Streak milestones that unlock rewards / achievements.
const MILESTONES = [
 { day: 7, label:'7-day streak'},
 { day: 30, label:'30-day streak'},
 { day: 100, label:'100-day streak'},
];

export function StreakColumn({ hideHeader = false }: { hideHeader?: boolean } = {}) {
 const { t } = useTranslation('feed');
 const [streak, setStreak] = useState<StreakState | null>(null);
 const [loading, setLoading] = useState(true);

 useEffect(() => {
 let active = true;
 (async () => {
 try {
 const data = await api(getStreakApi);
 if (active) setStreak(data);
 } catch {
 // A failed read leaves the empty state below.
 } finally {
 if (active) setLoading(false);
 }
 })();
 return () => {
 active = false;
 };
 }, []);

 if (loading) {
 return (
 <div className="flex justify-center px-4 pt-4 pb-12">
 <Spinner />
 </div>
 );
 }
 if (!streak) {
 return (
 <EmptyState
 description={t('streak-load-error', { defaultValue:'Could not load your streak.'})}
 />
 );
 }

 const next = MILESTONES.find((m) => m.day > streak.current);
 const nextPct = next ? Math.min(100, Math.round((streak.current / next.day) * 100)) : 100;

 return (
 <div>
 {/* hideHeader === embedded in JourneyColumn, which supplies the page
 header (and the drawer button) itself. */}
 {!hideHeader && (
 <ColumnHeader>
 <div className="flex items-center gap-2">
 <Flame className="h-5 w-5 text-site-warning"/>
 <h1 className="text-lg font-semibold text-site-text">
 {t('streak-title', { defaultValue:'Streak'})}
 </h1>
 </div>
 </ColumnHeader>
 )}

 <div className="space-y-8 p-4">
 {/* Current streak hero */}
 <div>
 <section className="flex flex-col items-center gap-3 rounded-site p-6 text-center">
 <div className="flex h-20 w-20 items-center justify-center rounded-full bg-site-warning/15">
 <Flame className="h-10 w-10 fill-site-warning/30 text-site-warning"/>
 </div>
 <div>
 <p className="text-4xl font-semibold text-site-text">{streak.current}</p>
 <p className="text-sm text-site-text-muted">
 {streak.current === 1
 ? t('streak-day-in-a-row', { defaultValue:'day in a row'})
 : t('streak-days-in-a-row', { defaultValue:'days in a row'})}
 </p>
 </div>
 {streak.checkedInToday ? (
 <span className="inline-flex items-center gap-1.5 rounded-full bg-site-success/15 px-3 py-1.5 text-sm font-semibold text-site-success">
 <Check className="h-4 w-4"/>{''}
 {t('checked-in-today', { defaultValue:'Checked in today'})}
 </span>
 ) : (
 <span className="inline-flex items-center gap-1.5 rounded-full bg-site-warning/15 px-3 py-1.5 text-sm font-semibold text-site-warning">
 <Flame className="h-4 w-4"/>{''}
 {t('visit-today-to-keep-alive', { defaultValue:'Visit today to keep it alive'})}
 </span>
 )}
 </section>
 </div>

 {/* Stats */}
 <div>
 <div className="grid grid-cols-2 gap-3">
 <div>
 <div
 className={`rounded-site p-5`}
 >
 <div className="flex items-center gap-1.5 site-section-label">
 <Trophy className="h-3.5 w-3.5"/>{''}
 {t('longest-label', { defaultValue:'Longest'})}
 </div>
 <p className="mt-1 text-2xl font-semibold text-site-text">{streak.longest}</p>
 <p className="text-xs text-site-text-muted">
 {streak.longest === 1
 ? t('day-unit', { defaultValue:'day'})
 : t('days-unit', { defaultValue:'days'})}
 </p>
 </div>
 </div>
 <div>
 <div
 className={`rounded-site p-5`}
 >
 <div className="flex items-center gap-1.5 site-section-label">
 <CalendarCheck className="h-3.5 w-3.5"/>{''}
 {t('total-check-ins-label', { defaultValue:'Total check-ins'})}
 </div>
 <p className="mt-1 text-2xl font-semibold text-site-text">{streak.totalCheckIns}</p>
 <p className="text-xs text-site-text-muted">
 {t('all-time', { defaultValue:'all time'})}
 </p>
 </div>
 </div>
 </div>
 </div>

 {/* Next milestone */}
 {next && (
 <div>
 <section className="rounded-site p-5">
 <div className="mb-2 flex items-center justify-between">
 <h2 className="text-sm font-semibold text-site-text">
 {t('next-milestone', { defaultValue:'Next milestone'})}
 </h2>
 <span className="text-xs text-site-text-muted">
 {streak.current} / {next.day} days
 </span>
 </div>
 <div className="h-2.5 w-full overflow-hidden rounded-full bg-site-bg">
 <div
 className="h-full w-full rounded-full bg-site-warning origin-left transition-transform duration-site-slow"
 style={{ transform: `scaleX(${nextPct / 100})`}}
 />
 </div>
 <p className="mt-1.5 text-xs text-site-text-muted">
 {next.day - streak.current === 1
 ? t('more-day-to-milestone', {
 label: next.label,
 defaultValue:'{{count}} more day to reach the {{label}}.',
 count: next.day - streak.current,
 })
 : t('more-days-to-milestone', {
 label: next.label,
 defaultValue:'{{count}} more days to reach the {{label}}.',
 count: next.day - streak.current,
 })}
 </p>
 </section>
 </div>
 )}

 {/* Milestones list */}
 <div>
 <section>
 <h2 className="site-section-label mb-2">
 {t('milestones-heading', { defaultValue:'Milestones'})}
 </h2>
 <div className="space-y-2">
 {MILESTONES.map((m) => {
 const reached = streak.current >= m.day || streak.longest >= m.day;
 return (
 <div
 key={m.day}
 className={`flex items-center gap-3 p-3 transition-[border-color] duration-site ${
 reached
 ?''
 :'border-site-border/60 opacity-70'
 }`}
 >
 <div
 className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-site-sm ${
 reached
 ?'bg-site-warning/15 text-site-warning'
 :'bg-site-surface text-site-text-muted'
 }`}
 >
 <Flame className={`h-4 w-4 ${reached ?'fill-site-warning/30':''}`} />
 </div>
 <div className="min-w-0 flex-1">
 <p className="text-sm font-semibold text-site-text">{m.label}</p>
 <p className="text-xs text-site-text-muted">
 {t('reach-day-streak', {
 day: m.day,
 defaultValue:'Reach a {{day}}-day check-in streak.',
 })}
 </p>
 </div>
 {reached && <Check className="h-4 w-4 shrink-0 text-site-success"/>}
 </div>
 );
 })}
 </div>
 </section>
 </div>

 <p className="flex items-center justify-center gap-1.5 text-center text-xs text-site-text-muted">
 <CoinIcon className="h-3.5 w-3.5"/>{''}
 {t('check-in-daily-earn-coins', {
 defaultValue:'Check in daily to earn coins — rewards grow as your streak does.',
 })}
 </p>
 </div>
 </div>
 );
}
