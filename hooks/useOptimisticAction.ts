import { useCallback, useRef, useState } from 'react';
import { yieldToMain } from '@/lib/scheduler';

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
 *
 * ## The yield between `apply` and `commit` (OPT-34)
 *
 * `apply()` is the whole reason the user tapped: the heart fills, the count
 * moves. `commit()` is bookkeeping they never see — building headers, an
 * idempotency key, `JSON.stringify`, handing the request to a service worker
 * that may intercept it. Run back to back they are one task, and the paint
 * waits for the end of it on every like in a 30-card feed.
 *
 * `yieldToMain()` between them makes the optimistic render its own task, so it
 * reaches the screen first and the request leaves in the next one. Nothing here
 * reads layout and no call site is a cancelable-event handler (these are all
 * `onClick` bodies that have already returned by the time `run` continues), so
 * both of the yield's hazards are absent. One yield, not three — the guard is
 * taken and `apply()` has run before it, so an interleaved second tap is still
 * refused exactly as before.
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
        // Let the optimistic update paint before the request is assembled.
        await yieldToMain();
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
