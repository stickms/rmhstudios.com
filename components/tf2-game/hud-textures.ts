/**
 * The TF2 HUD's own textures — class portraits, the class menu's cards,
 * scoreboard class icons, building status art — read from the default HUD the
 * TF2 Hub already ships (`public/tf2-hud/base`, the same files the HUD editor
 * paints from). Each is resolved through its material like the game does
 * (`ImageStore`: .vmt → $basetexture → .vtf, decoded once) and handed to the
 * DOM as an object URL.
 *
 * `useHudTexture(path)` returns the URL, or null while it loads or when the
 * file is missing; components draw a plain fallback in that case, so a HUD
 * without network access still reads.
 */
'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { ImageStore } from '@/lib/tf2-hud/assets/images';

const BASE_URL = '/tf2-hud/base/';

const bytes = new Map<string, Uint8Array>();
const missing = new Set<string>();
const urls = new Map<string, string | null>();
/** Paths being loaded. */
const waiters = new Set<string>();

async function ensure(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async (p) => {
      if (bytes.has(p) || missing.has(p)) return;
      try {
        const res = await fetch(BASE_URL + p);
        if (!res.ok) throw new Error(String(res.status));
        bytes.set(p, new Uint8Array(await res.arrayBuffer()));
      } catch {
        missing.add(p);
      }
    }),
  );
}

let store: ImageStore | null = null;
function imageStore(): ImageStore {
  if (!store) {
    store = new ImageStore(
      (p) => bytes.get(p),
      () => {
        // Each resolved texture re-checks the waiters (the store calls this after caching one).
        for (const path of [...waiters]) resolveWaiters(path);
      },
      ensure,
    );
    store.setLookup((p) => bytes.get(p));
  }
  return store;
}

function bitmapToUrl(bitmap: ImageBitmap): Promise<string | null> {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(bitmap, 0, 0);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b ? URL.createObjectURL(b) : null), 'image/png'));
  } catch {
    return Promise.resolve(null);
  }
}

const converting = new Set<string>();

function resolveWaiters(path: string): void {
  const tex = imageStore().get(path);
  if (tex === undefined || converting.has(path)) return;
  if (tex === null) {
    finish(path, null);
    return;
  }
  converting.add(path);
  void bitmapToUrl(tex.bitmap).then((url) => {
    converting.delete(path);
    finish(path, url);
  });
}

const listeners = new Set<() => void>();

function finish(path: string, url: string | null): void {
  urls.set(path, url);
  waiters.delete(path);
  for (const l of listeners) l();
}

/** Starts loading a material path (`materials/hud/class_scoutred`) if it is not loaded or loading. */
export function requestHudTexture(path: string): void {
  if (urls.has(path) || waiters.has(path) || typeof window === 'undefined') return;
  waiters.add(path);
  resolveWaiters(path);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The object URL of a HUD texture, or null while loading / when missing. */
export function useHudTexture(path: string | null): string | null {
  const url = useSyncExternalStore(
    subscribe,
    () => (path ? (urls.get(path) ?? null) : null),
    () => null,
  );
  useEffect(() => {
    if (path) requestHudTexture(path);
  }, [path]);
  return url;
}

const CLASS_TEXTURE_NAMES = ['', 'scout', 'sniper', 'soldier', 'demo', 'medic', 'heavy', 'pyro', 'spy', 'engi'];
const LEADERBOARD_NAMES = ['', 'scout', 'sniper', 'soldier', 'demo', 'medic', 'heavy', 'pyro', 'spy', 'engineer'];

/** The HUD's class portrait (hudplayerclass.res `../hud/class_<name><team>`). */
export const classPortraitPath = (cls: number, team: number): string | null =>
  CLASS_TEXTURE_NAMES[cls] ? `materials/hud/class_${CLASS_TEXTURE_NAMES[cls]}${team === 3 ? 'blue' : 'red'}` : null;

/**
 * The class menu's card art. The menu's own `vgui/class_sel_sm_*` textures are not in the shipped
 * default HUD (only their materials), so the cards use the HUD portraits; random has none.
 */
export const classMenuPath = (cls: number, team: number): string | null => classPortraitPath(cls, team);

/** The scoreboard's class icon (`hud/leaderboard_class_<name>`). */
export const leaderboardClassPath = (cls: number): string | null =>
  LEADERBOARD_NAMES[cls] ? `materials/hud/leaderboard_class_${LEADERBOARD_NAMES[cls]}` : null;
