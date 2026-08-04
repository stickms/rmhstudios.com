/**
 * /api/calls/ice — short-lived ICE server credentials.
 *
 * The TURN secret never leaves the server: this mints a credential that expires
 * in minutes and is bound to the requesting account (coturn's `use-auth-secret`
 * mode), so a credential lifted from devtools is worthless almost immediately
 * and cannot be used to relay someone else's traffic.
 *
 * Returns STUN-only when no relay is configured, which is a working call for
 * most network pairs and an honest failure for the rest — see `lib/call/ice.ts`.
 */
import { createFileRoute } from '@tanstack/react-router';
import { createHmac } from 'node:crypto';
import { defineHandler } from '@/lib/api/handler.server';
import { buildIceServers, hasTurn } from '@/lib/call/ice';

export const Route = createFileRoute('/api/calls/ice')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json({
          iceServers: buildIceServers({
            userId,
            now: Date.now(),
            hmacSha1Base64: (secret, message) =>
              createHmac('sha1', secret).update(message).digest('base64'),
          }),
          // Lets the UI warn that some calls may not connect, instead of
          // failing silently on the minority of restrictive networks.
          relayAvailable: hasTurn(),
        }),
      ),
    },
  },
});
