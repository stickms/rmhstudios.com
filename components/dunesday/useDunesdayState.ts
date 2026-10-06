'use client';

/**
 * The page's single source of state: the plan in localStorage, optionally
 * seeded from a `#plan=` share link, with a small set of named actions.
 *
 * SSR renders the defaults (there is no storage on the server); the stored
 * plan replaces them on mount. That one-frame swap is the honest trade for a
 * page with no account behind it — the alternative is rendering nothing until
 * hydration, which would hide the hero from crawlers and link unfurls.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { localToday } from '@/lib/dunesday/schedule';
import {
  STORAGE_KEY,
  decodeShare,
  defaultState,
  hydrateState,
  orderedTitles,
  type CustomTitle,
  type DunesdayState,
} from '@/lib/dunesday/state';
import { TITLES, defaultIncluded } from '@/lib/dunesday/titles';

export type Preset = 'everything' | 'essentials' | 'films' | 'default' | 'none';

export function useDunesdayState() {
  const [state, setState] = useState<DunesdayState>(() => defaultState());
  const [ready, setReady] = useState(false);
  const [importedShare, setImportedShare] = useState(false);

  useEffect(() => {
    let stored: unknown;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      stored = raw ? JSON.parse(raw) : null;
    } catch {
      stored = null;
    }
    let next = hydrateState(stored);
    const match = window.location.hash.match(/plan=([A-Za-z0-9_-]+)/);
    if (match) {
      const shared = decodeShare(match[1]);
      if (shared && typeof shared === 'object') {
        // A shared plan brings its list and pace but keeps your own progress.
        const merged = hydrateState({
          ...next,
          ...(shared as object),
          settings: { ...next.settings, ...((shared as { settings?: object }).settings ?? {}) },
          watched: next.watched,
          episodesWatched: next.episodesWatched,
          night: next.night,
        });
        next = merged;
        setImportedShare(true);
      }
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }
    setState(next);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private mode / quota: the plan still works for this visit.
    }
  }, [state, ready]);

  const update = useCallback((fn: (s: DunesdayState) => DunesdayState) => setState(fn), []);

  const actions = useMemo(
    () => ({
      setSettings: (patch: Partial<DunesdayState['settings']>) =>
        update((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
      set: <K extends keyof DunesdayState>(key: K, value: DunesdayState[K]) =>
        update((s) => ({ ...s, [key]: value })),
      toggleIncluded: (id: string) =>
        update((s) => ({ ...s, included: { ...s.included, [id]: !(s.included[id] ?? true) } })),
      setIncludedMany: (ids: string[], on: boolean) =>
        update((s) => ({
          ...s,
          included: { ...s.included, ...Object.fromEntries(ids.map((id) => [id, on])) },
        })),
      toggleWatched: (id: string) =>
        update((s) => {
          const watched = { ...s.watched };
          if (watched[id]) delete watched[id];
          else watched[id] = localToday();
          return { ...s, watched };
        }),
      markWatchedMany: (ids: string[]) =>
        update((s) => {
          const watched = { ...s.watched };
          const today = localToday();
          for (const id of ids) watched[id] = watched[id] ?? today;
          return { ...s, watched };
        }),
      setEpisodes: (id: string, n: number, total: number) =>
        update((s) => {
          const episodesWatched = { ...s.episodesWatched, [id]: Math.max(0, Math.min(total, n)) };
          const watched = { ...s.watched };
          // Ticking the last episode ticks the show; stepping back un-ticks it.
          if (n >= total) watched[id] = watched[id] ?? localToday();
          else delete watched[id];
          return { ...s, episodesWatched, watched };
        }),
      setRuntime: (id: string, minutes: number | null) =>
        update((s) => {
          const runtimeOverrides = { ...s.runtimeOverrides };
          if (minutes === null || !Number.isFinite(minutes) || minutes <= 0)
            delete runtimeOverrides[id];
          else runtimeOverrides[id] = Math.min(6000, Math.round(minutes));
          return { ...s, runtimeOverrides };
        }),
      addCustom: (c: Omit<CustomTitle, 'id'>) =>
        update((s) => {
          const id = `custom-${Date.now().toString(36)}`;
          return {
            ...s,
            customTitles: [...s.customTitles, { ...c, id }].slice(0, 30),
            included: { ...s.included, [id]: true },
            customOrder: s.order === 'custom' ? [...s.customOrder, id] : s.customOrder,
          };
        }),
      removeCustom: (id: string) =>
        update((s) => ({
          ...s,
          customTitles: s.customTitles.filter((c) => c.id !== id),
          customOrder: s.customOrder.filter((x) => x !== id),
        })),
      setOrder: (order: DunesdayState['order']) =>
        update((s) => ({
          ...s,
          order,
          // Entering custom order starts from whatever you were looking at.
          customOrder:
            order === 'custom' && s.order !== 'custom'
              ? orderedTitles(s).map((t) => t.id)
              : s.customOrder,
        })),
      move: (id: string, delta: number) =>
        update((s) => {
          const list = s.customOrder.length
            ? [...s.customOrder]
            : orderedTitles(s).map((t) => t.id);
          const from = list.indexOf(id);
          const to = from + delta;
          if (from < 0 || to < 0 || to >= list.length) return s;
          list.splice(to, 0, ...list.splice(from, 1));
          return { ...s, customOrder: list, order: 'custom' };
        }),
      toggleSkip: (day: string) =>
        update((s) => {
          const has = s.settings.skipDates.includes(day);
          const skipDates = has
            ? s.settings.skipDates.filter((d) => d !== day)
            : [...s.settings.skipDates, day].sort();
          return { ...s, settings: { ...s.settings, skipDates } };
        }),
      preset: (p: Preset) =>
        update((s) => {
          const included = { ...s.included };
          for (const t of TITLES) {
            included[t.id] =
              p === 'everything'
                ? true
                : p === 'none'
                  ? false
                  : p === 'essentials'
                    ? t.essential
                    : p === 'films'
                      ? t.kind === 'film' && t.id !== 'dune-1984'
                      : defaultIncluded(t);
          }
          return { ...s, included };
        }),
      resetProgress: () => update((s) => ({ ...s, watched: {}, episodesWatched: {} })),
      resetAll: () => update(() => defaultState()),
      /** Adopt a plan restored from cloud sync (normalised again on the way in). */
      replace: (next: unknown) => update(() => hydrateState(next)),
    }),
    [update],
  );

  return { state, ready, importedShare, actions };
}

export type DunesdayActions = ReturnType<typeof useDunesdayState>['actions'];
