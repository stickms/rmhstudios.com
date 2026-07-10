import type { ReactionSummary } from '@/lib/social/reactions';

export type FeedItemType =
  | "rmhark"
  | "game_announcement"
  | "app_announcement"
  | "news"
  | "blog"
  | "research";

export interface UserCosmetics {
  nameColor?: { color?: string; gradient?: string };
  avatarFrame?: { color?: string; gradient?: string };
  badge?: { emoji?: string };
  banner?: { gradient?: string };
  postFlair?: { className?: string; color?: string; gradient?: string };
  pet?: { emoji?: string };
}

export interface FeedItemUser {
  id: string;
  name?: string | null;
  username?: string | null;
  handle?: string | null;
  image?: string | null;
  isVerified?: boolean;
  isAdmin?: boolean;
  /** Equipped shop cosmetics (name color, avatar frame, badge, …). */
  cosmetics?: UserCosmetics;
}

export interface FeedPollOption {
  id: string;
  text: string;
  voteCount: number;
}

export interface FeedPoll {
  id: string;
  question: string;
  multiSelect: boolean;
  totalVotes: number;
  options: FeedPollOption[];
  myVotes?: string[]; // option IDs the current user voted for
  closesAt?: string | null; // scheduled close time, if any
}

export interface FeedItem {
  id: string;
  type: FeedItemType;
  createdAt: string;

  // RMHark fields
  content?: string;
  user?: FeedItemUser;
  likeCount?: number;
  commentCount?: number;
  repostCount?: number;
  viewCount?: number;
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
  pinned?: boolean;
  edited?: boolean;
  // Paid post: locked = content hidden until unlocked with coins.
  locked?: boolean;
  unlockPrice?: number;
  original?: FeedItem;
  repostedBy?: FeedItemUser;
  actualId?: string;

  // Soft deletions
  deletedAt?: string | null;
  deletedByAdmin?: boolean;

  /**
   * Client-only: an optimistic post inserted at the top of the feed that is
   * still awaiting its server round-trip. Rendered dimmed + non-interactive
   * until `reconcileItem` swaps in the authoritative record.
   */
  pending?: boolean;

  // Poll & GIF attachments
  poll?: FeedPoll;
  gifUrl?: string;
  imageUrls?: string[];

  /** Grouped-by-emoji reaction summary (server-side via `groupReactions`). */
  reactions?: ReactionSummary[];

  // Announcement fields (games/apps/news/blog/research)
  title?: string;
  description?: string;
  href?: string;
  imagePath?: string;
  tags?: string[];
  gradient?: string;
  iconName?: string;
  category?: string;
  sourcePublisher?: string;
}

export type FeedFilter =
  | "all"
  | "rmhark"
  | "game"
  | "app"
  | "news"
  | "blog"
  | "research"
  | "other"
  | "friends";
