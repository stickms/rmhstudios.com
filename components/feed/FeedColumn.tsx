'use client';

import { FeedTabs } from './FeedTabs';
import { ComposeBox } from './ComposeBox';
import { FeedList } from './FeedList';

export function FeedColumn() {
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-site-bg/85 backdrop-blur-md border-b border-site-border">
        <div className="flex items-center gap-3 px-4 py-3">
          <h1 className="font-(family-name:--site-font-display) font-bold text-lg text-site-text">
            Home
          </h1>
        </div>
        <FeedTabs />
      </div>

      {/* Compose */}
      <ComposeBox />

      {/* Feed */}
      <FeedList />
    </div>
  );
}
