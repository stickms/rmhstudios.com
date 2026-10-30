/** Client-safe shape of a Workshop entry. */

import type { PersonRef } from '@/lib/games/community-types';

export type WorkshopItem = {
  slug: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  likes: number;
  views: number;
  publishedAt: string;
  author: PersonRef;
};
