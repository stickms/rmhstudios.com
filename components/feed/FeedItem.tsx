'use client';

import type { FeedItem as FeedItemType } from '@/lib/feed-types';
import { RMHeetCard } from './RMHeetCard';
import { AnnouncementCard } from './AnnouncementCard';

interface FeedItemProps {
  item: FeedItemType;
}

export function FeedItem({ item }: FeedItemProps) {
  switch (item.type) {
    case 'rmheet':
      return <RMHeetCard item={item} />;
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
