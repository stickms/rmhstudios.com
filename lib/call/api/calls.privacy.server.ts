/**
 * /api/calls/privacy — who may ring this account.
 *
 * The setting is enforced in the signalling handler, never here and never on
 * the caller's client; this route only reads and writes the preference.
 */
import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/call/calls.contract';
import { prisma } from '@/lib/prisma.server';
import { invalidateNotificationPrefs } from '@/lib/notifications.server';
import { CALL_PRIVACY_VALUES } from '@/lib/call/state';
import { getCallPrivacy } from '@/lib/settings/prefs.server';

export const route = apiRoute('/api/calls/privacy', {
  GET: implement(C.getCallPrivacyApi, { rateLimit: 'read' }, async ({ userId }) =>
    Response.json(await getCallPrivacy(userId)),
  ),
  PUT: implement(
    C.setCallPrivacyApi,
    {
      rateLimit: 'write',
      body: z.object({
        callPrivacy: z.enum(CALL_PRIVACY_VALUES as unknown as [string, ...string[]]),
      }),
    },
    async ({ userId, body }) => {
      await prisma.notificationPreference.upsert({
        where: { userId },
        create: { userId, callPrivacy: body.callPrivacy },
        update: { callPrivacy: body.callPrivacy },
      });
      invalidateNotificationPrefs(userId);
      return Response.json({ callPrivacy: body.callPrivacy });
    },
  ),
});
