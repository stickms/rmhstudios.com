'use client';

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { FeedTabs } from './FeedTabs';
import { ComposeBox } from './ComposeBox';
import { FeedList } from './FeedList';

export function FeedColumn() {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text flex items-center gap-2">
            <span className="md:hidden text-site-accent">RMH</span>
            <span className="md:hidden w-px h-5 bg-site-border" aria-hidden="true" />
            Home
          </h1>
          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className={`p-2 rounded-lg transition-colors ${
              filtersOpen
                ? 'text-site-accent bg-site-accent-dim'
                : 'text-site-text-muted hover:text-site-text hover:bg-site-surface'
            }`}
            title="Toggle feed filters"
          >
            <SlidersHorizontal className="w-5 h-5" />
          </button>
        </div>
        {filtersOpen && <FeedTabs />}
      </div>

      {/* Compose */}
      <ComposeBox />

      {/* Feed */}
      <FeedList />
    </div>
  );
}
