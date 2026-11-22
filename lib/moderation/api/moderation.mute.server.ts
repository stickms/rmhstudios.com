import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { invalidateHiddenAuthors } from '@/lib/moderation.server';
import { toggleAction } from '@/lib/moderation/blocked-muted-schema';
import { ACCOUNT_MUTE_DURATIONS, activeMuteWhere, isMuteActive, muteExpiresAt } from '@/lib/moderation/mute-expiry';
import { z } from 'zod';

/**
 * POST /api/moderation/mute — toggle a mute on another user. Muting hides their
 * content from your feed without unfollowing them or notifying them.
 * An explicit `mute` boolean (the settings list, s05-14) says which way to go; absent flips the current state.
 * GET — list the ids the current user has muted.
 */
const muteSchema = z.object({
  targetUserId: z.string().min(1).max(64),
  mute: z.boolean().optional(),
  /** s10-10: absent = until the member unmutes; on an existing mute it changes the end ("Extend"). */
  duration: z.enum(ACCOUNT_MUTE_DURATIONS).optional(),
});

export const route = apiRoute('/api/moderation/mute', {
  GET: defineHandler({}, async ({ session }) => {
    const mutes = await prisma.userMute.findMany({
      where: { muterId: session.user.id, ...activeMuteWhere(new Date()) },
      select: { mutedId: true },
      orderBy: { createdAt: 'desc' },
    });
    return Response.json({ muted: mutes.map((m) => m.mutedId) });
  }),
  POST: defineHandler(
    {
      rateLimit: { limit: 30, windowMs: 60_000, prefix: 'moderation-mute' },
      body: muteSchema,
      allowEmptyBody: true,
    },
    async ({ session, body }) => {
      const muterId = session.user.id;
      const mutedId = body.targetUserId;
      if (muterId === mutedId) {
        return Response.json({ error: 'You cannot mute yourself' }, { status: 400 });
      }

      const existing = await prisma.userMute.findUnique({
        where: { muterId_mutedId: { muterId, mutedId } },
      });
      // An expired row is absent: it never counts as "muted", the job only tidies it away.
      const now = new Date();
      const active = existing !== null && isMuteActive(existing.expiresAt, now);

      // A duration is an intent to be muted for that long: it mutes, or changes the end of a mute already in force.
      const wantMute = body.mute ?? (body.duration !== undefined ? true : undefined);
      // Unmuting removes the row whatever its state (a lapsed one is simply tidied away).
      const action = toggleAction(active, wantMute);
      if (action === 'delete' || wantMute === false) {
        // deleteMany: a concurrent unmute may already have removed the row, which is not an error.
        if (existing) await prisma.userMute.deleteMany({ where: { id: existing.id } });
        if (existing) invalidateHiddenAuthors(muterId);
        return Response.json({ success: true, muted: false, expiresAt: null });
      }
      if (action === 'none' && body.duration === undefined) {
        return Response.json({
          success: true,
          muted: active,
          expiresAt: active ? (existing?.expiresAt?.toISOString() ?? null) : null,
        });
      }

      // Without a duration, a mute that is already in force keeps its end; a new (or lapsed) one lasts until undone.
      const expiresAt =
        body.duration !== undefined ? muteExpiresAt(body.duration, now) : active ? (existing?.expiresAt ?? null) : null;
      // `createdAt` restarts for a lapsed mute so the list's "Muted <date>" is honest; an extended one keeps its date.
      await prisma.userMute.upsert({
        where: { muterId_mutedId: { muterId, mutedId } },
        create: { muterId, mutedId, expiresAt },
        update: active ? { expiresAt } : { expiresAt, createdAt: now },
      });
      // The muter's hidden-author set changed — drop it so the mute takes
      // effect on their next feed read instead of after the TTL.
      invalidateHiddenAuthors(muterId);
      return Response.json({ success: true, muted: true, expiresAt: expiresAt?.toISOString() ?? null });
    },
  ),
});
