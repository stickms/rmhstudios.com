'use client';

/**
 * The room, as React sees it.
 *
 * `BumsRushLobby` is a plain observable store (it is imported during SSR and by
 * hub-facing tests, so it deliberately is not Zustand). This hook is the thin
 * bridge: one instance per game mount, subscribed through
 * `useSyncExternalStore` so a room update repaints exactly the screens that
 * read it.
 *
 * **It is created lazily.** Constructing the lobby wires socket listeners; it
 * does not open a connection. But a player who came here to play alone should
 * not pay even that, so nothing exists until the first multiplayer intent.
 * `connect()` is the only call that opens a socket, and only the online doors
 * make it.
 */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { BumsRushLobby, type LobbyState } from '@/lib/bums-rush/net';
import type { Cosmetics } from '@/lib/bums-rush/types';

const EMPTY_STATE: LobbyState = {
  room: null,
  mySeats: [],
  rooms: [],
  start: null,
  hostChanged: null,
  lastError: null,
  lastResultAck: null,
  medianRtt: null,
  amHost: false,
};

export interface LobbyBridge {
  /** Null until some screen has asked for multiplayer. */
  lobby: BumsRushLobby | null;
  state: LobbyState;
  /** Creates the lobby if needed and opens the socket. Safe to call repeatedly. */
  connect: (identity: { name: string; cosmetics: Cosmetics }) => Promise<BumsRushLobby>;
  /** Tear the room down without unmounting the game (leaving a lobby, going home). */
  leave: () => void;
}

export function useLobby(): LobbyBridge {
  const ref = useRef<BumsRushLobby | null>(null);
  // The instance is also held in state so `subscribe` / `getSnapshot` change
  // identity when it is created. `useSyncExternalStore` only re-subscribes when
  // `subscribe` changes; with a stable callback the store created by the first
  // `connect()` was never subscribed to, so a created/joined room never
  // repainted the lobby screen.
  const [instance, setInstance] = useState<BumsRushLobby | null>(null);

  useEffect(() => {
    return () => {
      ref.current?.dispose();
      ref.current = null;
    };
  }, []);

  const subscribe = useCallback(
    (onChange: () => void) => (instance ? instance.subscribe(onChange) : () => {}),
    [instance],
  );

  const getSnapshot = useCallback(() => instance?.getState() ?? EMPTY_STATE, [instance]);

  const state = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_STATE);

  const connect = useCallback(async (identity: { name: string; cosmetics: Cosmetics }) => {
    if (!ref.current) {
      ref.current = new BumsRushLobby();
      // Re-run `subscribe` now that there is something to subscribe to.
      setInstance(ref.current);
    }
    await ref.current.connect(identity);
    return ref.current;
  }, []);

  const leave = useCallback(() => {
    ref.current?.leave();
  }, []);

  return { lobby: instance, state, connect, leave };
}
