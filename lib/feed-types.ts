import type { ReactionSummary } from '@/lib/social/reactions';
import type { RankedResultView } from '@/lib/feed/ranked-poll';

export type FeedItemType =
  'rmhark' | 'game_announcement' | 'app_announcement' | 'news' | 'blog' | 'research' | 'election_announcement';

/** The live-results payload of an `election_announcement` card (see lib/elections/feed.ts). */
export interface FeedElection {
  /** Election Day, YYYY-MM-DD. */
  date: string;
  phase: 'upcoming' | 'election-day' | 'counting' | 'archive';
  live: boolean;
  called: number;
  total: number;
  /** One row per chamber that has a score to show. `basis` says what the numbers are. */
  chambers: {
    office: 'president' | 'senate' | 'house' | 'governor';
    name: string;
    dem: number;
    gop: number;
    toWin: number;
    basis: 'results' | 'current';
    controlledBy: 'DEM' | 'GOP' | 'OTH' | null;
  }[];
}

export interface UserCosmetics {
  nameColor?: {
    color?: string;
    gradient?: string;
  };
  avatarFrame?: {
    color?: string;
    gradient?: string;
  };
  badge?: {
    emoji?: string;
    /** The drawn art's key (`components/shop/art/BadgeArt`); the emoji is the fallback. */
    art?: string;
  };
  banner?: {
    gradient?: string;
  };
  postFlair?: {
    className?: string;
    color?: string;
    gradient?: string;
  };
  pet?: {
    emoji?: string;
    /** The drawn art's key (`components/shop/art/PetArt`); the emoji is the fallback. */
    art?: string;
  };
}

export interface FeedItemUser {
  id: string;
  name?: string | null;
  username?: string | null;
  handle?: string | null;
  image?: string | null;
  isVerified?: boolean;
  isAdmin?: boolean;
  isBot?: boolean;
  /** The author hides the counts on their posts from other viewers (lib/feed/quiet-counts). */
  hideCounts?: boolean;
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
  /** s06-19: a ranked-choice poll. Absent on plain and multi-select polls. */
  ranked?: true;
  /** A ranked poll: the viewer's own ballot, option ids from rank 1. */
  myRanking?: string[];
  /** A ranked poll that has ended and been counted: the winner and the rounds (`lib/feed/ranked-poll`). */
  result?: RankedResultView;
  /** s07-19: a quiz poll. The marker is always present on a quiz; the answer only once earned (`lib/feed/quiz-poll`). */
  quiz?: true;
  /** A quiz the viewer may see the answer of: its author, a voter, or anyone once it has ended. */
  correctOptionId?: string;
  explanation?: string;
  totalVotes: number;
  options: FeedPollOption[];
  myVotes?: string[]; // option IDs the current user voted for
  closesAt?: string | null; // the effective end (the author's early end, else the scheduled close), if any
  /** True once the poll has stopped taking votes, whichever way it ended (`lib/feed/poll-lifecycle`). */
  ended?: boolean;
  /** The author extended the poll at least once. */
  extended?: boolean;
  /** The extensions (days) still open to the author; empty when ended or untimed. */
  extendDays?: number[];
}

export interface FeedItem {
  id: string;
  type: FeedItemType;
  createdAt: string;

  // RMHark fields
  content?: string;
  user?: FeedItemUser;
  // `null` = withheld: the author hides the counts on their posts (lib/feed/quiet-counts).
  likeCount?: number | null;
  commentCount?: number | null;
  repostCount?: number | null;
  viewCount?: number | null;
  liked?: boolean;
  reposted?: boolean;
  bookmarked?: boolean;
  pinned?: boolean;
  /** 1-based place among the author's pins on their profile (1 leads). Set on the profile's first page. */
  pinnedOrder?: number;
  edited?: boolean;
  // Paid post: locked = content hidden until unlocked with coins.
  locked?: boolean;
  unlockPrice?: number;
  original?: FeedItem;
  repostedBy?: FeedItemUser;
  actualId?: string;

  /** Authored threads: number of follow-up posts (set on the root, 0 otherwise). */
  threadReplyCount?: number;

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
  /** Description of the GIF (sprint 06 #15); absent = undescribed, rendered as "GIF". */
  gifAlt?: string;
  imageUrls?: string[];
  /** Per-image alt text, aligned by index with `imageUrls` (may be shorter). */
  imageAlts?: string[];
  /** Content warning: render media/text behind a click-to-reveal overlay. */
  isSensitive?: boolean;
  /** Why the post is warned (sprint 06 #16, 1-80 characters): the reason covers the text too; absent = media only. */
  contentWarning?: string;
  /** Who can reply to this post. */
  replyControl?: 'EVERYONE' | 'FOLLOWING' | 'MENTIONED';
  /** Take meter (X6): readers vote agree/disagree. The split is NOT in the payload. */
  isTake?: boolean;
  /** X3 — at least one context note is visible; the notes load lazily. */
  hasNote?: boolean;
  /** F14 — the post carries a runnable code snippet; it loads only on click. */
  hasEmbed?: boolean;
  /** A vibe page is pinned to the post (RMH Vibes). */
  hasVibe?: boolean;
  /** s03-13: the community this post was read from (community feed only), for "breaks a rule" reports. */
  communitySlug?: string;
  /** N1: community post flair (community feeds only). */
  communityFlair?: {
    id: string;
    name: string;
    color: string;
  };
  /** posts-plus X5: id of the series this post is a part of (details load lazily). */
  seriesId?: string;
  /** posts-plus X8: ISO time after which the post disappears (author-chosen TTL). */
  expiresAt?: string;
  /** The reply the author pinned to the top of this post's conversation (post detail only). */
  pinnedReplyId?: string | null;

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
  /** Live results for an `election_announcement` card. */
  election?: FeedElection;
}

export type FeedFilter = 'all' | 'rmhark' | 'game' | 'app' | 'news' | 'blog' | 'research' | 'other' | 'friends';
