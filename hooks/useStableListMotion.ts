'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';

type ItemKey = string | number;

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

interface StableListMotionOptions {
  /** Keep large/infinite lists cheap by animating only the first visible batch. */
  maxAnimated?: number;
  /** Must match the shared `.content-item-enter` animation window. */
  durationMs?: number;
  /** Let a parent-level async reveal own the first empty → populated transition. */
  skipFirstAddition?: boolean;
}

/**
 * Marks only genuinely new keyed items for a short entrance animation.
 *
 * Items present on the component's first render are treated as established, so
 * hydration, cached navigation, and a loading placeholder resolving do not
 * replay every card. Once a key has been seen it is never animated again, even
 * if polling or a background refresh returns a new object for the same item.
 */
export function useStableListMotion(
  itemKeys: readonly ItemKey[],
  { maxAnimated = 8, durationMs = 280, skipFirstAddition = false }: StableListMotionOptions = {},
): ReadonlySet<ItemKey> {
  const reduced = useReducedMotion();
  const seenRef = useRef<Set<ItemKey> | null>(null);
  const hasCommittedItemsRef = useRef(false);
  const timersRef = useRef<Set<number>>(new Set());
  const [active, setActive] = useState<Set<ItemKey>>(() => new Set());

  const candidates =
    seenRef.current === null
      ? []
      : itemKeys.filter((key) => !seenRef.current?.has(key)).slice(0, maxAnimated);
  const skipBatch = skipFirstAddition && !hasCommittedItemsRef.current && itemKeys.length > 0;
  const unseen = skipBatch ? [] : candidates;
  const signature = JSON.stringify(itemKeys);

  useIsoLayoutEffect(() => {
    if (seenRef.current === null) {
      seenRef.current = new Set(itemKeys);
      hasCommittedItemsRef.current = itemKeys.length > 0;
      return;
    }

    for (const key of itemKeys) seenRef.current.add(key);
    if (itemKeys.length > 0) hasCommittedItemsRef.current = true;
    if (reduced || unseen.length === 0) return;

    const batch = new Set(unseen);
    setActive((previous) => new Set([...previous, ...batch]));
    const timer = window.setTimeout(() => {
      timersRef.current.delete(timer);
      setActive((previous) => {
        const next = new Set(previous);
        for (const key of batch) next.delete(key);
        return next;
      });
    }, durationMs);
    timersRef.current.add(timer);
  }, [signature, reduced, durationMs, maxAnimated, skipFirstAddition]);

  useEffect(
    () => () => {
      for (const timer of timersRef.current) window.clearTimeout(timer);
      timersRef.current.clear();
    },
    [],
  );

  if (reduced) return new Set();
  return new Set([...active, ...unseen]);
}
