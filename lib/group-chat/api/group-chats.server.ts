import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { GROUP_KIND } from '@/lib/chat/chat.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { listGroupChats } from '@/lib/group-chats.server';
import { refusedForGroup } from '@/lib/group-chat/manage.server';
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
export const route = apiRoute('/api/group-chats', {
  GET: defineHandler({ auth: 'optional' }, async ({ request, session }) => {
    if (!session) return Response.json({ groups: [], signedIn: false });
    // M1: `?folder=<id>` / `?filter=unread` for the folder tabs.
    const url = new URL(request.url);
    return Response.json(
      await listGroupChats(session.user.id, {
        folderId: url.searchParams.get('folder'),
        unreadOnly: url.searchParams.get('filter') === 'unread',
      }),
    );
  }),

  POST: defineHandler(
    { body: createSchema, allowEmptyBody: true, verboseValidationErrors: true },
    async ({ request, session, body }) => {
      const userId = session.user.id;

      const ip = getClientIp(request);
      const { allowed } = rateLimit(ip, {
        limit: 15,
        windowMs: 60_000,
        prefix: 'group-create',
      });
      if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

      const count = await prisma.chatMember.count({ where: { userId, chat: { kind: GROUP_KIND } } });
      if (count >= MAX_GROUPS)
        return Response.json({ ...refusalBody('GROUP_TOO_MANY') }, { status: 400 });

      // Resolve members (by id or handle), leaving out anyone in a block with the creator, banned accounts and
      // names that match nobody. The creator is added below. Refusals are counted, never explained.
      const vetted = await refusedForGroup(userId, body.members);
      const memberIds = new Set(vetted.allowed.map((u) => u.id));
      memberIds.delete(userId);
      if (memberIds.size === 0)
        return Response.json({ ...refusalBody('GROUP_NEEDS_MEMBER') }, { status: 400 });

      const group = await prisma.chat.create({
        data: {
          kind: GROUP_KIND,
          name: body.name.trim(),
          ownerId: userId,
          members: {
            create: [{ userId }, ...[...memberIds].map((id) => ({ userId: id }))],
          },
        },
        select: { id: true },
      });

      return Response.json({ success: true, id: group.id, refused: vetted.refused }, { status: 201 });
    },
  ),
});
