import { create } from 'zustand';
import type { FeedItem, FeedFilter, FeedItemUser } from '@/lib/feed-types';
import { useUserDisplayStore } from './userDisplayStore';

/** Per-viewer delivery metadata attached by the SSE stream to created events. */
export interface CreatedDelivery {
  followed: boolean;
  own: boolean;
}

interface FeedState {
  items: FeedItem[];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  /** True once the first page fetch has completed — gates the empty state so
   *  "Nothing here yet" never flashes before the initial load resolves. */
  initialized: boolean;
  /** Set when the most recent fetch failed (network drop, timeout, HTTP error)
   *  with nothing to show. Drives a "tap to retry" affordance so a transient
   *  failure never leaves the feed stuck on skeletons. */
  error: boolean;
  filter: FeedFilter;
  search: string | null;
  /** Buffered new posts for the "For You" surface — surfaced as an "N new" pill. */
  pendingItems: FeedItem[];
  /** The viewer's muted words (lowercased). Live SSE posts matching them are
   *  dropped so the mute is honored in real time, not just on the next read. */
  mutedWords: string[];

  setFilter: (filter: FeedFilter) => void;
  setSearch: (query: string | null) => void;
  /** Set the viewer's muted words (fetched once on feed mount). */
  setMutedWords: (words: string[]) => void;
  fetchNextPage: () => Promise<void>;
  /** Reload the first page of the current surface fresh (pull-to-refresh).
   *  Keeps the existing timeline on screen until the new page arrives, then
   *  replaces it and clears the "N new" buffer. Resolves when the fetch settles
   *  so the caller can time its spinner. */
  refresh: () => Promise<void>;
  /** Re-attempt the current surface after an error (clears the error flag). */
  retry: () => void;
  /** Seed the first page from the server (streamed SSR prefetch) — no-ops unless
   *  the store is still pristine, so it never clobbers a live or navigated-back
   *  timeline. `mutedWords` (when provided) primes the live-SSE filter so the
   *  client needs no separate muted-words request. */
  hydrate: (
    items: FeedItem[],
    cursor: string | null,
    hasMore: boolean,
    mutedWords?: string[],
  ) => void;
  prependItem: (item: FeedItem) => void;
  updateItem: (id: string, updates: Partial<FeedItem>) => void;
  removeItem: (id: string) => void;
  /** Replace an optimistic (temp-id) post with the authoritative server record. */
  reconcileItem: (tempId: string, real: FeedItem) => void;
  /** Route a streamed `rmhark.created` event into the feed or the pending pill. */
  receiveCreated: (item: FeedItem, delivery: CreatedDelivery) => void;
  /** Flush buffered pending posts to the top of the feed (pill click). */
  flushPending: () => void;
  reset: () => void;
}

/** True when the item's text (or its quoted original) contains a muted word. */
function isMutedItem(item: FeedItem, muted: string[]): boolean {
  if (muted.length === 0) return false;
  const check = (text: string | undefined) => {
    if (!text) return false;
    const lower = text.toLowerCase();
    return muted.some((w) => w && lower.includes(w));
  };
  return check(item.content) || check(item.original?.content);
}

/** Cache display data for every user referenced by a feed item. */
function cacheItemUsers(items: FeedItem[]) {
  const users: FeedItemUser[] = [];
  for (const item of items) {
    if (item.user) users.push(item.user);
    if (item.repostedBy) users.push(item.repostedBy);
    if (item.original?.user) users.push(item.original.user);
  }
  if (users.length > 0) useUserDisplayStore.getState().setUsers(users);
}

/** Abort a fetch that hangs this long so `loading` can never be pinned forever
 *  (suspended mobile tab, dropped socket, proxy/CDN black hole). */
const FEED_FETCH_TIMEOUT_MS = 20_000;

// Request coordination lives outside the store — it drives no UI, only guards
// against stale/hung requests. `requestGeneration` is bumped whenever a fetch
// starts or the surface changes; a response whose generation is no longer
// current is discarded so a late resolver can neither pin `loading` nor clobber
// a newer surface. `activeController` lets a surface switch cancel the in-flight
// request outright.
let requestGeneration = 0;
let activeController: AbortController | null = null;

