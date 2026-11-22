/**
 * A callback that runs `delayMs` after its LAST call: each call restarts the
 * timer, `cancel()` drops a pending run, and unmounting cancels too.
 *
 * The returned function is stable for a given delay (safe in effect deps), and
 * it always runs the latest `fn` the component rendered with, so `fn` need not
 * be memoised. The typical use is a search field's effect:
 *
 *   const search = useDebouncedCallback((q: string) => load(q), 250);
 *   useEffect(() => {
 *     search(query);
 *     return search.cancel;
 *   }, [query, search]);
 *
 * Three feed columns each kept the same `useRef(setTimeout)` + clearTimeout
 * pair by hand before this existed.
 */

import { useEffect, useMemo, useRef } from 'react';

export type DebouncedCallback<A extends unknown[]> = ((...args: A) => void) & {
  cancel: () => void;
};

export function useDebouncedCallback<A extends unknown[]>(
  fn: (...args: A) => unknown,
  delayMs: number,
): DebouncedCallback<A> {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  const debounced = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const cancel = () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    };
    const call = (...args: A) => {
      cancel();
      timer = setTimeout(() => {
        timer = null;
        void fnRef.current(...args);
      }, delayMs);
    };
    return Object.assign(call, {
      cancel,
    });
  }, [delayMs]);

  useEffect(() => debounced.cancel, [debounced]);

  return debounced;
}
