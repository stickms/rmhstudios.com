/**
 * /api/calls/answer — how this account wants calls answered.
 *
 * Reads and writes the preference only. What a mode DOES is decided elsewhere:
 * the call hub (whether to ring) and `lib/call/auto-reply.server.ts` (whether,
 * and what, to send), each of which re-reads the stored value.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/call/calls.contract';
import { prisma } from '@/lib/prisma.server';
import { getCallAnswer } from '@/lib/settings/prefs.server';
import { invalidateNotificationPrefs } from '@/lib/notifications.server';
import { CALL_ANSWER_MODES, CALL_BUSY_NOTE_MAX, normalizeBusyNote } from '@/lib/call/answer';

export const Route = createFileRoute('/api/calls/answer')({
  server: {
    handlers: {
      GET: implement(C.getCallAnswerApi, { rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await getCallAnswer(userId)),
      ),

      PUT: implement(
        C.setCallAnswerApi,
        {
          rateLimit: 'write',
          body: z.object({
            mode: z.enum(CALL_ANSWER_MODES),
            // Bounded before it is normalised, so an oversized body is a 400
            // rather than a silently truncated save.
            note: z
              .string()
              .max(CALL_BUSY_NOTE_MAX * 4)
              .optional(),
          }),
        },
        async ({ userId, body }) => {
          const note = body.note === undefined ? undefined : normalizeBusyNote(body.note);
          const data = {
            callAnswerMode: body.mode,
            ...(note === undefined ? {} : { callBusyNote: note }),
          };
          await prisma.notificationPreference.upsert({
            where: { userId },
            create: { userId, ...data },
            update: data,
          });
          invalidateNotificationPrefs(userId);
          return Response.json({
            mode: body.mode,
            ...(note === undefined ? {} : { note: note ?? '' }),
          });
        },
      ),
    },
  },
});
