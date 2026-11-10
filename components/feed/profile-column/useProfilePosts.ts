import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { FeedItem } from '@/lib/feed-types';
import type { ProfileData } from '@/components/profile/profile-types';
import { useUserDisplayStore } from '@/stores/userDisplayStore';
import { profilePostsFirstPageUrl } from '@/lib/feed/profile-prefetch';
import { takeOrFetch } from '@/lib/route/intent-fetch';
import { collectFeedUsers } from './profile-column-state';
import type { ProfilePostsPage, ProfileTab } from './profile-column-state';

import { api } from '@/lib/contract/client';
import { profileLikesApi, profilePostsApi } from '@/lib/feed/feed-reads.contract';
export interface PostList {
  items: FeedItem[];
  loadingItems: boolean;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
}

export interface ProfilePosts {
  rmharks: PostList;
  likes: PostList;
  /** First open of the Likes tab loads its first page; later opens do not refetch. */
  ensureLikesLoaded: () => void;
}

/**
 * The profile's RMHark and liked-post lists: paged fetches, the first-page load
 * once the profile is ready, and an IntersectionObserver per list that pages
 * while its tab is showing. State resets when `userId` changes, because the
 * column instance is reused across /u/$userid routes and would otherwise show
 * the previous user's posts until a full refresh.
 */
export function useProfilePosts(
  userId: string,
  profile: ProfileData | null,
  loading: boolean,
  tab: ProfileTab,
): ProfilePosts {
  // RMHark list state
  const [items, setItems] = useState<FeedItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const initialFetched = useRef(false);

  // Liked items state
  const [likedItems, setLikedItems] = useState<FeedItem[]>([]);
  const [likedCursor, setLikedCursor] = useState<string | null>(null);
  const [likedHasMore, setLikedHasMore] = useState(true);
  const [loadingLiked, setLoadingLiked] = useState(false);
  const likedSentinelRef = useRef<HTMLDivElement>(null);
  const likedInitialFetched = useRef(false);

  // Reset per-profile post state when navigating to a different profile (and the
  // "already fetched" refs with it).
  useEffect(() => {
    setItems([]);
    setCursor(null);
    setHasMore(true);
    setLoadingItems(false);
    initialFetched.current = false;
    setLikedItems([]);
    setLikedCursor(null);
    setLikedHasMore(true);
    setLoadingLiked(false);
    likedInitialFetched.current = false;
  }, [userId]);

  // Fetch RMHarks
  const fetchRMHarks = useCallback(async () => {
    if (loadingItems) return;
    setLoadingItems(true);
    try {
      let data: ProfilePostsPage;
      if (cursor) {
        data = await api(profilePostsApi, { params: { id: userId }, query: { limit: 20, cursor } });
      } else {
        // The first page may already be in flight from the route's beforeLoad
        // (lib/feed/profile-prefetch); take it rather than asking twice.
        const first = await takeOrFetch(profilePostsFirstPageUrl(userId));
        if (first.status < 200 || first.status >= 300) return;
        data = first.data as ProfilePostsPage;
      }
      // Update user display cache
      const users = collectFeedUsers(data.items);
      if (users.length > 0) useUserDisplayStore.getState().setUsers(users);
      setItems((prev) => [...prev, ...data.items]);
      setCursor(data.nextCursor);
      setHasMore(data.hasMore);
    } catch (error) {
      console.error('Fetch rmharks error:', error);
    } finally {
      setLoadingItems(false);
    }
  }, [userId, cursor, loadingItems]);

  // Fetch Liked posts
  const fetchLikedPosts = useCallback(async () => {
    if (loadingLiked) return;
    setLoadingLiked(true);
    try {
      const data = await api(profileLikesApi, {
        params: { id: userId },
        query: { limit: 20, ...(likedCursor ? { cursor: likedCursor } : {}) },
      });
      // Update user display cache
      const likeUsers = collectFeedUsers(data.items);
      if (likeUsers.length > 0) useUserDisplayStore.getState().setUsers(likeUsers);
      setLikedItems((prev) => [...prev, ...data.items]);
      setLikedCursor(data.nextCursor);
      setLikedHasMore(data.hasMore);
    } catch (error) {
      console.error('Fetch liked posts error:', error);
    } finally {
      setLoadingLiked(false);
    }
  }, [userId, likedCursor, loadingLiked]);

  // Initial fetch for RMHarks
  useEffect(() => {
    if (!initialFetched.current && !loading && profile) {
      initialFetched.current = true;
      fetchRMHarks();
    }
  }, [loading, profile, fetchRMHarks]);

  // Infinite scroll for RMHarks
  const observerCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && hasMore && !loadingItems) {
        fetchRMHarks();
      }
    },
    [hasMore, loadingItems, fetchRMHarks],
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || tab !== 'rmharks') return;
    const observer = new IntersectionObserver(observerCallback, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [observerCallback, tab]);

  // Infinite scroll for Liked posts
  const likedObserverCallback = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0].isIntersecting && likedHasMore && !loadingLiked) {
        fetchLikedPosts();
      }
    },
    [likedHasMore, loadingLiked, fetchLikedPosts],
  );

  useEffect(() => {
    const sentinel = likedSentinelRef.current;
    if (!sentinel || tab !== 'likes') return;
    const observer = new IntersectionObserver(likedObserverCallback, { rootMargin: '200px' });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [likedObserverCallback, tab]);

  const ensureLikesLoaded = () => {
    if (!likedInitialFetched.current) {
      likedInitialFetched.current = true;
      fetchLikedPosts();
    }
  };

  return {
    rmharks: { items, loadingItems, hasMore, sentinelRef },
    likes: {
      items: likedItems,
      loadingItems: loadingLiked,
      hasMore: likedHasMore,
      sentinelRef: likedSentinelRef,
    },
    ensureLikesLoaded,
  };
}
