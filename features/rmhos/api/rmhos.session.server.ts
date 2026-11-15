import { z } from 'zod';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getUserTier } from '@/lib/entitlements';
import { prisma } from '@/lib/prisma.server';
import { RMHOS } from '@features/rmhos/engine/constants';
import { toLinuxUsername } from '@features/rmhos/engine/linux-username';
import { signNetTicket } from '@features/rmhos/engine/net-ticket.server';
import { rmhosSessionApi, type RmhosSession } from '@features/rmhos/engine/rmhos.contract';

/**
 * The relay's public WebSocket URL. `VITE_RMHOS_NET_URL` wins (a dev override, read at runtime);
 * otherwise it is the site's own origin (BETTER_AUTH_URL, the configured public origin, before the
 * request URL, which behind Apache is the internal one) with the scheme swapped to ws(s).
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

const DAY_MS = 86_400_000;
type Access = 'all' | 'members' | 'verified';

/** RMHOS_NET_ACCESS. An unrecognised value fails closed to `members`, never open. */
function accessMode(): Access {
  const raw = (process.env.RMHOS_NET_ACCESS ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'all') return 'all';
  if (raw === 'verified') return 'verified';
  return 'members';
}

function minAccountAgeDays(): number {
  const n = Number(process.env.RMHOS_NET_MIN_ACCOUNT_AGE_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Who may have the network. Suspended or banned accounts never do (no reason is given: the page
 * shows plain "Network off"); everyone else is judged by RMHOS_NET_ACCESS and the account age and
 * told `not-eligible` so the page can say why. This, not the hub, is where the database is.
 */
async function eligibility(userId: string): Promise<'ok' | 'suspended' | 'not-eligible'> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { bannedUntil: true, emailVerified: true, createdAt: true },
  });
  if (!row) return 'suspended';
  if (row.bannedUntil && row.bannedUntil > new Date()) return 'suspended';
  const mode = accessMode();
  if (mode === 'members' && (await getUserTier(userId)) === 'free') return 'not-eligible';
  if (mode === 'verified' && row.emailVerified !== true) return 'not-eligible';
  const days = minAccountAgeDays();
  if (days > 0 && Date.now() - row.createdAt.getTime() < days * DAY_MS) return 'not-eligible';
  return 'ok';
}

async function buildNet(
  userId: string,
  request: Request,
  mint: boolean,
): Promise<RmhosSession['net']> {
  const secret = process.env.RMHOS_NET_TICKET_SECRET;
  // A secret shorter than the hub accepts would only mint tickets the hub (which then refuses to
  // start) can never check: say "off" instead.
  if (process.env.RMHOS_NET_ENABLED === '0' || !secret || secret.length < RMHOS.minSecretLength) {
    return { enabled: false };
  }
  const verdict = await eligibility(userId);
  if (verdict === 'suspended') return { enabled: false };
  if (verdict === 'not-eligible') return { enabled: false, reason: 'not-eligible' };
  if (!mint) return { enabled: true };
  return { enabled: true, url: relayUrl(request), ticket: signNetTicket(userId, secret) };
}

/** `?ticket=0`: answer without minting a ticket. Anything else is a 400. */
const querySchema = z.object({ ticket: z.literal('0').optional() });

export const route = apiRoute('/api/rmhos/session', {
  GET: implement(
    rmhosSessionApi,
    { rateLimit: 'read', query: querySchema },
    async ({ user, userId, request, query }) => {
    const who = user as { handle?: string | null; username?: string | null };
    const body = {
      linuxUser: toLinuxUsername(who.handle ?? who.username),
      net: await buildNet(userId, request, query?.ticket !== '0'),
    };
    // It carries a credential: never stored by a browser or shared cache.
    return Response.json(body, { headers: { 'cache-control': 'no-store' } });
    },
  ),
});
