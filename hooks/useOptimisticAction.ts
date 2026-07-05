import { useCallback, useRef, useState } from 'react';

/**
 * Shared optimistic-action primitive.
 *
 * The app has the same hand-rolled shape repeated across likes, reposts,
 * follows, bookmarks, etc.: flip the UI immediately, fire a `fetch`, and revert
 * if it fails. This hook captures that pattern once so every toggle in the app
 * can be instant-and-self-healing without copy-pasting the try/catch/rollback
 * dance.
 *
 * Contract:
 *   - `apply` mutates the UI up front (before the network call).
 *   - `commit` performs the request and resolves to a `Response`. A non-`ok`
 *     status is treated as failure automatically (matches every call site's
 *     existing `res.ok` check).
 *   - `rollback` reverts `apply` on any failure (bad status or thrown error).
 *   - `reconcile` (optional) applies the authoritative server payload after a
 *     successful commit — e.g. reading `{ bookmarked }` back off the response.
 *   - `onError` (optional) runs after rollback — e.g. a toast.
 *
 * Returns `true` on success, `false` on failure, so callers can branch if they
 * need to.
 */
export interface OptimisticRun {
  /** Optimistic UI mutation, applied immediately. */
  apply: () => void;
  /** Revert `apply`. Runs on any failure. */
  rollback: () => void;
  /** The network request; must resolve to a fetch `Response`. */
  commit: () => Promise<Response>;
  /** Reconcile the UI with the authoritative server payload (response was ok). */
  reconcile?: (res: Response) => void | Promise<void>;
  /** Runs after rollback on failure — e.g. show a toast. `res` present on a bad status. */
  onError?: (error: unknown, res?: Response) => void;
}

export function useOptimisticAction() {
  const [pending, setPending] = useState(false);
  // Guard against overlapping runs on the same control (double-tap a like).
  const inFlight = useRef(false);

  const run = useCallback(
    async ({ apply, rollback, commit, reconcile, onError }: OptimisticRun): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      apply();
      setPending(true);
      try {
        const res = await commit();
        if (!res.ok) {
          rollback();
          onError?.(new Error(`Request failed with ${res.status}`), res);
          return false;
        }
        if (reconcile) await reconcile(res);
        return true;
      } catch (error) {
        rollback();
        onError?.(error);
        return false;
      } finally {
        inFlight.current = false;
        setPending(false);
      }
    },
    [],
  );

  return { run, pending };
}
