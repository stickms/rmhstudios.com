'use client';

import { useFeedStore } from '@/stores/feedStore';
import type { FeedFilter } from '@/lib/feed-types';
import { LiquidTabs } from '@/components/ui/liquid-tabs';

// Labels stay hardcoded literals (unchanged from the pre-LiquidTabs version) so
// this migration introduces no i18n churn (§5.4/Phase C constraint).
const contentTabs: { id: FeedFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'rmhark', label: 'RMHarks' },
  { id: 'game', label: 'Games' },
  { id: 'app', label: 'Apps' },
  { id: 'blog', label: 'Blog' },
];

const modeTabs: { id: 'feed' | 'friends'; label: string }[] = [
  { id: 'feed', label: 'For You' },
  { id: 'friends', label: 'Following' },
];

interface FeedTabsProps {
  mode: 'feed' | 'friends';
  onModeChange: (mode: 'feed' | 'friends') => void;
}

export function FeedTabs({ mode, onModeChange }: FeedTabsProps) {
  const { filter, setFilter } = useFeedStore();

  return (
    <div>
      {/* Feed / Friends mode selector — hidden on md+ where FeedColumn already
          renders the For You / Following tabs inline in the header (avoids
          showing the same toggle twice when filters are open). The flowing
          capsule carries the ambient sheen (counts against the ≤3/page). */}
      <div className="md:hidden px-3 py-2">
        <LiquidTabs
          tabs={modeTabs}
          value={mode}
          onChange={(id) => onModeChange(id as 'feed' | 'friends')}
        />
      </div>

      {/* Content type filters (only in feed mode) */}
      {mode === 'feed' && (
        <div className="overflow-x-auto scrollbar-none px-3 py-2">
          <LiquidTabs
            tabs={contentTabs}
            value={filter}
            onChange={(id) => setFilter(id as FeedFilter)}
          />
        </div>
      )}
    </div>
  );
}
