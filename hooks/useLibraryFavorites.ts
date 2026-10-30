'use client';

import { useCallback, useEffect, useState } from 'react';

const KEY = 'rmh-library-favorites';

/**
 * The library's Favorites collection — catalog ids, kept in this browser. Server
 * persistence is a later change; until then it is a per-viewer convenience, so
 * every storage access is wrapped (private windows and blocked storage throw).
 */
export function useLibraryFavorites(): { ids: string[]; toggle: (id: string) => void } {
  const [ids, setIds] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setIds(parsed.filter((x): x is string => typeof x === 'string'));
    } catch {
      /* storage unavailable: start empty */
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(ids));
    } catch {
      /* storage unavailable: favourites last for this visit only */
    }
  }, [ids, loaded]);

  const toggle = useCallback(
    (id: string) =>
      setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])),
    [],
  );
  return { ids, toggle };
}