/** Invalidate any in-flight fetch and abort it (used on surface changes/reset). */
function cancelActiveFetch() {
  requestGeneration += 1;
  activeController?.abort();
  activeController = null;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  items: [],
  cursor: null,
  hasMore: true,
  loading: false,
  initialized: false,
  error: false,
  filter: 'all',
  search: null,
  pendingItems: [],
  mutedWords: [],

  setMutedWords: (words) => set({ mutedWords: words }),

  setFilter: (filter) => {
    // Abandon any in-flight request for the old surface so its late resolver
    // can't repopulate the new one — and, critically, reset `loading` so the
    // fetch below is never swallowed by a stuck lock from the previous surface.
    cancelActiveFetch();
    set({
      filter,
      search: null,
      items: [],
      cursor: null,
      hasMore: true,
      pendingItems: [],
      loading: false,
      initialized: false,
      error: false,
    });
    // Fetch first page with new filter
    get().fetchNextPage();
  },

  setSearch: (query) => {
    cancelActiveFetch();
    set({
      search: query,
      items: [],
      cursor: null,
      hasMore: true,
      pendingItems: [],
      loading: false,
      initialized: false,
      error: false,
    });
    get().fetchNextPage();
  },

  refresh: async () => {
    // Pull-to-refresh: fetch page 1 of the current surface fresh and replace the
    // timeline. Unlike setFilter/setSearch we DON'T clear items up front — the
    // old posts stay visible under the pull spinner until the new page lands, so
    // there's no skeleton flash. A fresh generation + controller supersedes any
    // in-flight page load and can't be clobbered by its late resolver.
    requestGeneration += 1;
    const generation = requestGeneration;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

    const { filter, search } = get();
    set({ loading: true, error: false });
    try {
      const params = new URLSearchParams({ limit: '20', filter });
      if (filter === 'friends') params.set('feed', 'following');
      if (search) params.set('search', search);

      const res = await fetch(`/api/rmharks?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Failed to refresh feed');

      const data = await res.json();
      if (generation !== requestGeneration) return;

      cacheItemUsers(data.items as FeedItem[]);
      set((state) => ({
        items: data.items as FeedItem[],
        cursor: data.nextCursor,
        hasMore: data.hasMore,
        loading: false,
        initialized: true,
        error: false,
        // The fresh page already includes anything that was buffered.
        pendingItems: [],
        // Keep the live-SSE muted-words filter in sync with the server.
        mutedWords: (data.mutedWords as string[] | undefined) ?? state.mutedWords,
      }));
    } catch (error) {
      if (generation !== requestGeneration) return;
      // Keep the existing timeline on a failed refresh — only surface the error.
      if (!controller.signal.aborted) console.error('Feed refresh error:', error);
      set({ loading: false, error: true });
    } finally {
      clearTimeout(timeout);
      if (activeController === controller) activeController = null;
    }
  },

  retry: () => {
    // Clear the error and re-drive the current surface. `loading` is already
    // false after any failure, so the guard in fetchNextPage lets this through.
    set({ error: false });
    get().fetchNextPage();
  },

  hydrate: (items, cursor, hasMore, mutedWords) => {
    const s = get();
    // Only seed a pristine store — never overwrite an in-flight load or a
    // timeline the reader already scrolled/navigated back to.
    if (s.initialized || s.loading || s.items.length > 0) return;
    cacheItemUsers(items);
    set({
      items,
      cursor,
      hasMore,
      initialized: true,
      error: false,
      ...(mutedWords ? { mutedWords } : {}),
    });
  },

  fetchNextPage: async () => {
    const { loading, hasMore, cursor, filter, search } = get();
    if (loading || !hasMore) return;

    // Claim a fresh generation and its own AbortController so this request can
    // be superseded (surface switch) or timed out without ever pinning the
    // shared `loading` flag.
    requestGeneration += 1;
    const generation = requestGeneration;
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

    set({ loading: true, error: false });
    try {
      const params = new URLSearchParams({ limit: '20', filter });
      // Twitter-shaped surface naming: the "friends" tab is the Following feed.
      if (filter === 'friends') params.set('feed', 'following');
      if (cursor) params.set('cursor', cursor);
      if (search) params.set('search', search);

      const res = await fetch(`/api/rmharks?${params}`, { signal: controller.signal });
      if (!res.ok) throw new Error('Failed to fetch feed');

      const data = await res.json();

      // A newer fetch (or a surface switch) superseded this one — drop the
      // result so it can't clobber the current surface.
      if (generation !== requestGeneration) return;

      cacheItemUsers(data.items as FeedItem[]);

      set((state) => {
        const existingIds = new Set(state.items.map((i) => i.id));
        const newItems = (data.items as FeedItem[]).filter((i) => !existingIds.has(i.id));
        return {
          items: [...state.items, ...newItems],
          cursor: data.nextCursor,
          hasMore: data.hasMore,
          loading: false,
          initialized: true,
          error: false,
          // Keep the live-SSE muted-words filter in sync with the server.
          mutedWords: (data.mutedWords as string[] | undefined) ?? state.mutedWords,
        };
      });
    } catch (error) {
      // Superseded/cancelled by a newer request — that request now owns the
      // shared state, so this one must touch nothing.
      if (generation !== requestGeneration) return;

      // Timeout or genuine network/HTTP error. Clear the lock and mark the feed
      // initialized so the UI shows a retry affordance instead of skeletons
      // forever, and preserve `hasMore` so one transient drop never permanently
      // kills pagination.
      if (!controller.signal.aborted) console.error('Feed fetch error:', error);
      set({ loading: false, initialized: true, error: true });
    } finally {
      clearTimeout(timeout);
      if (activeController === controller) activeController = null;
    }
  },

  prependItem: (item) => {
    set((state) => {
      // Skip if item already exists (prevents SSE + local double-add)
      if (state.items.some((i) => i.id === item.id)) return state;
      return { items: [item, ...state.items] };
    });
  },

  updateItem: (id, updates) => {
    set((state) => {
      // `items.map` allocates a NEW array even when nothing matched, which
      // re-renders FeedList on every SSE like/comment/repost tick for a post
      // that isn't on this surface. Bail out with the unchanged state so those
      // offscreen events cost nothing.
      if (!state.items.some((item) => item.id === id)) return state;
      return {
        items: state.items.map((item) => (item.id === id ? { ...item, ...updates } : item)),
      };
    });
  },

  removeItem: (id) => {
    set((state) => {
      if (!state.items.some((item) => item.id === id)) return state;
      return { items: state.items.filter((item) => item.id !== id) };
    });
  },

  reconcileItem: (tempId, real) => {
    cacheItemUsers([real]);
    set((state) => {
      // The authoritative post may already be on screen if its SSE
      // `rmhark.created` event beat this response — in that case just drop the
      // optimistic copy instead of creating a duplicate.
      const realAlreadyPresent = state.items.some((i) => i.id === real.id && i.id !== tempId);
      if (realAlreadyPresent) {
        return { items: state.items.filter((i) => i.id !== tempId) };
      }
      return {
        items: state.items.map((i) => (i.id === tempId ? real : i)),
      };
    });
  },

  receiveCreated: (item, delivery) => {
    const { filter, items, pendingItems, mutedWords } = get();

    // Created events are always RMHarks — ignore them on content-type tabs
    // that don't show RMHarks (Games/Apps/Blog).
    const contentShowsRmharks = filter === 'all' || filter === 'rmhark' || filter === 'friends';
    if (!contentShowsRmharks) return;

    // Honor the viewer's muted words in real time (the timeline read already
    // filters these; without this a muted live post shows until refresh). Never
    // suppress the viewer's own post.
    if (!delivery.own && isMutedItem(item, mutedWords)) return;

    // De-dupe against what's already on screen or buffered.
    if (items.some((i) => i.id === item.id) || pendingItems.some((i) => i.id === item.id)) {
      return;
    }

    cacheItemUsers([item]);

    if (filter === 'friends') {
      // Following surface: only stream in posts from people you follow (or
      // your own). Strangers' posts never belong here.
      if (delivery.followed || delivery.own) {
        get().prependItem(item);
      }
      return;
    }

    // For You surface: your own post appears immediately (self-action
    // consistency); everyone else's is buffered behind an "N new posts" pill
    // so the scroll position is never yanked.
    if (delivery.own) {
      get().prependItem(item);
    } else {
      set((state) => ({ pendingItems: [item, ...state.pendingItems] }));
    }
  },

  flushPending: () => {
    set((state) => {
      if (state.pendingItems.length === 0) return state;
      const existingIds = new Set(state.items.map((i) => i.id));
      const fresh = state.pendingItems.filter((i) => !existingIds.has(i.id));
      return { items: [...fresh, ...state.items], pendingItems: [] };
    });
  },

  reset: () => {
    cancelActiveFetch();
    set({
      items: [],
      cursor: null,
      hasMore: true,
      loading: false,
      initialized: false,
      error: false,
      pendingItems: [],
    });
  },
}));
