'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { useSession } from '@/components/Providers';
import { authClient } from '@/lib/auth-client';
import { ensureTrailingSlash } from '@/lib/url';
import { PARTY_C2S, PARTY_S2C } from '@/lib/party/events';
import type { PartyInviteMsg, PartyTicketMsg, PartyView } from '@/lib/party/types';

/**
 * Holds the party socket connection + state for the site shell. Intended to be
 * mounted once (by {@link PartyBar}). Connects to the games hub (same
 * `VITE_SOCKET_URL` + `/socket/` path as every other hub client) only when
 * signed in.
 *
 * On `party:ticket`, navigates to the game route with the ticket carried in
 * router STATE (never the URL — tickets are single-use bearer secrets).
 */
export function useParty() {
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const navigate = useNavigate();

  const [party, setParty] = useState<PartyView | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!viewerId) {
      setParty(null);
      return;
    }
    const base = import.meta.env.VITE_SOCKET_URL;
    if (!base) return;

    const socket = io(ensureTrailingSlash(base), {
      path: '/socket/',
      auth: (cb) => {
        authClient
          .getSession()
          .then((s) => cb({ token: s?.data?.session?.token }))
          .catch(() => cb({}));
      },
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on(PARTY_S2C.STATE, (p: PartyView) => setParty(p));
    socket.on(PARTY_S2C.DISBANDED, () => setParty(null));
    socket.on(PARTY_S2C.INVITED, (inv: PartyInviteMsg) => {
      toast(`${inv.from.name ?? 'Someone'} invited you to a party`, {
        action: {
          label: 'Join',
          onClick: () => socket.emit(PARTY_C2S.ACCEPT, { partyId: inv.partyId }),
        },
      });
    });
    socket.on(PARTY_S2C.TICKET, (msg: PartyTicketMsg) => {
      toast.success(`Joining ${msg.game}…`);
      // Dynamic target route + ticket in router state (not the URL). Cast through
      // unknown because the game id isn't statically known to the route tree.
      const opts = { to: `/${msg.game}`, state: { partyTicket: msg } } as unknown as Parameters<
        typeof navigate
      >[0];
      void navigate(opts);
    });
    socket.on(PARTY_S2C.ERROR, (e: { message?: string }) => {
      if (e?.message) toast.error(e.message);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
      setParty(null);
    };
  }, [viewerId, navigate]);

  const emit = useCallback((event: string, payload?: unknown) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const createParty = useCallback(() => emit(PARTY_C2S.CREATE), [emit]);
  const invite = useCallback((userId: string) => emit(PARTY_C2S.INVITE, { userId }), [emit]);
  const accept = useCallback((partyId: string) => emit(PARTY_C2S.ACCEPT, { partyId }), [emit]);
  const leave = useCallback(() => emit(PARTY_C2S.LEAVE), [emit]);
  const kick = useCallback((userId: string) => emit(PARTY_C2S.KICK, { userId }), [emit]);
  const transfer = useCallback((userId: string) => emit(PARTY_C2S.TRANSFER, { userId }), [emit]);
  const queue = useCallback((game: string) => emit(PARTY_C2S.QUEUE, { game }), [emit]);

  return { connected, party, viewerId, createParty, invite, accept, leave, kick, transfer, queue };
}
