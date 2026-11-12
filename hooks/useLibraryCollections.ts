import { readJson, removeKey, writeJson } from '@/lib/core/persist';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from '@tanstack/react-router';
import { toast } from '@/lib/toast';
import type { Collection } from '@/lib/games/collections';
import { FAVORITES } from '@/lib/games/collections';

const LEGACY_KEY = 'rmh-library-favorites';

type Api = '/api/games/collections/item' | '/api/games/collections/delete' | '/api/games/collections/rename' | '/api/games/collections/import';

async function call(path: Api, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error };
  } catch {
    return { ok: false };
  }
}

function readLegacy(): string[] {
  return readJson<string[]>(LEGACY_KEY, [], {
    validate: (v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : undefined),
  });
}

/**
 * The library's collections. Signed in, they live on the account (the route loader
 * supplies them) and changes apply at once, then are confirmed by the server; a refusal
 * puts things back. Signed out, only Favorites exist and stay in this browser. The first
 * time a signed-in member opens the library, favorites that were only in this browser
 * move onto the account.
 */
export function useLibraryCollections(server: Collection[], signedIn: boolean) {
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>(server);
  const migrated = useRef(false);

  // The loader is the truth: whenever it changes, so do we.
  useEffect(() => setCollections(server), [server]);

  // Signed out: Favorites come from this browser.
  useEffect(() => {
    if (signedIn) return;
    const ids = readLegacy();
    setCollections(ids.length ? [{ name: FAVORITES, ids }] : []);
  }, [signedIn]);

  // Signed in: one-time move of browser-stored favorites.
  useEffect(() => {
    if (!signedIn || migrated.current) return;
    migrated.current = true;
    const ids = readLegacy();
    if (ids.length === 0) return;
    void call('/api/games/collections/import', { ids }).then(async (r) => {
      if (!r.ok) return;
      removeKey(LEGACY_KEY); // storage unavailable: the import is idempotent, so a repeat is harmless
      await router.invalidate();
    });
  }, [signedIn, router]);

  const has = useCallback(
    (collection: string, id: string) => collections.find((c) => c.name === collection)?.ids.includes(id) ?? false,
    [collections],
  );

  const toggle = useCallback(
    async (collection: string, id: string, onError?: (code?: string) => void) => {
      const on = !has(collection, id);
      const apply = (list: Collection[]): Collection[] => {
        const found = list.find((c) => c.name === collection);
        const next = found
          ? list.map((c) =>
              c.name === collection ? { ...c, ids: on ? [...new Set([...c.ids, id])] : c.ids.filter((x) => x !== id) } : c,
            )
          : on
            ? [...list, { name: collection, ids: [id] }]
            : list;
        return next.filter((c) => c.ids.length > 0);
      };
      const before = collections;
      setCollections(apply(before));

      if (!signedIn) {
        const ids = apply(before).find((c) => c.name === FAVORITES)?.ids ?? [];
        writeJson(LEGACY_KEY, ids); // storage unavailable: favourites last for this visit only
        return;
      }
      const r = await call('/api/games/collections/item', { collection, gameId: id, on });
      if (!r.ok) {
        setCollections(before);
        if (onError) onError(r.error);
        else toast.error('Could not update your collections.');
        return;
      }
      await router.invalidate();
    },
    [collections, has, router, signedIn],
  );

  const remove = useCallback(
    async (collection: string) => {
      setCollections((c) => c.filter((x) => x.name !== collection));
      if (signedIn) {
        await call('/api/games/collections/delete', { collection });
        await router.invalidate();
      }
    },
    [router, signedIn],
  );

  const rename = useCallback(
    async (from: string, to: string): Promise<{ ok: boolean; error?: string }> => {
      const r = await call('/api/games/collections/rename', { from, to });
      if (r.ok) await router.invalidate();
      return r;
    },
    [router],
  );

  return { collections, has, toggle, remove, rename, signedIn };
}
