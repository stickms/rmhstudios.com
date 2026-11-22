/**
 * GET /api/account/export — GDPR/CCPA "download my data" (DSAR).
 *
 * Streams the signed-in user's own data back as a JSON file. Read-only: it
 * aggregates the user's records across the main tables and returns them as a
 * downloadable attachment. Sensitive auth material (password hash, session
 * tokens, Stripe ids) is intentionally excluded.
 */

import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { exportVibeData } from '@/lib/rmhvibe/account-data.server';
import { exportMusicData } from '@/lib/rmhmusic/learn/account-data.server';
import { cardListingsForExport } from '@/lib/listings/listings.server';
import { exportStudyReminder } from '@/lib/study/reminders.server';
import { exportStudyStatsData } from '@/lib/study/stats.server';
import { exportStudyTestData } from '@/lib/study/tests.server';
import { exportLessonProgress } from '@/lib/rmhtype/lessons.server';
import { exportSecurityEvents } from '@/lib/auth/security-log.server';
import { exportReadingSubscriptions } from '@/lib/reading/subscriptions.server';
import { exportCloudSaveSnapshots } from '@/lib/game-saves/snapshots.server';
import { exportMyReports } from '@/lib/moderation/my-reports.server';
import { exportScheduledMessages } from '@/lib/messages/scheduled.server';
import { exportLadderOffers } from '@/lib/rmhladder/offers.server';
import { exportWatchPartyRsvps } from '@/lib/rmhtube/parties.server';
import { exportGameFollows } from '@/lib/arcade/updates.server';
import { exportEventRsvps } from '@/lib/events/waitlist.server';
import { exportReplays } from '@/lib/replays.server';
import { exportReaderMarks } from '@/lib/library/reader-sync.server';
import { exportRmhboxPresets } from '@/lib/rmhbox/presets.server';
import { exportMessageRequests } from '@/lib/messages/requests.server';
import { exportRepostMutes } from '@/lib/feed/repost-mutes.server';
import { exportEventCohosts } from '@/lib/events/cohosts.server';
import { exportBlocksMutes } from '@/lib/moderation/blocked-muted.server';
import { exportJamTeamMemberships } from '@/lib/competitive/jam-teams.server';
import { exportPersonalBests } from '@/lib/game/personal-bests.server';
import { exportSavedReplies } from '@/lib/messages/saved-replies.server';
import { exportStudioProjects } from '@/lib/studio/cloud-projects.server';
import { exportPostAlerts } from '@/lib/communities/post-alerts.server';
import { exportSprint06 } from '@/lib/account/export-sprint-06.server';
import { exportSprint07 } from '@/lib/account/export-sprint-07.server';
import { exportSprint08 } from '@/lib/account/export-sprint-08.server';
import { exportSprint09 } from '@/lib/account/export-sprint-09.server';

// Bound each collection so a power user's export can't blow up memory.
const CAP = 10_000;

