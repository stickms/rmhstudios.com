/**
 * Per-viewer Listen preferences (feature 12): speed and voice, in localStorage
 * through `lib/core/persist.ts`. A blocked or corrupt store reads as defaults.
 */

import { persisted } from '@/lib/core/persist';

/** The speeds the menu offers. */
export const LISTEN_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

export interface ListenPrefs {
  rate: number;
  /** `voiceURI` of the chosen voice; `null` is "System default". */
  voiceURI: string | null;
}

export const DEFAULT_LISTEN_PREFS: ListenPrefs = {
  rate: 1,
  voiceURI: null,
};

export function validateListenPrefs(value: unknown): ListenPrefs | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  const rate = LISTEN_RATES.find((r) => r === v.rate);
  if (rate === undefined) return undefined;
  const voiceURI = typeof v.voiceURI === 'string' ? v.voiceURI : null;
  return {
    rate,
    voiceURI,
  };
}

const store = persisted<ListenPrefs>({
  key: 'rmh-listen-prefs',
  version: 1,
  fallback: DEFAULT_LISTEN_PREFS,
  validate: validateListenPrefs,
});

export const readListenPrefs = () => store.read();
export const writeListenPrefs = (prefs: ListenPrefs) => store.write(prefs);
