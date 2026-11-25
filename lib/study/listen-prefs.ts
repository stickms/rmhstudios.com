/**
 * The Listen mode of a review session (s11-17), remembered on this device: whether it is on and how long the front
 * stays before the back is shown. Speed and voice are the article Listen's (`lib/reading/listen-prefs.ts`).
 */
import { persisted } from '@/lib/core/persist';
import { isListenDelay, type ListenDelay } from '@/lib/study/listen';

export interface CardListenPrefs {
  on: boolean;
  /** Seconds of quiet after the front before the back is shown; 0 waits for the member. */
  delay: ListenDelay;
}

export const DEFAULT_CARD_LISTEN_PREFS: CardListenPrefs = { on: false, delay: 5 };

export function validateCardListenPrefs(value: unknown): CardListenPrefs | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (typeof v.on !== 'boolean' || !isListenDelay(v.delay)) return undefined;
  return { on: v.on, delay: v.delay };
}

/** The device key (registered as `card-listen` in `lib/device-data/registry.ts`). */
export const CARD_LISTEN_PREFS_KEY = 'rmh:study:listen';

const store = persisted<CardListenPrefs>({
  key: CARD_LISTEN_PREFS_KEY,
  version: 1,
  fallback: DEFAULT_CARD_LISTEN_PREFS,
  validate: validateCardListenPrefs,
});

export const readCardListenPrefs = () => store.read();
export const writeCardListenPrefs = (prefs: CardListenPrefs) => store.write(prefs);
