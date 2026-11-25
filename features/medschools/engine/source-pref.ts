import type { MedSource } from './types';

/**
 * The reader's source choice (owner 2026-11-24): the header's CycleTrack / Admit.org toggle. The pure half; the browser
 * half is `ui/useSourcePref.ts`.
 *
 * It never sums sources (spec §10). It chooses which source's figures the totals and the primary series use: the chosen
 * source where it has data for that school, else the other one, then the rest of `PRIMARY_ORDER` (`primaryOrder` in
 * `public-read.ts`). CycleTrack is the default because it is already first in that order, so "cycletrack" and "no
 * choice" read the same figures and the API is asked for `source=admit` only.
 *
 * Precedence, one rule: the URL (`source=`, anyone can type it, so the public reads stay user-independent), else this
 * device (`localStorage[SOURCE_PREF_KEY]`, never the account), else the default.
 */

export type SourcePref = 'cycletrack' | 'admit';
export const SOURCE_PREFS: readonly SourcePref[] = ['cycletrack', 'admit'];
export const DEFAULT_SOURCE_PREF: SourcePref = 'cycletrack';

/** The localStorage key (named in `lib/device-data/registry.ts`). Only `admit` is ever stored; the default is not. */
export const SOURCE_PREF_KEY = 'rmh-medschool-source';

export const PREF_SOURCE: Record<SourcePref, MedSource> = { cycletrack: 'CYCLETRACK', admit: 'ADMIT' };

export type SourcePrefFrom = 'url' | 'device' | 'default';

export function pickSourcePref(
  url: SourcePref | undefined,
  device: SourcePref | undefined,
): { value: SourcePref; from: SourcePrefFrom } {
  if (url) return { value: url, from: 'url' };
  if (device) return { value: device, from: 'device' };
  return { value: DEFAULT_SOURCE_PREF, from: 'default' };
}

/** What storage holds, as a choice: anything but `admit` (nothing, junk, an old shape) is no choice. */
export const parseStoredSourcePref = (raw: string | null | undefined): SourcePref | undefined =>
  raw === 'admit' ? 'admit' : undefined;

// The public query value for a choice (`sourceParamOf`) lives in `medschools.queries.ts`: the route loaders need it,
// and importing this module there would put all of it in the entry every page downloads (check-bundle-budget).
