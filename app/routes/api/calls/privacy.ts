/**
 * /api/calls/privacy — who may ring this account.
 *
 * The setting is enforced in the signalling handler, never here and never on
 * the caller's client; this route only reads and writes the preference.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { CALL_PRIVACY_VALUES, isCallPrivacy } from '@/lib/call/state';

export const Route = createFileRoute('/api/calls/privacy')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const prefs = await prisma.notificationPreference.findUnique({
          where: { userId },
          select: { callPrivacy: true },
        });
        const value = prefs?.callPrivacy;
        return Response.json({ callPrivacy: isCallPrivacy(value) ? value : 'following' });
      }),
      PUT: defineHandler(
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
          return Response.json({ callPrivacy: body.callPrivacy });
        },
      ),
    },
  },
});
