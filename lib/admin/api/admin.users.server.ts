import { pageSize } from '@/lib/pagination';
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { defineHandler } from '@/lib/api/handler.server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { adminUserUpdateSchema } from '@/lib/admin/schemas';
import { logAdminAction } from '@/lib/admin-audit.server';
import { activeStrikeWhere } from '@/lib/moderation/standing.server';
import { activeRestrictionWhere } from '@/lib/moderation/restrictions.server';

export const route = apiRoute('/api/admin/users', {
  GET: defineHandler({ auth: 'admin' }, async ({ request }) => {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('q');

    const cursor = searchParams.get('cursor');
    const limit = pageSize(searchParams.get('limit'), 50, 100);

    // Bot accounts are ordinary `user` rows created by the RMHark bot-worker
    // (lib/rmhark-ai/bot-worker.server.ts, in the jobs worker).
    // They're indistinguishable from people in a flat list, so let the
    // dashboard narrow to one population or the other.
    const accounts = searchParams.get('accounts');

    const whereClause: Prisma.UserWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { username: { contains: search, mode: 'insensitive' as const } },
              { handle: { contains: search, mode: 'insensitive' as const } },
              { email: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(accounts === 'bots' ? { isBot: true } : {}),
      ...(accounts === 'people' ? { isBot: false } : {}),
    };

    if (cursor) {
      const cursorUser = await prisma.user.findUnique({
        where: { id: cursor },
        select: { createdAt: true },
      });

      if (cursorUser) {
        // Include the id tie-breaker so users created in the same batch are not skipped.
        whereClause.AND = [
          {
            OR: [
              { createdAt: { lt: cursorUser.createdAt } },
              { createdAt: cursorUser.createdAt, id: { lt: cursor } },
            ],
          },
        ];
      }
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        name: true,
        username: true,
        handle: true,
        email: true,
        image: true,
        isAdmin: true,
        isVerified: true,
        isBot: true,
        createdAt: true,
        bannedUntil: true,
        profile: { select: { coins: true } },
        _count: {
          select: {
            userBuilds: true,
            rmharks: true,
          },
        },
      },
      take: limit + 1,
    });

    const hasMore = users.length > limit;
    const page = users.slice(0, limit);

    // Strikes and feature timeouts currently counting against each user on
    // this page, so the table shows a user's standing without a click.
    const ids = page.map((u) => u.id);
    const now = new Date();
    const [strikeCounts, restrictionCounts] = ids.length
      ? await Promise.all([
          prisma.userStrike.groupBy({
            by: ['userId'],
            // The one active-strike rule, widened from one user to the page.
            where: { ...activeStrikeWhere('', now), userId: { in: ids } },
            _count: { _all: true },
          }),
          prisma.featureRestriction.groupBy({
            by: ['userId'],
            where: { ...activeRestrictionWhere('', now), userId: { in: ids } },
            _count: { _all: true },
          }),
        ])
      : [[], []];
    const strikesBy = new Map(strikeCounts.map((r) => [r.userId, r._count._all]));
    const restrictionsBy = new Map(restrictionCounts.map((r) => [r.userId, r._count._all]));
    const items = page.map((u) => ({
      ...u,
      activeStrikes: strikesBy.get(u.id) ?? 0,
      activeRestrictions: restrictionsBy.get(u.id) ?? 0,
      banned: !!u.bannedUntil && u.bannedUntil.getTime() > now.getTime(),
    }));

    return Response.json({
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    });
  }),
  PATCH: implement(
    C.updateAdminUserApi,
    {
      auth: 'admin',
      rateLimit: { policy: 'write', scope: 'user' },
      body: adminUserUpdateSchema,
    },
    async ({ body, session }) => {
      const { userId, isVerified, isAdmin, handle } = body;

      // Prevent editing oneself to remove admin
      if (userId === session.user.id && isAdmin === false) {
        return new Response('Cannot remove admin privileges from yourself', { status: 400 });
      }

      const targetUser = await prisma.user.findUnique({
        where: { id: userId },
        select: { isAdmin: true },
      });
      if (!targetUser) return Response.json({ error: 'User not found' }, { status: 404 });

      const updateData: Prisma.UserUpdateInput = {};
      if (typeof isVerified === 'boolean') updateData.isVerified = isVerified;
      if (typeof isAdmin === 'boolean') updateData.isAdmin = isAdmin;

      // Admin handle change (no cooldown, but must be valid and unique)
      if (typeof handle === 'string') {
        // Prevent admins from changing other admins' handles
        if (targetUser.isAdmin && userId !== session.user.id) {
          return new Response("Cannot change another admin's handle", { status: 403 });
        }

        const existing = await prisma.user.findUnique({
          where: { handle },
          select: { id: true },
        });
        if (existing && existing.id !== userId) {
          return Response.json({ error: 'This handle is already taken' }, { status: 409 });
        }

        updateData.handle = handle;
        updateData.handleChangedAt = new Date();
      }

      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          name: true,
          username: true,
          handle: true,
          isVerified: true,
          isAdmin: true,
        },
      });

      await logAdminAction(session.user.id, 'user.update', {
        targetType: 'User',
        targetId: userId,
        detail: Object.keys(updateData).join(',') || 'none',
      });

      return Response.json(updatedUser);
    },
  ),
});
