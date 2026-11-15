import { apiRoute } from '@/lib/api/route.server';
import { z } from 'zod';
import { implement } from '@/lib/api/implement.server';
import {
  listTrustedContactsApi,
  nominateTrustedContactApi,
} from '@/lib/recovery/recovery.contract';
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

export const route = apiRoute('/api/account/recovery/contacts', {
  GET: implement(listTrustedContactsApi, { rateLimit: 'read' }, async ({ userId }) => {
    const [contacts, trustedFor] = await Promise.all([
      listTrustedContacts(userId),
      listTrustedFor(userId),
    ]);
    return { contacts, trustedFor };
  }),

  POST: implement(
    nominateTrustedContactApi,
    { rateLimit: 'write', body: nominateSchema, verboseValidationErrors: true },
    async ({ userId, body }) => {
      const result = await nominateTrustedContact(userId, body.handle.replace(/^@/, ''));
      if (!result.ok) {
        return Response.json(
          { error: result.message, reason: result.reason },
          { status: result.reason === 'unknown-account' ? 404 : 400 },
        );
      }
      return { contact: result.contact };
    },
  ),
});
