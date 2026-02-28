'use client';

import { useFeedStore } from '@/stores/feedStore';
import type { FeedFilter } from '@/lib/feed-types';

const tabs: { label: string; value: FeedFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'RMHeets', value: 'rmheet' },
  { label: 'Games', value: 'game' },
  { label: 'Apps', value: 'app' },
  { label: 'News', value: 'news' },
  { label: 'Blog', value: 'blog' },
  { label: 'Research', value: 'research' },
];

export function FeedTabs() {
  const { filter, setFilter } = useFeedStore();

  return (
    <div className="flex overflow-x-auto border-b border-site-border scrollbar-none">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => setFilter(tab.value)}
          className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors relative ${
            filter === tab.value
              ? 'text-site-accent'
              : 'text-site-text-muted hover:text-site-text hover:bg-site-surface/50'
          }`}
        >
          {tab.label}
          {filter === tab.value && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-site-accent rounded-full" />
          )}
        </button>
      ))}
    </div>
  );
}
