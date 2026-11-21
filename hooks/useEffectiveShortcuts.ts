import { useEffect, useMemo, useState } from 'react';
import { ALL_SHORTCUTS, subscribeShortcuts, type Shortcut } from '@/lib/shortcuts/registry';
import { effectiveBindings } from '@/lib/shortcuts/bindings';
import { useKeyboardPrefsStore } from '@/stores/keyboardPrefsStore';

/**
 * What is bound right now (registry declarations, then the person's remaps,
 * then the single-key mode). Recomputed when the preferences or the registry
 * change, never per keystroke. Shortcuts the mode switched off are absent.
 */
export function useEffectiveShortcuts(): Shortcut[] {
  const prefs = useKeyboardPrefsStore((s) => s.prefs);
  const [version, setVersion] = useState(0);
  useEffect(() => subscribeShortcuts(() => setVersion((v) => v + 1)), []);
  // `version` is the registry's change signal: ALL_SHORTCUTS() reads it fresh.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => effectiveBindings(ALL_SHORTCUTS(), prefs), [prefs, version]);
}

/** The effective keystroke sequence of one shortcut, or `undefined` when it is off. */
export function useEffectiveKeys(id: string): string[] | undefined {
  return useEffectiveShortcuts().find((s) => s.id === id)?.keys;
}
