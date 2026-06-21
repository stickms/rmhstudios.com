export type FeedItemType =
  | "rmhark"
  | "game_announcement"
  | "app_announcement"
  | "news"
  | "blog"
  | "research";

export interface FeedItemUser {
  id: string;
  name?: string | null;
  username?: string | null;
  handle?: string | null;
  image?: string | null;
  isVerified?: boolean;
  isAdmin?: boolean;
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
  original?: FeedItem;
  repostedBy?: FeedItemUser;
  actualId?: string;

  // Soft deletions
  deletedAt?: string | null;
  deletedByAdmin?: boolean;

  // Poll & GIF attachments
  poll?: FeedPoll;
  gifUrl?: string;
  imageUrls?: string[];

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
