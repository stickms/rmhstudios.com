/**
 * The keyboard layout this device types on (feature 11): QWERTY until the member picks another. Kept in
 * localStorage through `lib/core/persist.ts` (`rmh:rmhtype:layout`); a blocked or corrupt store reads as QWERTY.
 *
 * The lessons, the key statistics and every run's recorded layout read it, so choosing Dvorak once is enough. A
 * device-level preference: it does not follow the account to another device.
 */
import { persisted } from '@/lib/core/persist';
import { DEFAULT_LAYOUT, isTypingLayout, type TypingLayout } from '@/lib/rmhtype/keystats';

export const LAYOUT_PREF_KEY = 'rmh:rmhtype:layout';

const store = persisted<TypingLayout>({
  key: LAYOUT_PREF_KEY,
  version: 1,
  fallback: DEFAULT_LAYOUT,
  validate: (value) => (isTypingLayout(value) ? value : undefined),
});

const listeners = new Set<() => void>();
let cached: TypingLayout | null = null;

export function readLayoutPref(): TypingLayout {
  cached ??= store.read();
  return cached;
}

export function writeLayoutPref(layout: TypingLayout): void {
  cached = layout;
  store.write(layout);
  for (const listener of listeners) listener();
}

/** For `useSyncExternalStore`: called after every change made in this tab. */
export function subscribeLayoutPref(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
