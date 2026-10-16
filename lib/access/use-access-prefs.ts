import { useSyncExternalStore } from 'react';
import {
  DEFAULT_ACCESS_PREFS,
  getAccessPrefs,
  subscribeAccessPrefs,
  type AccessPrefs,
} from '@/lib/access/prefs';

/** Hydration-safe: the server and the hydrating render both see the defaults. */
export function useAccessPrefs(): AccessPrefs {
  return useSyncExternalStore(subscribeAccessPrefs, getAccessPrefs, () => DEFAULT_ACCESS_PREFS);
}
