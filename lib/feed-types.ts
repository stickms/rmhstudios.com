export type FeedItemType =
  | "rmheet"
  | "game_announcement"
  | "app_announcement"
  | "news"
  | "blog"
  | "research";

export interface FeedItemUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
}

export interface FeedItem {
  id: string;
  type: FeedItemType;
  createdAt: string;

  // RMHeet fields
  content?: string;
  user?: FeedItemUser;
  likeCount?: number;
  commentCount?: number;
  repostCount?: number;
  viewCount?: number;
  liked?: boolean;
  reposted?: boolean;
  original?: FeedItem;

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
  | "rmheet"
  | "game"
  | "app"
  | "news"
  | "blog"
  | "research";
