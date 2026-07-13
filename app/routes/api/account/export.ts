/**
 * GET /api/account/export — GDPR/CCPA "download my data" (DSAR).
 *
 * Streams the signed-in user's own data back as a JSON file. Read-only: it
 * aggregates the user's records across the main tables and returns them as a
 * downloadable attachment. Sensitive auth material (password hash, session
 * tokens, Stripe ids) is intentionally excluded.
 */

import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// Bound each collection so a power user's export can't blow up memory.
const CAP = 10_000;

export const Route = createFileRoute('/api/account/export')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          // Exports are heavy; keep them infrequent per user/IP.
          const { allowed, retryAfter } = rateLimit(getClientIp(request), {
            limit: 3,
            windowMs: 10 * 60_000,
            prefix: 'account-export',
          });
          if (!allowed) {
            return Response.json(
              { error: 'You can export your data a few times per hour. Please wait.' },
              { status: 429, headers: { 'Retry-After': String(retryAfter) } }
            );
          }

          const userId = session.user.id;

          const [
            user,
            profile,
            posts,
            comments,
            following,
            followers,
            coinsSent,
            coinsReceived,
            notifications,
            bookmarks,
            achievements,
            blocks,
            mutes,
            sessions,
            ladder,
          ] = await Promise.all([
            prisma.user.findUnique({
              where: { id: userId },
              // Explicit select: omit password hash + Stripe customer id.
              select: {
                id: true,
                name: true,
                username: true,
                handle: true,
                email: true,
                emailVerified: true,
                image: true,
                isVerified: true,
                doctrineTier: true,
                referralCode: true,
                createdAt: true,
                updatedAt: true,
              },
            }),
            prisma.userProfile.findUnique({ where: { userId } }).catch(() => null),
            prisma.rMHark.findMany({ where: { userId }, take: CAP, orderBy: { createdAt: 'desc' } }),
            prisma.rMHarkComment.findMany({ where: { userId }, take: CAP, orderBy: { createdAt: 'desc' } }),
            prisma.follow.findMany({ where: { followerId: userId }, take: CAP }),
            prisma.follow.findMany({ where: { followingId: userId }, take: CAP }),
            prisma.coinTransaction.findMany({ where: { senderId: userId }, take: CAP, orderBy: { createdAt: 'desc' } }),
            prisma.coinTransaction.findMany({ where: { recipientId: userId }, take: CAP, orderBy: { createdAt: 'desc' } }),
            prisma.notification.findMany({ where: { userId }, take: CAP, orderBy: { createdAt: 'desc' } }),
            prisma.rMHarkBookmark.findMany({ where: { userId }, take: CAP }),
            prisma.userAchievement.findMany({ where: { userId }, take: CAP }),
            prisma.userBlock.findMany({ where: { blockerId: userId }, take: CAP }),
            prisma.userMute.findMany({ where: { muterId: userId }, take: CAP }),
            prisma.session.findMany({
              where: { userId },
              select: {
                id: true,
                ipAddress: true,
                userAgent: true,
                createdAt: true,
                updatedAt: true,
                expiresAt: true,
              },
            }),
            Promise.all([
              prisma.ladderUserPrefs.findUnique({ where: { userId } }),
              prisma.ladderKeyword.findMany({ where: { userId }, take: CAP }),
              prisma.ladderWatchlistEntry.findMany({ where: { userId }, take: CAP }),
              prisma.ladderJobAction.findMany({ where: { userId }, take: CAP }),
              prisma.ladderApplication.findMany({
                where: { userId },
                take: CAP,
                include: { events: { orderBy: { createdAt: 'asc' }, take: CAP } },
              }),
              prisma.ladderSavedSearch.findMany({ where: { userId }, take: CAP }),
              prisma.ladderResume.findMany({
                where: { userId },
                take: CAP,
                include: {
                  versions: {
                    orderBy: { versionNumber: 'asc' },
                    select: {
                      id: true,
                      versionNumber: true,
                      filename: true,
                      mimeType: true,
                      sizeBytes: true,
                      sha256: true,
                      parseStatus: true,
                      parseConfidence: true,
                      confirmedProfile: true,
                      confirmedAt: true,
                      createdAt: true,
                    },
                  },
                },
              }),
              prisma.ladderResumeReview.findMany({ where: { userId }, take: CAP, orderBy: { createdAt: 'desc' } }),
              prisma.ladderJobMatch.findMany({ where: { userId }, take: CAP, orderBy: { score: 'desc' } }),
              prisma.ladderAlertEvent.findMany({ where: { userId }, take: CAP, orderBy: { createdAt: 'desc' } }),
            ]),
          ]);

          const [
            ladderPrefs,
            ladderKeywords,
            ladderWatchlist,
            ladderActions,
            ladderApplications,
            ladderSavedSearches,
            ladderResumes,
            ladderResumeReviews,
            ladderMatches,
            ladderAlerts,
          ] = ladder;

          const payload = {
            exportedAt: new Date().toISOString(),
            format: 'rmhstudios-data-export-v1',
            note: 'This file contains the personal data associated with your RMH Studios account. Authentication secrets (passwords, session tokens) are excluded.',
            account: user,
            profile,
            posts,
            comments,
            following,
            followers,
            coinTransactions: { sent: coinsSent, received: coinsReceived },
            notifications,
            bookmarks,
            achievements,
            moderation: { blocks, mutes },
            sessions,
            rmhLadder: {
              preferences: ladderPrefs,
              keywords: ladderKeywords,
              watchlist: ladderWatchlist,
              actions: ladderActions,
              applications: ladderApplications,
              savedSearches: ladderSavedSearches,
              resumes: ladderResumes,
              resumeReviews: ladderResumeReviews,
              matches: ladderMatches,
              alerts: ladderAlerts,
              note: 'Private resume binaries are available through the authenticated RMHLadder download endpoint and are not embedded in this JSON export.',
            },
          };

          const body = JSON.stringify(payload, null, 2);
          const stamp = new Date().toISOString().slice(0, 10);
          return new Response(body, {
            status: 200,
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Content-Disposition': `attachment; filename="rmhstudios-data-${stamp}.json"`,
              'Cache-Control': 'no-store',
            },
          });
        } catch (error) {
          console.error('Account export error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
