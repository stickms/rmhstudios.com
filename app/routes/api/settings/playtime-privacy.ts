import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import {
  dismissPlaytimeNotice,
  getPlaytimeSettings,
  setPlaytimePrivacy,
} from '@/lib/playtime/playtime.server';
import { PLAYTIME_PRIVACY_VALUES } from '@/lib/playtime/privacy';

/**
 * /api/settings/playtime-privacy — who may see this account's per-title playtime.
 *
 * Public by default (an owner decision) with opt-out. The setting is enforced in
 * every read path in `lib/playtime/playtime.server.ts`, never by a client; this
 * route only reads and writes the preference and the one-time notice flag.
 */
export const Route = createFileRoute('/api/settings/playtime-privacy')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await getPlaytimeSettings(userId)),
      ),
      PUT: defineHandler(
        {
          rateLimit: 'write',
          body: z.object({ playtimePrivacy: z.enum(PLAYTIME_PRIVACY_VALUES) }),
        },
        async ({ userId, body }) => {
          await setPlaytimePrivacy(userId, body.playtimePrivacy);
          return Response.json(await getPlaytimeSettings(userId));
        },
      ),
      POST: defineHandler(
        { rateLimit: 'write', body: z.object({ dismissNotice: z.literal(true) }) },
        async ({ userId }) => {
          await dismissPlaytimeNotice(userId);
          return Response.json(await getPlaytimeSettings(userId));
        },
      ),
    },
  },
});
