import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { markPresence } from '@/lib/hot-counters.server';
import { getUnreadNotificationCount } from '@/lib/notifications.server';
import { getActiveFriends, getOnlineFriends } from '@/lib/presence.server';

/**
 * POST /api/pulse — the one repeating request a signed-in tab makes.
 *
 * A signed-in tab used to keep four separate authenticated timers running:
 * `presence/heartbeat` (60s), `notifications/unread-count` (45s),
 * `presence/friends` (60s) and `friends/active` (60s). Every one of them
 * resolved the session independently, so an idle tab cost ~4 requests and ~4
 * session resolutions a minute before any of the actual work. This endpoint does
 * the heartbeat and returns the rest in one round trip.
 *
 * The payload is demand-driven: the client sends the set of sections its
 * currently-mounted consumers need, so a phone (where the friends rail is
 * `display: none`) never pays for the follow-graph fan-out, and a tab with only
 * the nav badge mounted only pays for the counter read. Each section is
 * independently cached server-side, so this is not more expensive than the sum of
 * the endpoints it replaces — it is the same work minus three session
 * resolutions and three round trips.
 *
 * The public "N people online" number is deliberately NOT here: it needs no
 * session, is identical for every visitor, and is served as a cacheable GET from
 * `presence/online-count`. Folding it in would have turned a shared, edge-friendly
 * response into a per-user POST.
 *
 * POST because it has a side effect (the presence write), which also keeps it
 * off any cache path.
 */

const SECTIONS = ['notifications', 'friends', 'activeFriends'] as const;
type Section = (typeof SECTIONS)[number];

const schema = z.object({
  /** Sections to include. Omitted/empty means heartbeat only. */
  want: z.array(z.enum(SECTIONS)).max(SECTIONS.length).optional(),
});

export interface PulseResponse {
  ok: boolean;
  notifications?: number;
  friends?: Awaited<ReturnType<typeof getOnlineFriends>>;
  activeFriends?: Awaited<ReturnType<typeof getActiveFriends>>;
}

export const Route = createFileRoute('/api/pulse')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ ok: false }, { status: 401 });

          // One pulse per minute per tab is the design; this leaves room for the
          // focus/visibility triggers and a couple of tabs on one IP without
          // tripping. Exceeding it is not an error — the client keeps its last
          // known values, exactly as it did when a poll failed.
          const { allowed } = rateLimit(getClientIp(request), {
            limit: 30,
            windowMs: 60_000,
            prefix: 'pulse',
          });
          if (!allowed) return Response.json({ ok: true, throttled: true });

          const parsed = schema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const userId = session.user.id;
          const want = new Set<Section>(parsed.data.want ?? []);

          // Marks presence in the Redis "online now" set and throttles the
          // Postgres lastSeenAt write to ~once/5min per user — same call the
          // dedicated heartbeat route made.
          const results = await Promise.allSettled([
            markPresence(userId),
            want.has('notifications') ? getUnreadNotificationCount(userId) : undefined,
            want.has('friends') ? getOnlineFriends(userId) : undefined,
            want.has('activeFriends') ? getActiveFriends(userId) : undefined,
          ]);

          // One failing section must not blank the others — these are ambient
          // surfaces, and the client keeps its previous value for anything absent.
          const value = <T>(i: number): T | undefined =>
            results[i].status === 'fulfilled'
              ? ((results[i] as PromiseFulfilledResult<T | undefined>).value ?? undefined)
              : undefined;

          const body: PulseResponse = { ok: true };
          if (want.has('notifications')) body.notifications = value<number>(1) ?? 0;
          if (want.has('friends')) body.friends = value(2) ?? [];
          if (want.has('activeFriends')) body.activeFriends = value(3) ?? [];

          return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
        } catch (error) {
          console.error('Pulse error:', error);
          return Response.json({ ok: false }, { status: 200 });
        }
      },
    },
  },
});
