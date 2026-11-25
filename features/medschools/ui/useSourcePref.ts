import { useSyncExternalStore } from 'react';
import { useNavigate, useRouterState, useSearch } from '@tanstack/react-router';
import { readString, removeKey, writeString } from '@/lib/core/persist';
import { parseSourcePref } from '../engine/search';
import {
  PREF_SOURCE,
  SOURCE_PREF_KEY,
  parseStoredSourcePref,
  pickSourcePref,
  type SourcePref,
  type SourcePrefFrom,
} from '../engine/source-pref';
import type { MedSource } from '../engine/types';
import { holdScroll } from './hold-scroll';

/**
 * The reader's CycleTrack / Admit.org choice (owner 2026-11-24): the browser half of `engine/source-pref.ts`.
 *
 * Like the saved filters (`useSavedFilters.ts`) the server cannot read this device's choice, so the server HTML and the
 * hydrating render follow the URL (or the default); right after hydration the store answers and the page moves to the
 * remembered source in place (the previous figures kept on screen, dimmed, until the new ones land; no scroll change,
 * no skeleton). Every storage access goes through `lib/core/persist` (never throws).
 */

const listeners = new Set<() => void>();
/** A value storage would not keep (blocked or full): it stands in for the stored one this visit. */
let unsaved: string | null | undefined;

function readDevice(): SourcePref | undefined {
  return parseStoredSourcePref(unsaved !== undefined ? unsaved : readString(SOURCE_PREF_KEY));
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SOURCE_PREF_KEY || e.key === null) fn();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener('storage', onStorage);
  };
}

/** Remember a choice on this device; the default (CycleTrack) forgets it. */
export function saveSourcePref(next: SourcePref): void {
  if (next === 'admit') {
    unsaved = writeString(SOURCE_PREF_KEY, next) ? undefined : next;
  } else {
    removeKey(SOURCE_PREF_KEY);
    unsaved = readString(SOURCE_PREF_KEY) === null ? undefined : null;
  }
  for (const fn of listeners) fn();
}

/** This device's choice: `undefined` on the server and in the hydrating render. */
export function useDeviceSourcePref(): SourcePref | undefined {
  return useSyncExternalStore(subscribe, readDevice, () => undefined);
}

/** The two routes whose figures follow the choice, so the only ones that carry it in their URL. */
const FOLLOWS = new Set(['/med/', '/med/$slug']);

export interface SourceChoice {
  value: SourcePref;
  from: SourcePrefFrom;
  /** The source it puts first, for the readers in the browser (`primaryOrder`, `overlaySource`, `buildTotalsMatrix`). */
  source: MedSource;
  choose: (next: SourcePref) => void;
}

/**
 * The effective choice (the URL, else this device, else CycleTrack) and the setter. Choosing remembers it on this device
 * and, on the index and a school page, writes `source=admit` (`ADMIT` on a school page) into the URL, the default dropping the key, in place: the
 * scroll is held, the entry replaced. Other pages only remember it.
 */
export function useSourcePref(): SourceChoice {
  const navigate = useNavigate();
  const url = parseSourcePref((useSearch({ strict: false }) as Record<string, unknown>).source);
  const device = useDeviceSourcePref();
  const follows: string | undefined = useRouterState({
    select: (s): string | undefined => s.matches.find((m) => FOLLOWS.has(m.routeId))?.routeId,
  });
  const { value, from } = pickSourcePref(url, device);
  const choose = (next: SourcePref) => {
    saveSourcePref(next);
    if (!follows || next === value) return;
    holdScroll();
    void navigate({
      to: '.',
      search: ((prev: Record<string, unknown>) => ({
        ...prev,
        // The school page's `source` is also History's picker, written in upper case (`ADMIT`, `SDN`); the index's is
        // lower case. Both parse either way.
        source: next === 'admit' ? (follows === '/med/$slug' ? 'ADMIT' : 'admit') : undefined,
      })) as never,
      replace: true,
      resetScroll: false,
    });
  };
  return { value, from, source: PREF_SOURCE[value], choose };
}
