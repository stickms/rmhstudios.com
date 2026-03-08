import { create } from "zustand";
import type { FeedItemUser } from "@/lib/feed-types";

interface UserDisplayState {
  /** userId -> latest known display data */
  cache: Record<string, FeedItemUser>;
  /** Update cache with one or more users. Prefers non-null image/name to avoid clobbering valid data. */
  setUsers: (users: FeedItemUser[]) => void;
  /** Force-set a user in the cache (used after profile edits where null values are intentional) */
  forceSetUser: (user: FeedItemUser) => void;
  /** Get the freshest version of a user, falling back to the provided data */
  freshUser: (user: FeedItemUser) => FeedItemUser;
}

export const useUserDisplayStore = create<UserDisplayState>((set, get) => ({
  cache: {},

  setUsers: (users) => {
    set((state) => {
      const next = { ...state.cache };
      for (const u of users) {
        if (!u.id) continue;
        const existing = next[u.id];
        if (!existing) {
          next[u.id] = u;
        } else {
          // Merge: prefer non-null values so a stale null doesn't clobber a valid image/name
          next[u.id] = {
            ...existing,
            ...u,
            image: u.image ?? existing.image,
            name: u.name ?? existing.name,
          };
        }
      }
      return { cache: next };
    });
  },

  forceSetUser: (user) => {
    set((state) => ({
      cache: { ...state.cache, [user.id]: user },
    }));
  },

  freshUser: (user) => {
    const cached = get().cache[user.id];
    return cached ?? user;
  },
}));

/**
 * React hook: returns the freshest display data for a user.
 * Subscribes to cache changes so the component re-renders when the
 * user's data is updated by a newer API response.
 */
export function useFreshUser(user: FeedItemUser | undefined | null): FeedItemUser | undefined {
  return useUserDisplayStore((state) => {
    if (!user) return undefined;
    return state.cache[user.id] ?? user;
  });
}
