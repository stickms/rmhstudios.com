'use client';

import { memo } from'react';
import type { FeedItem as FeedItemType } from'@/lib/feed-types';
import { RMHarkCard } from'./RMHarkCard';
import { AnnouncementCard } from'./AnnouncementCard';

interface FeedItemProps {
 item: FeedItemType;
}

// Memoized: the feed list re-renders on every store mutation (a new page, a
// like, an incoming SSE post), but each row's `item`reference is stable unless
// that row actually changed — so a memoized FeedItem skips re-rendering the
// heavy card for every row that didn't change.
export const FeedItem = memo(function FeedItem({ item }: FeedItemProps) {
 switch (item.type) {
 case'rmhark':
 return <RMHarkCard item={item} />;
 case'game_announcement':
 case'app_announcement':
 return <AnnouncementCard item={item} variant="product"/>;
 case'news':
 case'blog':
 return <AnnouncementCard item={item} variant="article"/>;
 case'research':
 return <AnnouncementCard item={item} variant="research"/>;
 default:
 return null;
 }
});
