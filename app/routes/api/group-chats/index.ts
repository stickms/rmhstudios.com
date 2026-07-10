import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { listGroupChats } from '@/lib/group-chats.server';
import { z } from 'zod';

const createSchema = z.object({
  name: z.string().min(1).max(60),
  members: z.array(z.string().min(1).max(64)).min(1).max(50), // ids or handles
});

const MAX_GROUPS = 100;

/**
 * GET  /api/group-chats — the viewer's group chats (most recent first).
 * POST /api/group-chats — create a group with the chosen members.
 */
export const Route = createFileRoute('/api/group-chats/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        if (!session) return Response.json({ groups: [], signedIn: false });
        return Response.json(await listGroupChats(session.user.id));
      },

      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 15, windowMs: 60_000, prefix: 'group-create' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = createSchema.safeParse(body);
          if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

          const count = await prisma.groupChatMember.count({ where: { userId } });
          if (count >= MAX_GROUPS) return Response.json({ error: 'You are in too many groups' }, { status: 400 });

          // Resolve members (by id or handle), excluding the creator (added below).
          const users = await prisma.user.findMany({
            where: { OR: parsed.data.members.flatMap((m) => [{ id: m }, { handle: m }]) },
            select: { id: true },
          });
          const memberIds = new Set(users.map((u) => u.id));
          memberIds.delete(userId);
          if (memberIds.size === 0) return Response.json({ error: 'Add at least one other member' }, { status: 400 });

          const group = await prisma.groupChat.create({
            data: {
              name: parsed.data.name.trim(),
              ownerId: userId,
              members: {
                create: [{ userId }, ...[...memberIds].map((id) => ({ userId: id }))],
              },
            },
            select: { id: true },
          });

          return Response.json({ success: true, id: group.id }, { status: 201 });
        } catch (error) {
          console.error('Group create error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
