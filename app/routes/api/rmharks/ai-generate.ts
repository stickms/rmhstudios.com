/**
 * POST /api/rmharks/ai-generate — draft a post or reply with DeepSeek.
 *
 * Backs the "✨ generate" buttons in the composer and reply boxes. Returns
 * `{ content }`; the client drops the text into the textarea so the user can
 * review/edit before posting. Nothing is persisted here.
 *
 * Body:
 *   { mode: 'post', draft?: string }
 *   { mode: 'reply', rmharkId: string, parentId?: string, draft?: string }
 *
 * `draft` is whatever the user has already typed — it's folded into the prompt
 * so the model builds on it. For replies, the server walks the parent chain so
 * the draft lands in the real conversation (post + ancestor comments).
 *
 * Auth required (only signed-in users can spend model calls); rate-limited per
 * user to keep the paid API in check.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { canReadThread } from '@/lib/feed/audience.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import {
  generatePost,
  generateReply,
  generateAnnouncementTitle,
  generateAnnouncementBody,
  isRmharkAIConfigured,
} from '@/lib/rmhark-ai/generate.server';

// Cap the draft we echo into the prompt (the model output is capped separately).
const draftField = z.string().max(1000).optional();

const bodySchema = z.union([
  z.object({
    mode: z.literal('post'),
    draft: draftField,
  }),
  z.object({
    mode: z.literal('reply'),
    rmharkId: z.string().min(1),
    parentId: z.string().min(1).optional(),
    draft: draftField,
  }),
  z.object({
    mode: z.literal('announcement-title'),
    title: draftField,
    body: draftField,
  }),
  z.object({
    mode: z.literal('announcement-body'),
    title: draftField,
    body: draftField,
  }),
]);

/**
 * Walk up the comment parent chain, returning ancestor contents oldest → target.
 * Only comments on `rmharkId` count: the client sends both ids and nothing else
 * ties them, so a parent from another (possibly unreadable) thread is ignored.
 */
async function buildCommentChain(parentId: string, rmharkId: string): Promise<string[]> {
  const chain: string[] = [];
  let currentId: string | null = parentId;
  for (let depth = 0; currentId && depth < 6; depth++) {
    const node: { content: string; parentId: string | null; rmheetId: string } | null =
      await prisma.rMHarkComment.findUnique({
        where: { id: currentId },
        select: { content: true, parentId: true, rmheetId: true },
      });
    if (!node || node.rmheetId !== rmharkId) break;
    chain.unshift(node.content);
    currentId = node.parentId;
  }
  return chain;
}

export const Route = createFileRoute('/api/rmharks/ai-generate')({
  server: {
    handlers: {
      POST: defineHandler({ body: bodySchema }, async ({ request, session, userId, body }) => {
        if (!isRmharkAIConfigured()) {
          return Response.json(
            { error: 'AI drafting is not available right now.' },
            { status: 503 },
          );
        }

        // Per-user cap (fall back to IP). Model calls are paid + a little slow.
        const ip = getClientIp(request);
        const { allowed, retryAfter } = rateLimit(`${session.user.id}:${ip}`, {
          limit: 12,
          windowMs: 60_000,
          prefix: 'rmhark-ai-generate',
        });
        if (!allowed) {
          return Response.json(
            { error: 'Slow down a moment before generating again.' },
            { status: 429, headers: { 'Retry-After': String(retryAfter) } },
          );
        }

        const data = body;

        let content: string;
        if (data.mode === 'post') {
          content = await generatePost({ draft: data.draft });
        } else if (data.mode === 'announcement-title' || data.mode === 'announcement-body') {
          // Announcement drafting is an admin-only tool (announcements
          // themselves are admin-gated), so don't let non-admins spend calls.
          if (!(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }
          content =
            data.mode === 'announcement-title'
              ? await generateAnnouncementTitle({ title: data.title, body: data.body })
              : await generateAnnouncementBody({ title: data.title, body: data.body });
        } else {
          // Pull the post (plus the original it quotes, if it's a repost) and
          // the ancestor comments server-side so we never trust client-supplied
          // context. Only text this viewer may read reaches the model: the
          // thread's audience rule (canReadThread), and a priced post's body
          // only for its author or someone who unlocked it.
          const readable = {
            userId: true,
            audience: true,
            deletedAt: true,
            communityId: true,
            content: true,
            unlockPrice: true,
            unlocks: { where: { userId }, select: { id: true } },
          } as const;
          const post = await prisma.rMHark.findUnique({
            where: { id: data.rmharkId },
            select: { ...readable, original: { select: readable } },
          });
          if (!post || !(await canReadThread(post, userId))) {
            return Response.json({ error: 'Post not found' }, { status: 404 });
          }
          const unlocked = (p: { userId: string; unlockPrice: number | null; unlocks: unknown[] }) =>
            !p.unlockPrice || p.unlockPrice <= 0 || p.userId === userId || p.unlocks.length > 0;
          if (!unlocked(post)) {
            return Response.json({ error: 'Unlock this post to draft a reply.' }, { status: 403 });
          }
          const original =
            post.original && unlocked(post.original) && (await canReadThread(post.original, userId))
              ? post.original
              : null;
          const thread = data.parentId ? await buildCommentChain(data.parentId, data.rmharkId) : [];
          content = await generateReply({
            postContent: post.content,
            quotedPostContent: original?.content || undefined,
            thread,
            draft: data.draft,
          });
        }

        if (!content.trim()) {
          return Response.json({ error: 'Could not generate text. Try again.' }, { status: 502 });
        }

        return Response.json({ content });
      }),
    },
  },
});
