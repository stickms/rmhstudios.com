/**
 * RMH News discussions, the client-safe half: names and shapes shared by the server (./discussion.server.ts), the
 * endpoint and the article page.
 *
 * An article's comments, likes and reposts live on one ordinary post by the RMH News account. That post has
 * `kind = NEWS_POST_KIND`, which keeps it off the Feed and Following timelines (lib/feed/timeline.ts): a post per
 * opened article would bury people's own posts. It reaches a timeline only as a repost, by a reader, or by the RMH
 * News account itself when the feed pick features it (./feed-pick.server.ts).
 */

/** `RMHark.kind` of a discussion post. Its comment rules are `standard` (lib/feed/post-kinds.ts falls back). */
export const NEWS_POST_KIND = 'news';

/** The RMH News account's fixed id. The handle is `NEWS_USER_HANDLE` unless a person already holds it. */
export const NEWS_USER_ID = 'rmh-news';
export const NEWS_USER_HANDLE = 'rmhnews';

export interface NewsDiscussionState {
  /** Null until someone first comments on or reposts the article. */
  postId: string | null;
  /** The post page, where the comments are read and written. Null with `postId`. */
  postHref: string | null;
  commentCount: number;
  repostCount: number;
  likeCount: number;
  /** Whether the viewer has reposted it (false when signed out or there is no post). */
  reposted: boolean;
  /** The moderators removed the discussion post: no new one is made. */
  closed: boolean;
}

export const EMPTY_DISCUSSION: NewsDiscussionState = {
  postId: null,
  postHref: null,
  commentCount: 0,
  repostCount: 0,
  likeCount: 0,
  reposted: false,
  closed: false,
};

/** The post page of a discussion post. */
export function discussionHref(authorHandle: string | null, postId: string): string {
  return `/u/${authorHandle || NEWS_USER_ID}/post/${postId}`;
}

/** The discussion post's text: the headline, then the article's link (which the feed unfurls as its card). */
export function discussionContent(title: string, articleUrl: string): string {
  return `${title}\n\n${articleUrl}`;
}
