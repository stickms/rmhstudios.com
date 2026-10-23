'use client';

import { useState } from'react';
import { Flame, Zap, Trophy } from'lucide-react';
import { useTranslation } from'react-i18next';
import { ProgressColumn } from'./ProgressColumn';
import { AchievementsColumn } from'./AchievementsColumn';
import { StreakColumn } from'./StreakColumn';
import { PageTabs } from'./PageTabs';
import { Reveal } from'@/components/motion';
import type { AchievementsPayload } from'@/lib/achievements.server';

export type JourneyTab ='streaks'|'progress'|'achievements';

const TABS: { id: JourneyTab; labelKey: string; defaultLabel: string; icon: typeof Flame }[] = [
 { id:'streaks', labelKey:'journey-tab-streaks', defaultLabel:'Streaks', icon: Flame },
 { id:'progress', labelKey:'journey-tab-progress', defaultLabel:'Progress', icon: Zap },
 {
 id:'achievements',
 labelKey:'journey-tab-achievements',
 defaultLabel:'Achievements',
 icon: Trophy,
 },
];

/**
 * Combined"journey"page bundling the Streaks, Progress, and Achievements
 * sections under a single sticky tab bar. The individual columns render
 * embedded (without their own page headers).
 */
function isJourneyTab(value: string): value is JourneyTab {
 return value ==='streaks'|| value ==='progress'|| value ==='achievements';
}

export function JourneyColumn({
 userId,
 initialTab ='progress',
 achievementsInitialData,
}: {
 userId: string;
 initialTab?: JourneyTab;
 /** Achievements payload prefetched by the `/achievements`route loader, forwarded to the embedded column. */
 achievementsInitialData?: AchievementsPayload | null;
}) {
 const { t } = useTranslation('feed');
 const [tab, setTab] = useState<JourneyTab>(() => {
 if (typeof window !=='undefined') {
 const hash = window.location.hash.replace('#','');
 if (isJourneyTab(hash)) return hash;
 }
 return initialTab;
 });

 function selectTab(next: JourneyTab) {
 setTab(next);
 if (typeof window !=='undefined') {
 history.replaceState(null,'', `#${next}`);
 }
 }

 return (
 <div>
 {/* Reveal header — stat-grid dashboard, lighter treatment than marquee pages. */}
 <Reveal>
 {/* The tab strip *is* this page's header: no title, so the nav fills the
 row. PageTabs owns the placement (same gutter and sheet as Inbox and
 Explore) instead of a one-off sticky capsule. */}
 <PageTabs
 aria-label={t('journey-sections-label', { defaultValue:'Journey sections'})}
 value={tab}
 onChange={(id) => selectTab(id as JourneyTab)}
 tabs={TABS.map(({ id, labelKey, defaultLabel, icon }) => ({
 id,
 label: t(labelKey, { defaultValue: defaultLabel }),
 icon,
 }))}
 />
 </Reveal>

 {tab ==='streaks'&& <StreakColumn hideHeader />}
 {tab ==='progress'&& <ProgressColumn hideHeader />}
 {tab ==='achievements'&& (
 <AchievementsColumn userId={userId} hideHeader initialData={achievementsInitialData} />
 )}
 </div>
 );
}
