import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { RMHOS } from '@features/rmhos/engine/constants';
import { toLinuxUsername } from '@features/rmhos/engine/linux-username';
import { signNetTicket } from '@features/rmhos/engine/net-ticket.server';
import { rmhosSessionApi, type RmhosNet } from '@features/rmhos/engine/rmhos.contract';

/**
 * The relay's public WebSocket URL. `VITE_RMHOS_NET_URL` wins; otherwise it is the site's own
 * origin (BETTER_AUTH_URL, the configured public origin, before the request URL, which behind
 * Apache is the internal one) with the scheme swapped to ws(s).
 */
function relayUrl(request: Request): string {
  const configured = process.env.VITE_RMHOS_NET_URL;
  if (configured) return configured;
  let origin: URL;
  try {
    origin = new URL(process.env.BETTER_AUTH_URL || request.url);
  } catch {
    origin = new URL(request.url);
  }
  const scheme = origin.protocol === 'http:' ? 'ws:' : 'wss:';
  return `${scheme}//${origin.host}${RMHOS.netPath}`;
}

function buildNet(userId: string, request: Request): RmhosNet {
  const secret = process.env.RMHOS_NET_TICKET_SECRET;
  if (process.env.RMHOS_NET_ENABLED === '0' || !secret) return { enabled: false };
  return { enabled: true, url: relayUrl(request), ticket: signNetTicket(userId, secret) };
}

export const route = apiRoute('/api/rmhos/session', {
  GET: implement(rmhosSessionApi, { rateLimit: 'read' }, ({ user, userId, request }) => {
    const who = user as { handle?: string | null; username?: string | null };
    const body = {
      linuxUser: toLinuxUsername(who.handle ?? who.username),
      net: buildNet(userId, request),
    };
    // It carries a credential: never stored by a browser or shared cache.
    return Response.json(body, { headers: { 'cache-control': 'no-store' } });
  }),
});
