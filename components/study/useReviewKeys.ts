import { useEffect, useRef, type MutableRefObject } from 'react';

/**
 * A window keydown listener whose handler is a ref the caller reassigns each render. The caller resets it to
 * null at the top of a render and sets it only where a card is showing, so a stale handler never acts.
 */
export function useReviewKeys(): MutableRefObject<((e: KeyboardEvent) => void) | null> {
  const ref = useRef<((e: KeyboardEvent) => void) | null>(null);
  ref.current = null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => ref.current?.(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return ref;
}
