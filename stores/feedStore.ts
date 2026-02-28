import { create } from "zustand";
import type { FeedItem, FeedFilter } from "@/lib/feed-types";

interface FeedState {
  items: FeedItem[];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  filter: FeedFilter;

  setFilter: (filter: FeedFilter) => void;
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

  setFilter: (filter) => {
    set({ filter, items: [], cursor: null, hasMore: true });
    // Fetch first page with new filter
    get().fetchNextPage();
  },

  fetchNextPage: async () => {
    const { loading, hasMore, cursor, filter } = get();
    if (loading || !hasMore) return;

    set({ loading: true });
    try {
      const params = new URLSearchParams({ limit: "20", filter });
      if (cursor) params.set("cursor", cursor);

      const res = await fetch(`/api/rmheets?${params}`);
      if (!res.ok) throw new Error("Failed to fetch feed");

      const data = await res.json();
      set((state) => ({
        items: [...state.items, ...data.items],
        cursor: data.nextCursor,
        hasMore: data.hasMore,
        loading: false,
      }));
    } catch (error) {
      console.error("Feed fetch error:", error);
      set({ loading: false });
    }
  },

  prependItem: (item) => {
    set((state) => ({ items: [item, ...state.items] }));
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
