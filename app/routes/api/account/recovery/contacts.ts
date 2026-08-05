import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { HANDLE_MAX_LENGTH } from '@/lib/handle';
import {
  listTrustedContacts,
  listTrustedFor,
  nominateTrustedContact,
} from '@/lib/recovery/trusted-contacts.server';

/**
 * GET  /api/account/recovery/contacts — both sides of the relationship: who I
 *                                       nominated, and who nominated me.
 * POST /api/account/recovery/contacts — nominate someone by handle.
 */
const nominateSchema = z.object({
  handle: z
    .string()
    .trim()
    .min(1)
    .max(HANDLE_MAX_LENGTH + 1),
});

export const Route = createFileRoute('/api/account/recovery/contacts')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const [contacts, trustedFor] = await Promise.all([
          listTrustedContacts(userId),
          listTrustedFor(userId),
        ]);
        return Response.json({ contacts, trustedFor });
      }),

      POST: defineHandler(
        { rateLimit: 'write', body: nominateSchema, verboseValidationErrors: true },
        async ({ userId, body }) => {
          const result = await nominateTrustedContact(userId, body.handle.replace(/^@/, ''));
          if (!result.ok) {
            return Response.json(
              { error: result.message, reason: result.reason },
              { status: result.reason === 'unknown-account' ? 404 : 400 },
            );
          }
          return Response.json({ contact: result.contact });
        },
      ),
    },
  },
});
