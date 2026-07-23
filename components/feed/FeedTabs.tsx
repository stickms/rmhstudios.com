'use client';

import { useFeedStore } from'@/stores/feedStore';
import type { FeedFilter } from'@/lib/feed-types';
import { LiquidTabs } from'@/components/ui/liquid-tabs';
import { useTranslation } from'react-i18next';

interface FeedTabsProps {
 mode:'feed'|'friends';
 onModeChange: (mode:'feed'|'friends') => void;
}

export function FeedTabs({ mode, onModeChange }: FeedTabsProps) {
 const { t } = useTranslation('feed');
 const { filter, setFilter } = useFeedStore();
 const modeTabs: { id:'feed'|'friends'; label: string }[] = [
 { id:'feed', label: t('feed-for-you', { defaultValue:'For You'}) },
 { id:'friends', label: t('feed-following', { defaultValue:'Following'}) },
 ];
 const contentTabs: { id: FeedFilter; label: string }[] = [
 { id:'all', label: t('feed-filter-all', { defaultValue:'All'}) },
 { id:'rmhark', label: t('feed-filter-rmharks', { defaultValue:'RMHarks'}) },
 { id:'game', label: t('feed-filter-games', { defaultValue:'Games'}) },
 { id:'app', label: t('feed-filter-apps', { defaultValue:'Apps'}) },
 { id:'blog', label: t('feed-filter-blog', { defaultValue:'Blog'}) },
 ];

 // §5.45: the tab strips are standalone glass sheets BELOW the header capsule
 // (FeedColumn positions them), separated by the standard gutter. The For You /
 // Following selector shows at every breakpoint now (the desktop copy that used
 // to live inline in the header is gone). Each LiquidTabs is its own pill sheet.
 return (
 <section className="bg-site-surface border border-site-border rounded-2xl shadow-xs rounded-site p-2.5 sm:p-3"aria-labelledby="feed-view-heading">
 {/* The hierarchy is explicit instead of presenting two unexplained rows of
 pills: the first row chooses the timeline; the second refines content. */}
 <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
 <div className="min-w-0 px-1">
 <h2 id="feed-view-heading"className="text-sm font-semibold text-site-text">
 {t('feed-view-heading', { defaultValue:'Your timeline'})}
 </h2>
 <p className="text-xs text-site-text-dim">
 {t('feed-view-description', { defaultValue:'Choose whose updates you want to see.'})}
 </p>
 </div>
 <LiquidTabs
 tabs={modeTabs}
 value={mode}
 onChange={(id) => onModeChange(id as'feed'|'friends')}
 sheet={false}
 aria-label={t('feed-timeline-label', { defaultValue:'Timeline'})}
 />
 </div>

 {mode ==='feed'&& (
 <div className="mt-2 flex min-w-0 flex-col gap-1.5 border-t border-site-border pt-2 sm:flex-row sm:items-center">
 <span className="shrink-0 px-1 text-xs font-semibold uppercase tracking-wide text-site-text-dim">
 {t('feed-show-label', { defaultValue:'Show'})}
 </span>
 <LiquidTabs
 tabs={contentTabs}
 value={filter}
 onChange={(id) => setFilter(id as FeedFilter)}
 sheet={false}
 scroll
 aria-label={t('feed-content-filter-label', { defaultValue:'Content type'})}
 />
 </div>
 )}
 </section>
 );
}
