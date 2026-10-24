'use client';

import { useTranslation } from 'react-i18next';
import type { FeedFilter } from '@/lib/feed-types';
import { useFeedStore } from '@/stores/feedStore';

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
      <div
        className="feed-tabs__timeline"
        aria-label={t('feed-view-heading-rewrite', { defaultValue: 'Choose your feed' })}
      >
        {timelines.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={mode === tab.id}
            data-active={mode === tab.id || undefined}
            onClick={() => onModeChange(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'feed' && (
        <div
          className="feed-tabs__filters"
          aria-label={t('feed-content-filter-label', { defaultValue: 'Content type' })}
        >
          {filters.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-pressed={filter === tab.id}
              data-active={filter === tab.id || undefined}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
