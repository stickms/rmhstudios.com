import { useEffect, useRef, type RefObject } from 'react';

/** A ref for the request in flight; whatever it holds is aborted when the view goes away (the member left). */
export function useAbortOnUnmount(): RefObject<AbortController | null> {
  const ref = useRef<AbortController | null>(null);
  useEffect(() => () => ref.current?.abort(), []);
  return ref;
}
