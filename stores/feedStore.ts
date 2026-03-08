import { create } from "zustand";
import type { FeedItem, FeedFilter, FeedItemUser } from "@/lib/feed-types";
import { useUserDisplayStore } from "./userDisplayStore";

interface FeedState {
  items: FeedItem[];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  filter: FeedFilter;
  search: string | null;

  setFilter: (filter: FeedFilter) => void;
  setSearch: (query: string | null) => void;
  fetchNextPage: () => Promise<void>;
  prependItem: (item: FeedItem) => void;
  updateItem: (id: string, updates: Partial<FeedItem>) => void;
  removeItem: (id: string) => void;
  reset: () => void;
}

export const useFeedStore = create<FeedState>((set, get) => ({
  items: [],
  cursor: null,
  hasMore: true,
  loading: false,
  filter: "all",
  search: null,

  setFilter: (filter) => {
    set({ filter, search: null, items: [], cursor: null, hasMore: true });
    // Fetch first page with new filter
    get().fetchNextPage();
  },

  setSearch: (query) => {
    set({ search: query, items: [], cursor: null, hasMore: true });
    get().fetchNextPage();
  },

  fetchNextPage: async () => {
    const { loading, hasMore, cursor, filter, search } = get();
    if (loading || !hasMore) return;

    set({ loading: true });
    try {
      const params = new URLSearchParams({ limit: "20", filter });
      if (cursor) params.set("cursor", cursor);
      if (search) params.set("search", search);

      const res = await fetch(`/api/rmharks?${params}`);
      if (!res.ok) throw new Error("Failed to fetch feed");

      const data = await res.json();
      // Update user display cache with all users from this response
      const users: FeedItemUser[] = [];
      for (const item of data.items as FeedItem[]) {
        if (item.user) users.push(item.user);
        if (item.repostedBy) users.push(item.repostedBy);
        if (item.original?.user) users.push(item.original.user);
      }
      if (users.length > 0) useUserDisplayStore.getState().setUsers(users);

      set((state) => {
        const existingIds = new Set(state.items.map((i) => i.id));
        const newItems = (data.items as FeedItem[]).filter((i) => !existingIds.has(i.id));
        return {
          items: [...state.items, ...newItems],
          cursor: data.nextCursor,
          hasMore: data.hasMore,
          loading: false,
        };
      });
    } catch (error) {
      console.error("Feed fetch error:", error);
      set({ loading: false, hasMore: false });
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
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    }));
  },

  removeItem: (id) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    }));
  },

  reset: () => {
    set({ items: [], cursor: null, hasMore: true, loading: false });
  },
}));
