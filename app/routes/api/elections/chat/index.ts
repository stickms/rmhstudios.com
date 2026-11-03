import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { parseDay } from '@/lib/elections/calendar';
import { sanitizeChatText } from '@/lib/elections/chat';
import { deleteChatMessage, postChatMessage } from '@/lib/elections/chat.server';

const postBody = z.object({
  text: z.string().min(1).max(1000),
  /** The election (year or date) — the room. */
  cycle: z.string().max(10),
});

const deleteQuery = z.object({ cycle: z.string().max(10), id: z.string().uuid() });

const REASONS = {
  empty: 'Say something first.',
  'too-long': 'Keep it under 280 characters.',
  links: 'No links in election chat — it keeps scams and fake results sites out.',
} as const;

/** POST /api/elections/chat — say something in the live room. DELETE (admin) removes a message. */
export const Route = createFileRoute('/api/elections/chat/')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          // Signed-in only, and slow enough to read: 8 messages / 20s per account.
          rateLimit: { limit: 8, windowMs: 20_000, prefix: 'elections:chat' },
          body: postBody,
          label: 'elections.chat.post',
        },
        async ({ userId, body }) => {
          const cycle = parseDay(body.cycle);
          if (!cycle) return Response.json({ error: 'Unknown election' }, { status: 400 });
          const clean = sanitizeChatText(body.text);
          if (!clean.ok) return Response.json({ error: REASONS[clean.reason] }, { status: 422 });

          const row = await prisma.user.findUnique({
            where: { id: userId },
            select: userDisplaySelect,
          });
          if (!row) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const u = resolveUser(row);

          const msg = postChatMessage(
            cycle.date,
            {
              userId,
              name: (u.name ?? u.username ?? 'Member').slice(0, 40),
              handle: u.handle ?? null,
              image: u.image ?? null,
            },
            clean.text,
          );
          return Response.json({ id: msg.id });
        },
      ),
      DELETE: defineHandler(
        { auth: 'admin', rateLimit: 'write', query: deleteQuery, label: 'elections.chat.delete' },
        async ({ query }) => {
          const cycle = parseDay(query.cycle);
          if (!cycle) return Response.json({ error: 'Unknown election' }, { status: 400 });
          deleteChatMessage(cycle.date, query.id);
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
