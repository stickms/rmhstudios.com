/**
 * Data-saver mode (plan B20).
 *
 * One boolean the whole site can branch on to stop spending someone else's
 * megabytes: skip autoplaying video, hold back the high-DPR image variant,
 * don't prefetch the next page, don't warm a socket.
 *
 * Three settings, and `auto` is the interesting one. Browsers already know the
 * answer — Chrome's "Lite mode" sets `navigator.connection.saveData`, and
 * `effectiveType` reports the measured round-trip class regardless of the radio
 * technology, so a nominally-4G connection in a basement reads as `2g`. `auto`
 * defers to those; `on`/`off` are the explicit override for people whose
 * browser reports neither (Safari and Firefox ship no Network Information API)
 * or who are on a metered tether that looks fast.
 *
 * SSR contract: `useDataSaver()` is `false` on the server and on the first client
 * render, always. The preference lives in localStorage and the connection class
 * in a browser API, so a server render can only guess — and a guess that omits an
 * image on the server and includes it on the client is a hydration mismatch.
 * Callers that reserve layout space must reserve it unconditionally.
 *
 * `useDataSaverAtMount()` (the image components) is the exception, because its
 * server answer is not a guess: the setting is mirrored into a cookie, the browser
 * sends `Save-Data`, and the root loader carries the server's decision to the
 * client (`DataSaverRequestContext`, lib/data-saver-request.ts), so the hydrating
 * render reads exactly what the server rendered.
 */

import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { DATA_SAVER_COOKIE } from '@/lib/data-saver-request';
import { DATA_SAVER_EVENT, DATA_SAVER_KEY, connectionClass, readConnection } from '@/lib/network-quality';

// The key and event are owned by lib/network-quality, which the speculative
// prefetchers read too — so this setting reaches them.
export { DATA_SAVER_EVENT, DATA_SAVER_KEY };

export const DATA_SAVER_PREFERENCES = ['auto', 'on', 'off'] as const;
export type DataSaverPreference = (typeof DATA_SAVER_PREFERENCES)[number];
export const DEFAULT_DATA_SAVER_PREFERENCE: DataSaverPreference = 'auto';

function isPreference(value: unknown): value is DataSaverPreference {
  return typeof value === 'string' && (DATA_SAVER_PREFERENCES as readonly string[]).includes(value);
}

/** Read the stored preference. Client-only; defaults to `auto`. */
export function readDataSaverPreference(): DataSaverPreference {
  try {
    const raw = localStorage.getItem(DATA_SAVER_KEY);
    return isPreference(raw) ? raw : DEFAULT_DATA_SAVER_PREFERENCE;
  } catch {
    return DEFAULT_DATA_SAVER_PREFERENCE;
  }
}

/** Store the preference and tell every listener in this tab about it. */
export function setDataSaverPreference(preference: DataSaverPreference): void {
  try {
    localStorage.setItem(DATA_SAVER_KEY, preference);
  } catch {
    // ignore (private mode / storage disabled) — the event still fires, so the
    // choice applies for this session even when it cannot be remembered.
  }
  // Mirrored into a cookie so the server can render the first page for it
  // (lib/data-saver-request.ts). `auto` is the absence of a choice: no cookie.
  if (typeof document !== 'undefined') {
    document.cookie =
      preference === 'auto'
        ? `${DATA_SAVER_COOKIE}=; path=/; max-age=0; samesite=lax`
        : `${DATA_SAVER_COOKIE}=${preference}; path=/; max-age=31536000; samesite=lax`;
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_SAVER_EVENT));
}

/**
 * Resolve a preference against the live connection. Exported for imperative
 * call sites (a loader deciding whether to request a poster frame) that cannot
 * use the hook.
 */
export function resolveDataSaver(preference: DataSaverPreference): boolean {
  if (preference === 'on') return true;
  if (preference === 'off') return false;
  return readConnection()?.saveData === true || connectionClass() === 'slow';
}

export function useDataSaver(): boolean {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sync = () => setSaving(resolveDataSaver(readDataSaverPreference()));
    sync();

    const conn = readConnection();
    conn?.addEventListener?.('change', sync);
    window.addEventListener(DATA_SAVER_EVENT, sync);
    // Cross-tab: changing the setting in one tab should quiet the others too.
    window.addEventListener('storage', sync);
    return () => {
      conn?.removeEventListener?.('change', sync);
      window.removeEventListener(DATA_SAVER_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return saving;
}

/*
 * Data saver as a media component reads it: decided ONCE, when the element first
 * renders, and never changed after.
 *
 * An image that arrived in the server HTML has been downloading since the parser
 * reached it. Re-rendering it with fewer srcset candidates after hydration would
 * make the browser fetch a SECOND, smaller file on top of the one it already has,
 * the opposite of saving data. An image that mounts on the client (the next page
 * of a feed, a client navigation) has fetched nothing yet, so it can take the real
 * answer from its very first render.
 *
 * `useSyncExternalStore` is what tells those two apart without guessing: while
 * hydrating, React renders with `getServerSnapshot` (the server's own decision,
 * `DataSaverRequestContext`, so it matches the server HTML); on a client mount it
 * renders with `getSnapshot` (the live answer). `useState` then latches whatever
 * that first render saw.
 */
let snapshot: boolean | null = null;
let listening = false;

function readSnapshot(): boolean {
  if (snapshot === null) {
    snapshot = resolveDataSaver(readDataSaverPreference());
    if (!listening && typeof window !== 'undefined') {
      listening = true;
      const reset = () => {
        snapshot = null;
      };
      window.addEventListener(DATA_SAVER_EVENT, reset);
      window.addEventListener('storage', reset);
      readConnection()?.addEventListener?.('change', reset);
    }
  }
  return snapshot;
}

const noSubscribe = () => () => {};
/**
 * The server's decision for this document (lib/data-saver-request.ts), provided by
 * components/Providers from the root loader data. It is the server snapshot below:
 * what the server rendered with, and so what a hydrating render must read.
 */
export const DataSaverRequestContext = createContext(false);

export function useDataSaverAtMount(): boolean {
  const requested = useContext(DataSaverRequestContext);
  const live = useSyncExternalStore(noSubscribe, readSnapshot, () => requested);
  const [atMount] = useState(live);
  return atMount;
}

/**
 * Reactive read of the raw preference plus its setter — what a settings control
 * binds to. Distinct from `useDataSaver()`, which answers "is data saving in
 * effect", because a toggle must show `auto` as `auto` rather than as whatever
 * the current network resolved it to.
 */
export function useDataSaverPreference(): [DataSaverPreference, (next: DataSaverPreference) => void] {
  const [preference, setPreference] = useState<DataSaverPreference>(DEFAULT_DATA_SAVER_PREFERENCE);

  useEffect(() => {
    const sync = () => setPreference(readDataSaverPreference());
    sync();
    window.addEventListener(DATA_SAVER_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(DATA_SAVER_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = useCallback((next: DataSaverPreference) => {
    setPreference(next);
    setDataSaverPreference(next);
  }, []);

  return [preference, update];
}
