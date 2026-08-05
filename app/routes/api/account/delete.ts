/**
 * POST /api/account/delete — self-service account deletion (GDPR right to erasure).
 *
 * Rather than a hard row delete (which risks foreign-key failures across the
 * ~250-model schema), erasure anonymises the row in place: credentials are
 * destroyed, private data is removed and the profile is scrubbed, leaving any
 * authored content attributed to an anonymous "Deleted user".
 *
 * That erasure is now DEFERRED by a 30-day grace period (B12). It used to run
 * inline and irreversibly, which meant a deletion made in anger at 2am had no
 * path back and no prompt to export first. The account is signed out and hidden
 * straight away; `anonymizeAccount()` runs from the nightly sweep, and signing
 * back in cancels it.
 *
 * Requires the user to type their own handle/username to confirm.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { deleteObject } from '@/lib/storage/s3.server';
import { scheduleDeletion, DELETION_GRACE_DAYS } from '@/lib/account/deletion.server';
import { sendEmail } from '@/lib/email/send.server';
import { SITE_URL } from '@/lib/seo';

const schema = z.object({ confirm: z.string().min(1).max(120) });

export const Route = createFileRoute('/api/account/delete')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: {
            limit: 5,
            windowMs: 60 * 60_000,
            prefix: 'account-delete',
            message: 'Too many attempts. Please wait and try again.',
          },
          body: schema,
          allowEmptyBody: true,
        },
        async ({ session, body }) => {
          const userId = session.user.id;
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { handle: true, username: true, email: true },
          });
          const email = user?.email ?? null;
          if (!user) {
            return Response.json({ error: 'Account not found' }, { status: 404 });
          }

          // Confirmation must match the user's own handle/username (or email).
          const confirm = body.confirm.trim().toLowerCase().replace(/^@/, '');
          const expected = [user.handle, user.username, user.email]
            .filter(Boolean)
            .map((v) => v!.toLowerCase());
          if (!expected.includes(confirm)) {
            return Response.json(
              { error: 'Confirmation does not match your account name.' },
              { status: 400 },
            );
          }

          // Resume files are private objects rather than public media. Remove
          // every object before dropping its database ownership record so a
          // transient storage failure can be retried safely.
          const resumeObjects = await prisma.ladderResumeVersion.findMany({
            where: { userId },
            select: { storageKey: true },
          });
          await Promise.all(resumeObjects.map(({ storageKey }) => deleteObject(storageKey)));

          // Schedule rather than erase (B12). The account is signed out and
          // hidden immediately, but the anonymisation runs 30 days later, so a
          // deletion made in anger at 2am is recoverable — by signing back in,
          // which is the only cancel flow users reliably find.
          //
          // The erasure itself lives in `anonymizeAccount()`, which the nightly
          // sweep also calls, so the immediate and deferred paths cannot drift.
          const scheduledAt = await scheduleDeletion(userId);

          // The address is read BEFORE scheduling (which nulls it), so the
          // notice can still be delivered. A failed send must not fail the
          // deletion — the user asked for this and the schedule is written.
          if (email) {
            const on = scheduledAt.toISOString().slice(0, 10);
            await sendEmail({
              to: email,
              subject: 'Your RMH Studios account is scheduled for deletion',
              html:
                `<p>Your account is scheduled for permanent deletion on <strong>${on}</strong>.</p>` +
                `<p>Changed your mind? <a href="${SITE_URL}/login">Sign back in</a> any time before ` +
                `then and the deletion is cancelled automatically.</p>` +
                `<p>After that date your profile is anonymised and cannot be recovered.</p>`,
              text:
                `Your account is scheduled for permanent deletion on ${on}.\n\n` +
                `Changed your mind? Sign back in at ${SITE_URL}/login any time before then ` +
                `and the deletion is cancelled automatically.\n\n` +
                `After that date your profile is anonymised and cannot be recovered.`,
            }).catch((err) => {
              console.error('[account] deletion notice failed:', err);
            });
          }

          return Response.json({ success: true, scheduledAt, graceDays: DELETION_GRACE_DAYS });
        },
      ),
    },
  },
});
