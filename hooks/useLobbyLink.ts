'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useClipboard } from '@/hooks/useClipboard';
import {
  LOBBY_LINK_PARAM,
  lobbyLink,
  lobbyPathLink,
  sanitizeLobbyCode,
} from '@/lib/lobby-link';

/**
 * The two halves of a direct lobby link, for the games that have a lobby.
 *
 * {@link useLobbyLink} is the handing-out half: a copy button next to the join
 * code. {@link useLobbyInvite} and {@link useLobbyInviteJoin} are the walking-in
 * half: a link opened somewhere else lands here, and the game joins on its own.
 *
 * See `lib/lobby-link.ts` for why links come in a query shape and a path shape.
 */

/**
 * A copy-the-invite-link button.
 *
 * Pass `code` for a game whose lobby is a screen (link is `?lobby=CODE` on
 * `path`, defaulting to the current page), or `path` alone for a game whose
 * lobby is its own route (RMHbox, Altair) — the path is then the whole link.
 *
 * `copied` self-resets, so the caller can swap a Copy icon for a Check without
 * owning a timer.
 */
export function useLobbyLink({ code, path }: { code?: string | null; path?: string }): {
  /** The absolute link. Empty during SSR, and empty when there is no lobby yet. */
  link: string;
  copied: boolean;
  /** Resolves false when the clipboard refused — worth a toast at the call site. */
  copyLink: () => Promise<boolean>;
} {
  const { copied, copy } = useClipboard();

  // Built at click time as well as here: `window` is absent during SSR, so the
  // memo is empty on the server and correct from the first client render on.
  const link = useMemo(() => {
    if (code) return lobbyLink(code, path);
    return path ? lobbyPathLink(path) : '';
  }, [code, path]);

  const copyLink = useCallback(async () => {
    const href = code ? lobbyLink(code, path) : path ? lobbyPathLink(path) : '';
    if (!href) return false;
    return copy(href);
  }, [code, path, copy]);

  return { link, copied, copyLink };
}

/**
 * The lobby code this page was opened with, or `null`.
 *
 * Captured once so it survives {@link useLobbyInviteJoin} stripping the param
 * off the URL: a component that uses the code to decide which screen to show
 * would otherwise be yanked back the moment the code is consumed.
 */
export function useLobbyInvite(): string | null {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const fromUrl = sanitizeLobbyCode(search[LOBBY_LINK_PARAM]);
  const [code, setCode] = useState<string | null>(fromUrl);
  const seen = useRef(fromUrl);

  // A link pasted into the address bar of a page already open is a client-side
  // navigation, not a mount, so the captured value has to notice a NEW code.
  useEffect(() => {
    if (fromUrl && fromUrl !== seen.current) {
      seen.current = fromUrl;
      setCode(fromUrl);
    }
  }, [fromUrl]);

  return code;
}

/** Everything except the invite param, which has served its purpose. */
const dropInviteParam = (prev: Record<string, unknown>) => ({
  ...prev,
  [LOBBY_LINK_PARAM]: undefined,
});

/**
 * Join once from an invite link.
 *
 * `join` fires a single time, as soon as `ready` is true — which is the game's
 * "the socket is up" flag, because a join emitted into a socket that has not
 * connected is a join that quietly never happened.
 *
 * The param is dropped from the URL in the same breath. It has done its job by
 * then, and leaving it there means a player who joins, leaves, and reloads is
 * pulled straight back into the lobby they just walked out of.
 *
 * A caller that has to open its multiplayer screen first reads the code from
 * {@link useLobbyInvite}, which keeps returning it after this has consumed it.
 */
export function useLobbyInviteJoin(ready: boolean, join: (code: string) => void): void {
  const code = useLobbyInvite();
  const navigate = useNavigate();
  const joinRef = useRef(join);
  joinRef.current = join;
  const done = useRef(false);

  useEffect(() => {
    if (!code || !ready || done.current) return;
    done.current = true;
    joinRef.current(code);
    // `navigate` is typed against the route tree, and a hook shared by ten game
    // routes cannot name one — hence the cast on an otherwise ordinary reducer.
    void navigate({ search: dropInviteParam as never, replace: true });
  }, [code, ready, navigate]);
}
