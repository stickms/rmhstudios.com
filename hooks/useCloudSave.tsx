/**
 * Load a game's save the same way in every game.
 *
 * Wraps a `CloudSave` from `lib/game-saves/cloud-save` in the small amount of
 * React each game would otherwise write for itself: wait for the session, tell
 * the store who is playing, read both copies, and either hand back a save or
 * hand back the dialog that asks which one to keep.
 *
 * Three behaviours are worth knowing before you use it:
 *
 * 1. **Nothing is read until the session resolves.** Better Auth reports
 *    `isPending` first and a user a round-trip later. Resolving during that
 *    window would read the account's save as absent, silently pick the local
 *    one, and then autosave it over the account thirty seconds later.
 * 2. **A local save that is ahead is pushed up.** That is the whole guest →
 *    account path: play signed out, make an account, and the run you already
 *    have becomes the run on the account. One request, only when the account is
 *    actually behind.
 * 3. **Signing out does not wipe anything.** The identity goes back to `null`
 *    and the local copy stays where it is, claimable by the next sign-in on this
 *    device — see `readLocal` in the store.
 */
'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '@/components/Providers';
import type { CloudSave } from '@/lib/game-saves/cloud-save';
import type { SaveOrigin, SaveSummary } from '@/lib/game-saves/conflict';
import { SaveConflictDialog } from '@/components/shared/SaveConflictDialog';

export type CloudSaveStatus = 'loading' | 'ready' | 'conflict';

export interface UseCloudSaveResult<T> {
  status: CloudSaveStatus;
  /** The save to start from. `null` means "new game". Only valid once ready. */
  save: T | null;
  /** Whether this session will reach an account at all. */
  signedIn: boolean;
  /** Render this. `null` unless the two copies have diverged. */
  conflictDialog: ReactNode;
  /** Read both copies again — after a sign-in, or a manual "sync now". */
  reload: () => void;
}

export interface UseCloudSaveOptions<T> {
  /** Named in the explanation, so the dialog says which game it is about. */
  gameName?: string;
  /**
   * Override the store's summary builder.
   *
   * The store's own lives in `lib/`, where there is no `t`, so it emits English
   * defaults. A component that has a translator passes a bound one here and the
   * summary cards translate — see `SummaryTranslate`.
   */
  summarize?: (save: T) => SaveSummary;
}

export function useCloudSave<T>(
  store: CloudSave<T>,
  options: UseCloudSaveOptions<T> = {},
): UseCloudSaveResult<T> {
  const session = useSession();
  const userId = session.data?.user?.id ?? null;
  const pending = session.isPending;

  const [status, setStatus] = useState<CloudSaveStatus>('loading');
  const [save, setSave] = useState<T | null>(null);
  const [conflict, setConflict] = useState<{ local: T; cloud: T } | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  // Held in a ref so the effect below does not re-run when the store object
  // identity changes — games build theirs at module scope, but a game that
  // builds it in a render would otherwise re-resolve on every frame.
  const latest = useRef(store);
  latest.current = store;

  useEffect(() => {
    if (pending) return;

    let cancelled = false;
    const cloudSave = latest.current;
    cloudSave.setIdentity(userId);
    setStatus('loading');

    void (async () => {
      const choice = await cloudSave.resolve();
      // A sign-out mid-fetch would otherwise drop one account's save into the
      // next player's game.
      if (cancelled) return;

      if (choice.kind === 'conflict') {
        setConflict({ local: choice.local, cloud: choice.cloud });
        setStatus('conflict');
        return;
      }

      const resolved = choice.kind === 'resolved' ? choice.save : null;
      setConflict(null);
      setSave(resolved);
      setStatus('ready');

      // The account is behind — either because this run started signed out, or
      // because the last session never got its final write out. Catch it up.
      if (resolved && choice.kind === 'resolved' && choice.origin === 'local' && userId) {
        cloudSave.writeCloud(resolved).catch(() => {
          // Offline. The next autosave will try again; nothing is lost either
          // way, because the local copy is already the one being played.
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, pending, nonce]);

  const choose = useCallback(
    (origin: SaveOrigin) => {
      if (!conflict) return;
      const kept = origin === 'local' ? conflict.local : conflict.cloud;
      // Written to BOTH sides immediately rather than left to the autosave: the
      // player has just been told the other copy is replaced, and a promise that
      // only comes true in thirty seconds is a promise that a closed tab breaks.
      void latest.current.commit(kept).catch(() => {});
      setConflict(null);
      setSave(kept);
      setStatus('ready');
    },
    [conflict],
  );

  return {
    status,
    save,
    signedIn: Boolean(userId),
    reload,
    conflictDialog: conflict ? (
      <SaveConflictDialog
        local={(options.summarize ?? store.summarize)(conflict.local)}
        cloud={(options.summarize ?? store.summarize)(conflict.cloud)}
        gameName={options.gameName}
        onChoose={choose}
      />
    ) : null,
  };
}
