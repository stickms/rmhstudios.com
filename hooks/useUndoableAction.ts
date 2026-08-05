'use client';

/**
 * Undoable destructive actions (plan B1).
 *
 * `useOptimisticAction` covers the *toggle* shape — flip the UI, fire the
 * request, revert if it fails. It is the wrong shape for a REMOVAL (delete a
 * post, dismiss a notification, leave a community), because there the honest
 * interaction is "we did it, unless you say otherwise in the next few seconds"
 * — and the cheapest way to honour that is to not do it yet.
 *
 * Two modes, and the difference matters:
 *
 *   **deferred (default)** — the row disappears locally, a toast opens with an
 *   Undo button, and `commit` does not run until that toast expires. Undo is
 *   then a `clearTimeout` plus a local re-insert: zero network, nothing to fail,
 *   nothing to reconcile. This is correct for anything only the actor observes
 *   (their bookmarks, their notifications, their drafts, hiding a post from
 *   their own timeline).
 *
 *   **deferred: false** — `commit` runs immediately and Undo issues
 *   `compensate` (the reversing call). Required whenever *someone else* observes
 *   the change: deleting a public post, leaving a group chat, cancelling an
 *   invite. Holding those back for six seconds would mean the author sees the
 *   post gone while everyone else still sees it, and a closed laptop would
 *   silently drop the delete. The union below makes `compensate` mandatory in
 *   this mode, so the choice is a type error rather than a code review note.
 *
 * The deferred commit is flushed — not cancelled — when the component unmounts
 * or the page is hidden. The user was told the thing happened; navigating away
 * must not quietly undo it. Callers whose commit must survive an actual tab
 * close should pass `keepalive: true` on the fetch, which is the only part of
 * that guarantee this hook cannot provide for them.
 */

import { useCallback, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

/**
 * How long Undo stays offered. Also the toast's visible duration — the button
 * vanishing IS the signal that the window closed, so the two must not drift.
 */
export const UNDO_WINDOW_MS = 6000;

interface UndoableBase {
  /** Remove the item from local state. Runs immediately, before anything else. */
  apply: () => void;
  /** Put it back. Runs on Undo, and on any failure of `commit`. */
  revert: () => void;
  /** The real mutation. Must resolve to a fetch `Response`; a non-ok status is a failure. */
  commit: () => Promise<Response>;
  /** Toast body — already translated by the caller (it knows the entity's noun). */
  message: string;
  /** Override the "Undo" button label. */
  undoLabel?: string;
  /** Shown when `commit` (or `compensate`) fails. Defaults to a generic line. */
  errorMessage?: string;
  /** Override the undo window. Keep it ≥3s: below that the button is decoration. */
  durationMs?: number;
  /** Runs after `revert`, on failure — e.g. logging. */
  onError?: (error: unknown) => void;
}

/**
 * Written as an explicit union of two whole shapes (rather than an
 * intersection over a union) so `deferred` is a real discriminant: checking
 * `options.deferred === false` narrows `compensate` to present-and-required.
 */
export type UndoableRun =
  | (UndoableBase & {
      /** Hold `commit` until the undo window closes (the default). */
      deferred?: true;
      compensate?: never;
    })
  | (UndoableBase & {
      /** Commit now; Undo reverses it with a second call. */
      deferred: false;
      /** The call that undoes `commit` server-side. Mandatory in this mode. */
      compensate: () => Promise<Response>;
    });

/** A deferred commit that has not fired yet. */
interface PendingCommit {
  timer: ReturnType<typeof setTimeout>;
  /** Fire the held mutation now (window closed, unmount, or page hide). */
  fire: () => void;
}

async function expectOk(request: () => Promise<Response>): Promise<void> {
  const res = await request();
  if (!res.ok) throw new Error(`Request failed with ${res.status}`);
}

export function useUndoableAction() {
  const { t } = useTranslation('c-ui');

  /**
   * Every open undo window, keyed by its toast id. A Map rather than a single
   * slot because these stack: clearing four notifications in a row opens four
   * independent windows, and each must resolve on its own timer.
   */
  const pending = useRef(new Map<string | number, PendingCommit>());

  const flushAll = useCallback(() => {
    // Snapshot first: `fire()` deletes from the same Map we are iterating.
    for (const entry of [...pending.current.values()]) entry.fire();
  }, []);

  useEffect(() => {
    // `pagehide` (not `beforeunload`) is the event mobile Safari actually fires
    // when a tab is backgrounded or the app is swiped away.
    window.addEventListener('pagehide', flushAll);
    return () => {
      window.removeEventListener('pagehide', flushAll);
      flushAll();
    };
  }, [flushAll]);

  const run = useCallback(
    (options: UndoableRun): void => {
      const {
        apply,
        revert,
        commit,
        message,
        undoLabel,
        errorMessage,
        durationMs = UNDO_WINDOW_MS,
        onError,
      } = options;

      const fail = (error: unknown) => {
        revert();
        onError?.(error);
        toast.error(
          errorMessage ??
            t('undo-failed', { defaultValue: "That didn't go through. Nothing was changed." }),
        );
      };

      apply();

      if (options.deferred === false) {
        // Immediate mode: the change is already public, so Undo has to buy it
        // back with a compensating call rather than by cancelling a timer.
        const compensate = options.compensate;
        void expectOk(commit)
          .then(() => {
            toast.success(message, {
              duration: durationMs,
              action: {
                label: undoLabel ?? t('undo', { defaultValue: 'Undo' }),
                onClick: () => {
                  // Revert the UI first so Undo feels instant; if the reversing
                  // call is refused we re-apply, which is the honest outcome —
                  // the server still holds the change.
                  revert();
                  void expectOk(compensate).catch((error: unknown) => {
                    apply();
                    onError?.(error);
                    toast.error(
                      errorMessage ??
                        t('undo-failed', {
                          defaultValue: "That didn't go through. Nothing was changed.",
                        }),
                    );
                  });
                },
              },
            });
          })
          .catch(fail);
        return;
      }

      // Deferred mode. The toast id is minted first so the timer, the Undo
      // handler and the flush path all address the same window.
      const id = toast.success(message, {
        duration: durationMs,
        action: {
          label: undoLabel ?? t('undo', { defaultValue: 'Undo' }),
          onClick: () => {
            const entry = pending.current.get(id);
            if (!entry) return; // window already closed — commit is in flight
            clearTimeout(entry.timer);
            pending.current.delete(id);
            revert();
          },
        },
      });

      const fire = () => {
        const entry = pending.current.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        pending.current.delete(id);
        // The Undo button is gone the moment the request leaves, so dismiss the
        // toast rather than leave a dead affordance on screen during a flush.
        toast.dismiss(id);
        void expectOk(commit).catch(fail);
      };

      pending.current.set(id, { timer: setTimeout(fire, durationMs), fire });
    },
    [t],
  );

  return {
    run,
    /**
     * Fire every held commit now. Call this before a deliberate navigation that
     * unmounts the list (e.g. submitting a form that re-renders the page) if you
     * want the writes ordered ahead of it.
     */
    flushPending: flushAll,
  };
}
