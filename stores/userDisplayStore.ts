import { create } from 'zustand';
import type { FeedItemUser } from '@/lib/feed-types';

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
      let changed = false;
      const next = { ...state.cache };
      for (const u of users) {
        if (!u.id) continue;
        const existing = next[u.id];
        if (!existing) {
          next[u.id] = u;
          changed = true;
          continue;
        }
        // Merge: prefer non-null values so a stale null doesn't clobber a valid image/name
        const merged = {
          ...existing,
          ...u,
          image: u.image ?? existing.image,
          name: u.name ?? existing.name,
        };
        // `cosmetics` (and its nested nameColor/badge/avatarFrame) is a FRESH
        // object on every API response, so the reference compare in the dirty
        // loop below always differs even when the contents are identical — which
        // would mark every author-with-cosmetics dirty and re-render all their
        // cards on each fetch. Reuse the existing reference when the cosmetics are
        // structurally unchanged so the stable-reference short-circuit holds.
        const mergedCosmetics = (merged as { cosmetics?: unknown }).cosmetics;
        if (
          mergedCosmetics !== existing.cosmetics &&
          JSON.stringify(mergedCosmetics) === JSON.stringify(existing.cosmetics)
        ) {
          (merged as { cosmetics?: unknown }).cosmetics = existing.cosmetics;
        }
        // Only replace the entry when a field actually changed. `setUsers` runs
        // on every page append / SSE event with the same authors — keeping the
        // reference stable stops useFreshUser subscribers (3 per visible card)
        // from re-rendering the whole timeline each time.
        const a = merged as unknown as Record<string, unknown>;
        const b = existing as unknown as Record<string, unknown>;
        let dirty = false;
        for (const k in a) {
          if (a[k] !== b[k]) {
            dirty = true;
            break;
          }
        }
        // Catch keys present on `existing` but dropped from `merged` (rare).
        if (!dirty) {
          for (const k in b) {
            if (!(k in a)) {
              dirty = true;
              break;
            }
          }
        }
        if (dirty) {
          next[u.id] = merged;
          changed = true;
        }
      }
      return changed ? { cache: next } : state;
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