export const route = apiRoute('/api/account/export', {
  GET: defineHandler(
    {
      rateLimit: {
        limit: 3,
        windowMs: 10 * 60_000,
        prefix: 'account-export',
        message: 'You can export your data a few times per hour. Please wait.',
      },
    },
    async ({ session }) => {
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
        memories,
        playLimits,
        gameAssists,
        gamePlaytime,
        gamePlaytimeDays,
        userCards,
        cardDrops,
        gameBadges,
        cardListings,
        cardTrades,
        gameThreads,
        gameThreadPosts,
        cardBuyOrders,
        gameCollectionItems,
        gameProfileShowcase,
        userGems,
        gemEntries,
        rmhMusic,
        vibes,
        sprint02,
        sprint03,
        sprint06,
        sprint07,
        sprint08,
        sprint09,
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
            playtimePrivacy: true,
            referralCode: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.userProfile.findUnique({ where: { userId } }).catch(() => null),
        prisma.rMHark.findMany({
          where: { userId },
          take: CAP,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.rMHarkComment.findMany({
          where: { userId },
          take: CAP,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.follow.findMany({ where: { followerId: userId }, take: CAP }),
        prisma.follow.findMany({ where: { followingId: userId }, take: CAP }),
        prisma.coinTransaction.findMany({
          where: { senderId: userId },
          take: CAP,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.coinTransaction.findMany({
          where: { recipientId: userId },
          take: CAP,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.notification.findMany({
          where: { userId },
          take: CAP,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.savedItem.findMany({ where: { userId, entityType: 'rmhark' }, take: CAP }),
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
          prisma.ladderAnswerBank.findUnique({ where: { userId } }),
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
          prisma.ladderResumeReview.findMany({
            where: { userId },
            take: CAP,
            orderBy: { createdAt: 'desc' },
          }),
          prisma.ladderJobMatch.findMany({
            where: { userId },
            take: CAP,
            orderBy: { score: 'desc' },
          }),
          prisma.ladderAlertEvent.findMany({
            where: { userId },
            take: CAP,
            orderBy: { createdAt: 'desc' },
          }),
        ]),

        // Member memory (M3). A store of facts the site asserts about
        // somebody is only defensible if they can read all of it, which
        // means it belongs in the export as much as their posts do.
        prisma.memberMemory.findMany({
          where: { userId },
          take: CAP,
          select: {
            key: true,
            value: true,
            source: true,
            confirmedAt: true,
            expiresAt: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        // Responsible play (W8) and game assists (P7): settings somebody
        // set about themselves, so theirs to take with them.
        prisma.userPlayLimits.findUnique({ where: { userId } }),
        prisma.gameAssistPreference.findUnique({ where: { userId } }),
        // Time played per game and app, and per day: activity the library shows
        // to other members, so the person can read all of it.
        prisma.gamePlaytime.findMany({
          where: { userId },
          take: CAP,
          orderBy: { totalSeconds: 'desc' },
        }),
        prisma.gamePlaytimeDay.findMany({
          where: { userId },
          take: CAP,
          orderBy: { day: 'desc' },
        }),
        // Trading cards the person holds, how each dropped, and their badges.
        prisma.userCard.findMany({ where: { userId }, take: CAP }),
        prisma.cardDrop.findMany({ where: { userId }, take: CAP }),
        prisma.gameBadge.findMany({ where: { userId }, take: CAP }),
        // Card market listings as seller or buyer.
        cardListingsForExport(userId, CAP),
        // Card trade offers sent or received, with their items.
        prisma.cardTrade.findMany({
          where: { OR: [{ fromId: userId }, { toId: userId }] },
          take: CAP,
          orderBy: { createdAt: 'desc' },
          include: { items: true },
        }),
        // Community Hub discussions the person started or replied in.
        prisma.gameThread.findMany({
          where: { authorId: userId },
          take: CAP,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.gameThreadPost.findMany({
          where: { authorId: userId },
          take: CAP,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.cardBuyOrder.findMany({
          where: { buyerId: userId },
          take: CAP,
          orderBy: { createdAt: 'desc' },
        }),
        prisma.gameCollectionItem.findMany({ where: { userId }, take: CAP }),
        prisma.gameProfileShowcase.findUnique({ where: { userId } }),
        prisma.userGems.findUnique({ where: { userId } }),
        prisma.gemEntry.findMany({ where: { userId }, take: CAP, orderBy: { createdAt: 'desc' } }),
        // RMH Music: every learning table, Daily runs with their board verdicts included (Q4).
        exportMusicData(userId),
        // RMH Vibes: owned pages, the prompts on them, per-user vibe state and feed embeds.
        exportVibeData(userId),
        // Flashcards, typing, security, reading subscriptions, saves and
        // preferences: everything the person wrote, chose or did there.
        Promise.all([
          prisma.flashcardDeck.findMany({
            where: { userId },
            take: CAP,
            orderBy: { createdAt: 'asc' },
            include: {
              // Authored cards only: the generated siblings are derived, and re-importing the
              // authored card regenerates them.
              cards: {
                where: { sourceId: null },
                orderBy: { position: 'asc' },
                select: {
                  id: true,
                  kind: true,
                  front: true,
                  back: true,
                  position: true,
                  externalId: true,
                  createdAt: true,
                },
              },
            },
          }),
          exportStudyStatsData(userId),
          exportStudyTestData(userId),
          exportStudyReminder(userId),
          exportLessonProgress(userId),
          prisma.rmhTypeDailyEntry.findMany({ where: { userId }, take: CAP, orderBy: { day: 'desc' } }),
          prisma.rmhStudyProfile.findUnique({ where: { userId } }),
          exportSecurityEvents(userId),
          exportReadingSubscriptions(userId),
          prisma.gameSave.findMany({ where: { userId }, take: CAP }),
          exportCloudSaveSnapshots(userId),
          prisma.keyboardPreference.findUnique({ where: { userId } }),
          prisma.achievementTrack.findMany({ where: { userId }, take: CAP }),
          // Only the person's own follow actions: events about who followed or
          // unfollowed THEM stay counts in Audience insights, never names.
          prisma.followEvent.findMany({
            where: { followerId: userId },
            take: CAP,
            orderBy: { id: 'desc' },
            select: { followingId: true, kind: true, createdAt: true },
          }),
        ]),
        // Sprint 03: reports the person made, messages they scheduled, offers
        // they recorded, watch parties they said they would join, games they follow.
        Promise.all([
          exportMyReports(userId),
          exportScheduledMessages(userId),
          exportLadderOffers(userId),
          exportWatchPartyRsvps(userId),
          exportGameFollows(userId),
          // Event answers, waitlist places included (s04-02).
          exportEventRsvps(userId),
          // Per-conversation notification choices, including muted post threads (s03-03).
          prisma.conversationPref.findMany({ where: { userId }, take: CAP }),
          // Sprint 04: replays they saved (metadata, not the input log), their synced library
          // places, bookmarks and notes, their RMHBox host presets, and message requests they
          // sent or received (who and when; the message itself is in the conversation).
          exportReplays(userId),
          exportReaderMarks(userId),
          exportRmhboxPresets(userId),
          exportMessageRequests(userId),
          // People whose reposts the member turned off (s05-07).
          exportRepostMutes(userId),
          // Co-host roles on events, invited and accepted (s05-05).
          exportEventCohosts(userId),
          // The history of each game's personal best (s05-04).
          exportPersonalBests(userId),
          // Private saved message replies (s05-13).
          exportSavedReplies(userId),
          // Game jam team invitations and credits (s05-15).
          exportJamTeamMemberships(userId),
          // Their own block and mute lists (s05-14).
          exportBlocksMutes(userId),
          // Communities they asked to be alerted for on every new post (s05-17).
          exportPostAlerts(userId),
          // RMH Studio projects saved to the account, with their project data (s05-06).
          exportStudioProjects(userId),
        ]),
        // The sprint 06 sections, each added under its own anchor (s06).
        exportSprint06(userId),
        // The sprint 07 sections, each added under its own anchor (s07).
        exportSprint07(userId),
        // The sprint 08 sections, each added under its own anchor (s08).
        exportSprint08(userId),
        // The sprint 09 sections, each added under its own anchor (s09).
        exportSprint09(userId),
      ]);

      const [
        flashcardDecks,
        flashcardReviews,
        flashcardTests,
        studyReminder,
        rmhTypeLessons,
        rmhTypeDaily,
        rmhStudyProfile,
        securityEvents,
        readingSubscriptions,
        gameSaves,
        gameSaveSnapshots,
        keyboardPreference,
        achievementTracks,
        followEvents,
      ] = sprint02;

      const [
        myReports,
        scheduledMessages,
        ladderOffers,
        watchPartyRsvps,
        gameFollows,
        eventRsvps,
        conversationPrefs,
        replays,
        readerMarks,
        rmhboxPresets,
        messageRequests,
        repostMutes,
        eventCohosts,
        personalBests,
        savedReplies,
        jamTeams,
        blocksMutes,
        postAlerts,
        studioProjects,
      ] = sprint03;

      const [
        ladderPrefs,
        ladderAnswerBank,
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
        // What the site remembers about you (M3), and the two sets of
        // limits you set on yourself (W8, P7).
        memory: memories,
        playLimits,
        gameAssists,
        gamePlaytime,
        gamePlaytimeDays,
        userCards,
        cardDrops,
        gameBadges,
        cardListings,
        cardTrades,
        gameThreads,
        gameThreadPosts,
        cardBuyOrders,
        gameCollectionItems,
        gameProfileShowcase,
        userGems,
        gemEntries,
        rmhMusic,
        vibes,
        flashcards: {
          decks: flashcardDecks,
          ...flashcardReviews,
          ...flashcardTests,
          reminder: studyReminder,
        },
        rmhType: { lessons: rmhTypeLessons, daily: rmhTypeDaily },
        rmhStudy: rmhStudyProfile
          ? { ...rmhStudyProfile, totalFocusTimeMs: Number(rmhStudyProfile.totalFocusTimeMs) }
          : null,
        securityEvents,
        readingSubscriptions,
        cloudSaves: { saves: gameSaves, snapshots: gameSaveSnapshots },
        keyboardPreference,
        achievementTracks,
        followEvents,
        reportsMade: myReports,
        scheduledMessages,
        watchPartyRsvps,
        gameFollows,
        eventRsvps,
        conversationPrefs,
        replays,
        libraryReaderMarks: readerMarks,
        rmhboxPresets,
        messageRequests,
        repostMutes,
        eventCohosts,
        personalBests,
        savedReplies,
        jamTeams,
        blocksMutes,
        postAlerts,
        studioProjects,
        sprint06,
        sprint07,
        sprint08,
        sprint09,
        rmhLadder: {
          preferences: ladderPrefs,
          // Salary expectations, work authorization and EEO answers — the
          // most sensitive rows RMHLadder holds, so they belong in the
          // export as much as in the delete.
          answerBank: ladderAnswerBank,
          keywords: ladderKeywords,
          watchlist: ladderWatchlist,
          actions: ladderActions,
          applications: ladderApplications,
          savedSearches: ladderSavedSearches,
          resumes: ladderResumes,
          resumeReviews: ladderResumeReviews,
          matches: ladderMatches,
          alerts: ladderAlerts,
          offers: ladderOffers,
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
    },
  ),
});
