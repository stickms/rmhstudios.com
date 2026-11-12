import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { toast } from '@/lib/toast';
import { useSession } from '@/components/Providers';
import { authClient } from '@/lib/auth-client';
import { createRealtimeClient, type RealtimeClient } from '@/lib/shared/realtime/client';
import type { RealtimeStatus } from '@/lib/shared/realtime/types';
import { PARTY_C2S, PARTY_S2C } from '@/lib/party/events';
import type { PartyInviteMsg, PartyTicketMsg, PartyView } from '@/lib/party/types';

/**
 * Holds the party socket connection + state for the site shell. Intended to be
 * mounted once (by {@link PartyBar}). Connects to the games hub (same
 * `VITE_SOCKET_URL` + `/socket/` path as every other hub client) only when
 * signed in.
 *
 * Built on the shared realtime client, so it has the platform's full status
 * (`connecting` / `reconnecting` / terminal `error` on an auth failure / a
 * server kick that is not retried on focus) instead of one boolean and an
 * infinite retry. The party is cleared whenever the socket is not connected:
 * the hub drops a member whose seated socket disconnects, so a party shown
 * while offline is one the viewer may no longer be in — the hub sends a fresh
 * `party:state` once they are back in one.
 *
 * On `party:ticket`, navigates to the game route with the ticket carried in
 * router STATE (never the URL — tickets are single-use bearer secrets).
 */
export function useParty() {
  const { data: session } = useSession();
  const viewerId = session?.user?.id ?? null;
  const navigate = useNavigate();

  const [party, setParty] = useState<PartyView | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>('idle');
  const clientRef = useRef<RealtimeClient | null>(null);

  useEffect(() => {
    if (!viewerId) {
      setParty(null);
      setStatus('idle');
      return;
    }
    const base = import.meta.env.VITE_SOCKET_URL;
    if (!base) return;

    const client = createRealtimeClient({
      name: 'Party',
      url: base,
      path: '/socket/',
      auth: async () => {
        const current = await authClient.getSession();
        return { token: current?.data?.session?.token };
      },
      onStatus: (next) => {
        setStatus(next);
        if (next !== 'connected') setParty(null);
      },
      bind: (socket) => {
        socket.on(PARTY_S2C.STATE, (p: PartyView) => setParty(p));
        socket.on(PARTY_S2C.DISBANDED, () => setParty(null));
        socket.on(PARTY_S2C.INVITED, (inv: PartyInviteMsg) => {
          toast(`${inv.from.name ?? 'Someone'} invited you to a party`, {
            action: {
              label: 'Join',
              onClick: () => client.emit(PARTY_C2S.ACCEPT, { partyId: inv.partyId }),
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
      },
    });
    clientRef.current = client;

    return () => {
      client.destroy();
      if (clientRef.current === client) clientRef.current = null;
      setStatus('idle');
      setParty(null);
    };
  }, [viewerId, navigate]);

  const emit = useCallback((event: string, payload?: unknown) => {
    clientRef.current?.emit(event, payload);
  }, []);

  const createParty = useCallback(() => emit(PARTY_C2S.CREATE), [emit]);
  const invite = useCallback((userId: string) => emit(PARTY_C2S.INVITE, { userId }), [emit]);
  const accept = useCallback((partyId: string) => emit(PARTY_C2S.ACCEPT, { partyId }), [emit]);
  const leave = useCallback(() => emit(PARTY_C2S.LEAVE), [emit]);
  const kick = useCallback((userId: string) => emit(PARTY_C2S.KICK, { userId }), [emit]);
  const transfer = useCallback((userId: string) => emit(PARTY_C2S.TRANSFER, { userId }), [emit]);
  const queue = useCallback((game: string) => emit(PARTY_C2S.QUEUE, { game }), [emit]);

  return {
    connected: status === 'connected',
    status,
    party,
    viewerId,
    createParty,
    invite,
    accept,
    leave,
    kick,
    transfer,
    queue,
  };
}
