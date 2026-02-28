'use client';

import type { FeedItem as FeedItemType } from '@/lib/feed-types';
import { RMHarkCard } from './RMHarkCard';
import { AnnouncementCard } from './AnnouncementCard';

interface FeedItemProps {
  item: FeedItemType;
}

export function FeedItem({ item }: FeedItemProps) {
  switch (item.type) {
    case 'rmhark':
      return <RMHarkCard item={item} />;
    case 'game_announcement':
    case 'app_announcement':
      return <AnnouncementCard item={item} variant="product" />;
    case 'news':
    case 'blog':
      return <AnnouncementCard item={item} variant="article" />;
    case 'research':
      return <AnnouncementCard item={item} variant="research" />;
    default:
      return null;
  }
}
