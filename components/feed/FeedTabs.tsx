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

  // §5.45: the tab strips are standalone glass sheets BELOW the header capsule
  // (FeedColumn positions them), separated by the standard gutter. The For You /
  // Following selector shows at every breakpoint now (the desktop copy that used
  // to live inline in the header is gone). Each LiquidTabs is its own pill sheet.
  return (
    <div className="space-y-3">
      {/* Feed / Friends mode selector. The flowing capsule carries the ambient
          sheen (counts against the ≤3/page). */}
      <LiquidTabs
        tabs={modeTabs}
        value={mode}
        onChange={(id) => onModeChange(id as 'feed' | 'friends')}
      />

      {/* Content type filters (only in feed mode). The w-fit pill scrolls inside
          the shared tab-sheet track (overflow + edge fade, §5.5x A.4) when it
          exceeds the column width. */}
      {mode === 'feed' && (
        <div className="tab-sheet-scroll">
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
