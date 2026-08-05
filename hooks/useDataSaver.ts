'use client';

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
 * SSR contract: `false` on the server and on the first client render, always.
 * The preference lives in localStorage and the connection class in a browser
 * API, so a server render can only guess — and a guess that omits an image on
 * the server and includes it on the client is a hydration mismatch. Callers
 * that reserve layout space must reserve it unconditionally.
 */

import { useCallback, useEffect, useState } from 'react';

export const DATA_SAVER_KEY = 'rmh-data-saver';
/** Fired on the window when the preference changes, so open tabs agree. */
export const DATA_SAVER_EVENT = 'rmh:data-saver';

export const DATA_SAVER_PREFERENCES = ['auto', 'on', 'off'] as const;
export type DataSaverPreference = (typeof DATA_SAVER_PREFERENCES)[number];
export const DEFAULT_DATA_SAVER_PREFERENCE: DataSaverPreference = 'auto';

/**
 * The Network Information API, typed here rather than imported: it is not in
 * TypeScript's `lib.dom` (no cross-browser support), and every member is
 * optional because partial implementations are the norm — Chrome on desktop
 * exposes `effectiveType` but not `saveData`.
 */
interface NetworkInformationLike {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
  addEventListener?: (type: 'change', listener: () => void) => void;
  removeEventListener?: (type: 'change', listener: () => void) => void;
}

interface NavigatorWithConnection extends Navigator {
  readonly connection?: NetworkInformationLike;
}

/** Connection classes we treat as "too slow for the nice-to-haves". */
const SLOW_TYPES = new Set(['slow-2g', '2g']);

function connection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as NavigatorWithConnection).connection;
}

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
  const conn = connection();
  if (!conn) return false;
  return conn.saveData === true || SLOW_TYPES.has(conn.effectiveType ?? '');
}

export function useDataSaver(): boolean {
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const sync = () => setSaving(resolveDataSaver(readDataSaverPreference()));
    sync();

    const conn = connection();
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

/**
 * Reactive read of the raw preference plus its setter — what a settings control
 * binds to. Distinct from `useDataSaver()`, which answers "is data saving in
 * effect", because a toggle must show `auto` as `auto` rather than as whatever
 * the current network resolved it to.
 */
export function useDataSaverPreference(): [
  DataSaverPreference,
  (next: DataSaverPreference) => void,
] {
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
