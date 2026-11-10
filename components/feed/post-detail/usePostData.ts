import { useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { FeedItem } from '@/lib/feed-types';
import { useFeedStore } from '@/stores/feedStore';
import { useUserDisplayStore } from '@/stores/userDisplayStore';
import { postBodyUrl, postCommentsUrl } from '@/lib/feed/post-detail-prefetch';
import { peekIntentFetch, takeOrFetch } from '@/lib/route/intent-fetch';
import type { Comment } from '../CommentItem';
import { postBodyUsers } from './post-detail-state';

export interface PostData {
  post: FeedItem | null;
  setPost: Dispatch<SetStateAction<FeedItem | null>>;
  comments: Comment[];
  setComments: Dispatch<SetStateAction<Comment[]>>;
  loading: boolean;
  loadingComments: boolean;
  notFound: boolean;
}

/**
 * The post and its replies. Seeded from the feed card's already-known data (and
 * from fetches the route or card already started) so the hero renders without a
 * skeleton, then refreshed from the API.
 */
export function usePostData(postId: string): PostData {
  // §17.2: seed the detail from the feed card's already-known data so the hero (the
  // liquid-open morph target) renders INSTANTLY — no skeleton flash, no second
  // entrance when the fetch lands. Warm opens (from the feed) hit this; a cold URL
  // load finds no seed and shows the spinner until the fetch resolves.
  // A post with no feed seed may still have arrived before this page mounted:
  // the route's `beforeLoad` and the card's intent handlers start its fetches
  // (lib/feed/post-detail-prefetch). Settled ones render in the first commit.
  const [arrived] = useState(() => ({
    body: peekIntentFetch(postBodyUrl(postId)),
    comments: peekIntentFetch(postCommentsUrl(postId)),
  }));
  const [post, setPost] = useState<FeedItem | null>(
    () =>
      useFeedStore.getState().items.find((i) => i.id === postId) ??
      (arrived.body?.status === 200 ? (arrived.body.data as FeedItem) : null),
  );
  const [comments, setComments] = useState<Comment[]>(() =>
    Array.isArray(arrived.comments?.data) ? (arrived.comments.data as Comment[]) : [],
  );
  const [loading, setLoading] = useState(
    () => !useFeedStore.getState().items.some((i) => i.id === postId) && !arrived.body,
  );
  const [loadingComments, setLoadingComments] = useState(
    () => !Array.isArray(arrived.comments?.data),
  );
  const [notFound, setNotFound] = useState(() => arrived.body?.status === 404);

  // Fetch post
  useEffect(() => {
    // §17.2: keep the seeded hero on screen while the full record loads (only show
    // the spinner when there was no seed) so the morph never lands on a skeleton.
    const seed = useFeedStore.getState().items.find((i) => i.id === postId) ?? null;
    // A request already started for this open (the route's beforeLoad, the card's
    // intent) is taken once here instead of issuing a second one.
    const url = postBodyUrl(postId);
    if (seed) setPost(seed);
    setLoading(!seed && !peekIntentFetch(url));
    takeOrFetch(url)
      .then(({ status, data: body }) => {
        if (status === 404) {
          setNotFound(true);
          return;
        }
        const data = body as FeedItem;
        // Update user display cache
        const users = postBodyUsers(data);
        if (users.length > 0) useUserDisplayStore.getState().setUsers(users);
        setPost(data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [postId]);

  // Fetch comments
  useEffect(() => {
    const url = postCommentsUrl(postId);
    setLoadingComments(!Array.isArray(peekIntentFetch(url)?.data));
    takeOrFetch(url)
      .then(({ data }) => setComments(Array.isArray(data) ? (data as Comment[]) : []))
      .catch(console.error)
      .finally(() => setLoadingComments(false));
  }, [postId]);

  return { post, setPost, comments, setComments, loading, loadingComments, notFound };
}
