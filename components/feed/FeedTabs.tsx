'use client';

import { useTranslation } from 'react-i18next';
import type { FeedFilter } from '@/lib/feed-types';
import { useFeedStore } from '@/stores/feedStore';
import { LiquidTabs } from '@/components/ui/liquid-tabs';

interface FeedTabsProps {
  mode: 'feed' | 'friends';
  onModeChange: (mode: 'feed' | 'friends') => void;
}

export function FeedTabs({ mode, onModeChange }: FeedTabsProps) {
  const { t } = useTranslation('feed');
  const filter = useFeedStore((state) => state.filter);
  const setFilter = useFeedStore((state) => state.setFilter);

  const timelines = [
    { id: 'feed', label: t('feed-for-you', { defaultValue: 'For you' }) },
    { id: 'friends', label: t('feed-following', { defaultValue: 'Following' }) },
  ] as const;
  const filters: { id: FeedFilter; label: string }[] = [
    { id: 'all', label: t('feed-filter-all', { defaultValue: 'All' }) },
    { id: 'rmhark', label: t('feed-filter-rmharks', { defaultValue: 'RMHarks' }) },
    { id: 'game', label: t('feed-filter-games', { defaultValue: 'Games' }) },
    { id: 'app', label: t('feed-filter-apps', { defaultValue: 'Apps' }) },
    { id: 'blog', label: t('feed-filter-blog', { defaultValue: 'Journal' }) },
  ];

  return (
    <section
      className="feed-tabs"
      aria-label={t('feed-view-heading-rewrite', { defaultValue: 'Choose your feed' })}
    >
      <LiquidTabs
        className="feed-tabs__timeline"
        tabs={[...timelines]}
        value={mode}
        onChange={(id) => onModeChange(id === 'friends' ? 'friends' : 'feed')}
        aria-label={t('feed-view-heading-rewrite', { defaultValue: 'Choose your feed' })}
      />

      {mode === 'feed' && (
        <LiquidTabs
          className="feed-tabs__filters"
          tabs={filters}
          value={filter}
          onChange={(id) => setFilter(id as FeedFilter)}
          aria-label={t('feed-content-filter-label', { defaultValue: 'Content type' })}
        />
      )}
    </section>
  );
}
