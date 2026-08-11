/**
 * GET /api/casino/rooms — the public casino lobbies, for callers with no socket.
 *
 * The four casino tables keep their rooms in the socket server's memory, and a
 * socket connection needs a session token. That is why `/predictions` used to
 * bounce a signed-out visitor straight to `/login`: there was no way to show
 * them what was going on without an account. This route is that way — the web
 * tier asks the socket server over the compose network and hands the result
 * back same-origin, so the browser needs no CORS and never learns the hub's
 * address.
 *
 * `auth: 'none'` on purpose. The payload is only `privacy === 'public'` rooms,
 * serialized by the same `listPublicRooms()` the socket handler emits: a name,
 * an owner's display name, a seat count and whether a hand is in progress. No
 * player identities, no cards, no balances. Signing in changes what you can DO
 * with a room, not what you can see about it.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';

/** Empty lobbies, used whenever the hub is unreachable. */
const EMPTY = { blackjack: [], holdem: [], baccarat: [], roulette: [] };

function socketInternalUrl(): string {
  return (
    process.env.SOCKET_INTERNAL_URL ??
    `http://127.0.0.1:${process.env.SOCKET_PORT ?? process.env.PORT_SOCKET ?? '7001'}`
  );
}

export const Route = createFileRoute('/api/casino/rooms')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: 'read', label: 'casino-rooms' },
        async () => {
          // A hub that is restarting must not take the page down with it: the
          // lobby preview is a courtesy on a page that still has markets to
          // show, so an unreachable socket server degrades to empty lobbies
          // rather than a 502. The short timeout keeps a hung hub from holding
          // the request open.
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2000);
          try {
            const res = await fetch(`${socketInternalUrl()}/internal/casino-rooms`, {
              signal: controller.signal,
            });
            if (!res.ok) return Response.json(EMPTY);
            return Response.json(await res.json(), {
              headers: { 'Cache-Control': 'no-store' },
            });
          } catch {
            return Response.json(EMPTY);
          } finally {
            clearTimeout(timer);
          }
        },
      ),
    },
  },
});
