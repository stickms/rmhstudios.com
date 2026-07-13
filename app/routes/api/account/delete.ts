/**
 * POST /api/account/delete — self-service account deletion (GDPR right to erasure).
 *
 * Rather than a hard row delete (which risks foreign-key failures across the
 * ~199-model schema), this performs an irreversible erasure:
 *  - deletes all authentication credentials (sessions, OAuth accounts, passkeys,
 *    push subscriptions) so the account can never be signed into again, and
 *  - scrubs personal data from the profile (name, email, handle, avatar, bio, …),
 *    leaving any authored content attributed to an anonymous "Deleted user".
 *
 * Requires the user to type their own handle/username to confirm.
 */

import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { deleteObject } from '@/lib/storage/s3.server';

const schema = z.object({ confirm: z.string().min(1).max(120) });

// Sentinel far-future ban keeps the (now credential-less) account locked as
// defense-in-depth against any lingering session.
const LOCK_UNTIL = new Date('9999-12-31T00:00:00.000Z');

export const Route = createFileRoute('/api/account/delete')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 5,
            windowMs: 60 * 60_000,
            prefix: 'account-delete',
          });
          if (!allowed) {
            return Response.json(
              { error: 'Too many attempts. Please wait and try again.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
          }

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }

          const userId = session.user.id;
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { handle: true, username: true, email: true },
          });
          if (!user) {
            return Response.json({ error: 'Account not found' }, { status: 404 });
          }

          // Confirmation must match the user's own handle/username (or email).
          const confirm = parsed.data.confirm.trim().toLowerCase().replace(/^@/, '');
          const expected = [user.handle, user.username, user.email]
            .filter(Boolean)
            .map((v) => v!.toLowerCase());
          if (!expected.includes(confirm)) {
            return Response.json(
              { error: 'Confirmation does not match your account name.' },
              { status: 400 }
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

          await prisma.$transaction([
            // 1. Destroy every way to authenticate as this account.
            prisma.session.deleteMany({ where: { userId } }),
            prisma.account.deleteMany({ where: { userId } }),
            prisma.passkey.deleteMany({ where: { userId } }),
            prisma.pushSubscription.deleteMany({ where: { userId } }),
            // 2. Remove all private RMHLadder data. Child resume versions,
            // reviews, matches, AI tasks, deliveries, and application events
            // cascade from their owning rows.
            prisma.ladderAlertEvent.deleteMany({ where: { userId } }),
            prisma.ladderAlert.deleteMany({ where: { userId } }),
            prisma.ladderProductEvent.deleteMany({ where: { userId } }),
            prisma.ladderSavedSearch.deleteMany({ where: { userId } }),
            prisma.ladderApplication.deleteMany({ where: { userId } }),
            prisma.ladderJobAction.deleteMany({ where: { userId } }),
            prisma.ladderWatchlistEntry.deleteMany({ where: { userId } }),
            prisma.ladderKeyword.deleteMany({ where: { userId } }),
            prisma.ladderUserPrefs.deleteMany({ where: { userId } }),
            prisma.ladderResume.deleteMany({ where: { userId } }),
            // 3. Scrub PII from the profile.
            prisma.userProfile.updateMany({
              where: { userId },
              data: {
                displayName: null,
                bio: null,
                location: null,
                website: null,
                customImage: null,
                profileSongTitle: null,
                profileSongArtist: null,
                profileSongSpotifyId: null,
                profileSongPreviewUrl: null,
                profileSongAlbumArt: null,
              },
            }),
            // 4. Anonymize + lock the user record.
            prisma.user.update({
              where: { id: userId },
              data: {
                name: 'Deleted user',
                email: null,
                emailVerified: false,
                username: null,
                handle: null,
                image: null,
                password: null,
                referralCode: null,
                botPersona: null,
                bannedUntil: LOCK_UNTIL,
                banReason: 'account_deleted',
              },
            }),
          ]);

          return Response.json({ success: true });
        } catch (error) {
          console.error('Account deletion error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
