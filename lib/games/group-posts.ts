import type { FeedItem } from '@/lib/feed-types';

/** A community post as the Steam group page shows it: plain text, read-only. */
export interface SteamGroupPost {
  id: string;
  content: string;
  createdAt: string;
  author: { id: string; name: string | null; handle: string | null; image: string | null };
  likeCount: number;
  commentCount: number;
}

/** A community announcement as the Steam group page shows it. */
export interface SteamAnnouncement {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string | null; handle: string | null; image: string | null };
}

const MAX_CHARS = 280;

/**
 * The newest plain posts of a community feed. Anything that needs the main site to
 * show properly (paid, sensitive, reposts, non-post items) or is not live (deleted,
 * still sending) is left out rather than shown half-way.
 */
export function toGroupPosts(items: FeedItem[], max = 10): SteamGroupPost[] {
  const out: SteamGroupPost[] = [];
  for (const i of items) {
    if (out.length >= max) break;
    const text = i.content?.trim();
    if (
      i.type !== 'rmhark' ||
      !text ||
      !i.user ||
      i.locked ||
      i.isSensitive ||
      i.deletedAt ||
      i.pending ||
      i.repostedBy
    ) {
      continue;
    }
    out.push({
      id: i.id,
      content: text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}…` : text,
      createdAt: i.createdAt,
      author: {
        id: i.user.id,
        name: i.user.name ?? null,
        handle: i.user.handle ?? null,
        image: i.user.image ?? null,
      },
      likeCount: i.likeCount ?? 0,
      commentCount: i.commentCount ?? 0,
    });
  }
  return out;
}
