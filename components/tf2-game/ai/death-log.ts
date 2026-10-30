/**
 * Your deaths this session, for the loadout bar's "counter what keeps killing you". The kill feed only
 * keeps an entry for ten seconds, so the log is fed from the HUD store's own publishes (≤30 Hz, no
 * loop of its own) from the first time a quick bar mounts until the page goes; until then the bars use
 * what the feed still shows.
 */
'use client';

import { noteDeaths, type DeathRecord } from '@/lib/tf2-game/client/ai/match-context';
import type { HudStore } from '@/lib/tf2-game/client/hud-store';

const logs = new WeakMap<HudStore, { log: readonly DeathRecord[] }>();

/** Start logging `store`'s deaths (once per store) and return a reader for the log. */
export function deathLogFor(store: HudStore): () => readonly DeathRecord[] {
  let entry = logs.get(store);
  if (!entry) {
    const e = { log: noteDeaths([], store.getSnapshot()) };
    logs.set(store, e);
    // Page lifetime: the store goes with the match page; the WeakMap lets both be collected.
    store.subscribe(() => {
      e.log = noteDeaths(e.log, store.getSnapshot());
    });
    entry = e;
  }
  const found = entry;
  return () => found.log;
}
