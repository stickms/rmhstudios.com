'use client';

import { useFeedStore } from '@/stores/feedStore';
import type { FeedFilter } from '@/lib/feed-types';

const contentTabs: { label: string; value: FeedFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'RMHarks', value: 'rmhark' },
  { label: 'Games', value: 'game' },
  { label: 'Apps', value: 'app' },
  { label: 'Blog', value: 'blog' },
];

interface FeedTabsProps {
  mode: 'feed' | 'friends';
  onModeChange: (mode: 'feed' | 'friends') => void;
}

export function FeedTabs({ mode, onModeChange }: FeedTabsProps) {
  const { filter, setFilter } = useFeedStore();

  return (
    <div className="border-b border-site-border">
      {/* Feed / Friends mode selector */}
      <div className="flex border-b border-site-border">
        <button
          onClick={() => onModeChange('feed')}
          aria-pressed={mode === 'feed'}
          className={`flex-1 px-4 py-2.5 text-sm font-bold transition-colors relative ${
            mode === 'feed'
              ? 'text-site-text'
              : 'text-site-text-muted hover:text-site-text hover:bg-site-surface/50'
          }`}
        >
          For You
          {mode === 'feed' && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-site-accent rounded-full" />
          )}
        </button>
        <button
          onClick={() => onModeChange('friends')}
          aria-pressed={mode === 'friends'}
          className={`flex-1 px-4 py-2.5 text-sm font-bold transition-colors relative ${
            mode === 'friends'
              ? 'text-site-text'
              : 'text-site-text-muted hover:text-site-text hover:bg-site-surface/50'
          }`}
        >
          Following
          {mode === 'friends' && (
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-10 h-0.5 bg-site-accent rounded-full" />
          )}
        </button>
      </div>

      {/* Content type filters (only in feed mode) */}
      {mode === 'feed' && (
        <div className="flex overflow-x-auto scrollbar-none">
          {contentTabs.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              aria-pressed={filter === tab.value}
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
      )}
    </div>
  );
}
