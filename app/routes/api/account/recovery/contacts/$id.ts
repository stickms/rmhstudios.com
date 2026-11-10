import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { confirmTrustedContactApi, removeTrustedContactApi } from '@/lib/recovery/recovery.contract';
import { notFound } from '@/lib/api/handler.server';
import {
  confirmTrustedContact,
  removeTrustedContact,
} from '@/lib/recovery/trusted-contacts.server';

/**
 * POST   /api/account/recovery/contacts/$id — the NOMINEE accepts.
 * DELETE /api/account/recovery/contacts/$id — either side removes it.
 *
 * Only the nominee can confirm: an account confirming its own contacts would
 * make the acceptance step decorative, and the quorum meaningless.
 */
export const Route = createFileRoute('/api/account/recovery/contacts/$id')({
  server: {
    handlers: {
      POST: implement(confirmTrustedContactApi, { rateLimit: 'write' }, async ({ userId, params }) => {
        const confirmed = await confirmTrustedContact(userId, params.id);
        if (!confirmed) return notFound('No pending trusted-contact request');
        return { ok: true as const };
      }),

      DELETE: implement(removeTrustedContactApi, { rateLimit: 'write' }, async ({ userId, params }) => {
        const removed = await removeTrustedContact(userId, params.id);
        if (!removed) return notFound('Trusted contact not found');
        return { ok: true as const };
      }),
    },
  },
});
