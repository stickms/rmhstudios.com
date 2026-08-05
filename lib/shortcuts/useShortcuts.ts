'use client';

/**
 * React bindings for the shortcut registry (plan B4).
 *
 * `useShortcuts(list)` does two things: it publishes the declarations so the
 * help sheet and the conflict check can see them, and — for entries that carry
 * a `run` — it binds them. Declaration-only entries (the site set, whose
 * handlers still live in `KeyboardShortcuts.tsx`) are published but never
 * bound, so nothing gets handled twice.
 *
 * The registration is keyed on the *shape* of the list (ids, scopes, keys), not
 * on identity, and the registered entries delegate through a ref to the newest
 * `run`/`when`. That means a caller may pass an inline array literal — the
 * ordinary way to write this — without re-registering on every render, and
 * still never fires a stale closure.
 */

import { useEffect, useRef, useState } from 'react';
import {
  SEQUENCE_TIMEOUT_MS,
  isTypingTarget,
  matchesKeystroke,
  registerShortcuts,
  shortcutsForScope,
  subscribeShortcuts,
  type Shortcut,
  type ShortcutScope,
} from '@/lib/shortcuts/registry';

export interface UseShortcutsOptions {
  /** Turn the whole set off (a modal is open, the game is paused, …). */
  enabled?: boolean;
}

export function useShortcuts(
  shortcuts: readonly Shortcut[],
  { enabled = true }: UseShortcutsOptions = {},
): void {
  const listRef = useRef(shortcuts);
  listRef.current = shortcuts;

  // Identity of the *bindings*, not of the array. Changing a handler body does
  // not re-register; adding a shortcut or changing its keys does.
  const signature = shortcuts.map((s) => `${s.id}|${s.scope}|${s.keys.join(' ')}`).join('\n');

  useEffect(() => {
    if (!enabled) return;
    const current = (id: string) => listRef.current.find((s) => s.id === id);
    const entries = listRef.current.map((s): Shortcut => {
      const proxy: Shortcut = { ...s };
      // Preserve "declaration only": an entry with no handler must not gain one,
      // or the key listener below would start firing the site's shortcuts a
      // second time alongside KeyboardShortcuts.tsx.
      if (s.run) proxy.run = (event) => current(s.id)?.run?.(event);
      if (s.when) proxy.when = () => current(s.id)?.when?.() ?? true;
      return proxy;
    });
    return registerShortcuts(entries);
  }, [signature, enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!listRef.current.some((s) => s.run)) return; // nothing to bind

    /** Shortcuts still in play mid-sequence, and how many keystrokes matched. */
    let armed: Shortcut[] = [];
    let depth = 0;
    let armedAt = 0;

    const reset = () => {
      armed = [];
      depth = 0;
    };

    const onKey = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      const now = Date.now();
      if (depth > 0 && now - armedAt > SEQUENCE_TIMEOUT_MS) reset();

      const pool =
        depth === 0 ? listRef.current.filter((s) => s.run && (s.when ? s.when() : true)) : armed;

      const matched = pool.filter(
        (s) => s.keys.length > depth && matchesKeystroke(s.keys[depth], event),
      );
      if (matched.length === 0) {
        reset();
        return;
      }

      // A shortcut that ENDS here wins over one that wants another keystroke.
      // `findShortcutConflicts` flags that overlap as a `prefix` conflict, so it
      // should never exist in practice; resolving it in favour of the shorter
      // one at least keeps a reachable binding rather than a dead sequence.
      const complete = matched.find((s) => s.keys.length === depth + 1);
      if (complete) {
        event.preventDefault();
        reset();
        complete.run?.(event);
        return;
      }

      // Mid-sequence. Deliberately no preventDefault: the leading key of a
      // sequence ("g") has to stay a normal keypress until it resolves.
      armed = matched;
      depth += 1;
      armedAt = now;
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [signature, enabled]);
}

/**
 * Reactive read of everything pressable in `scope` — what a help sheet renders
 * from. Empty on the server and the first client render: the registry only
 * fills in as components mount, so rendering it into the SSR HTML would mean
 * shipping a list that is wrong by definition.
 */
export function useShortcutList(scope: ShortcutScope): Shortcut[] {
  const [list, setList] = useState<Shortcut[]>([]);
  useEffect(() => {
    const refresh = () => setList(shortcutsForScope(scope));
    refresh();
    return subscribeShortcuts(refresh);
  }, [scope]);
  return list;
}
