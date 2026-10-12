/**
 * `/poll` in a DM (P04). Server-only.
 *
 * Group chats already have polls (`GroupMessage.pollQuestion` + `GroupPollVote`,
 * with their own vote route and renderer), so `/poll` in a group simply writes
 * those columns. A DM has no such columns; its poll is a `kind = 'poll'` message
 * with the question and options in `meta`, and votes in `DirectPollVote`.
 */

import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { type ChatAccess, publishChatUpdate } from '@/lib/chat-plus/access.server';
import { postChatMessage, type PostedMessage } from '@/lib/chat-plus/post.server';
import type { PollMeta, PollView } from '@/lib/chat-plus/types';

export const pollVoteSchema = z.object({
  messageId: z.string().min(1).max(40),
  optionIdx: z.number().int().min(0).max(5),
});

export async function createPoll(
  access: ChatAccess,
  poll: { question: string; options: string[] },
): Promise<PostedMessage> {
  const content = `📊 ${poll.question}`.slice(0, 2000);
  if (access.kind === 'group') {
    return postChatMessage(access, { senderId: access.viewerId, content, poll });
  }
  return postChatMessage(access, {
    senderId: access.viewerId,
    content,
    kind: 'poll',
    meta: {
      question: poll.question,
      options: poll.options,
    } satisfies PollMeta as unknown as Prisma.InputJsonValue,
    dmPoll: {
      question: poll.question,
      options: poll.options.map((text) => ({ text, votes: 0 })),
      totalVotes: 0,
      myVote: null,
    },
  });
}

function viewFor(meta: PollMeta, counts: number[], myVote: number | null): PollView {
  const options = meta.options.map((text, i) => ({ text, votes: counts[i] ?? 0 }));
  return {
    question: meta.question,
    options,
    totalVotes: options.reduce((n, o) => n + o.votes, 0),
    myVote,
  };
}

/** Tallies + the viewer's vote for every poll message in a page — two queries, once. */
export async function loadDmPolls(
  rows: { id: string; kind?: string | null; meta?: unknown }[],
  viewerId: string,
): Promise<Map<string, PollView>> {
  const polls = rows.filter((r) => r.kind === 'poll' && r.meta);
  const out = new Map<string, PollView>();
  if (polls.length === 0) return out;
  const ids = polls.map((p) => p.id);
  const [grouped, mine] = await Promise.all([
    prisma.directPollVote.groupBy({
      by: ['messageId', 'optionIdx'],
      where: { messageId: { in: ids } },
      _count: { _all: true },
    }),
    prisma.directPollVote.findMany({
      where: { messageId: { in: ids }, userId: viewerId },
      select: { messageId: true, optionIdx: true },
    }),
  ]);
  const counts = new Map<string, number[]>();
  for (const g of grouped) {
    const arr = counts.get(g.messageId) ?? [];
    arr[g.optionIdx] = g._count._all;
    counts.set(g.messageId, arr);
  }
  const votes = new Map(mine.map((v) => [v.messageId, v.optionIdx]));
  for (const p of polls) {
    out.set(p.id, viewFor(p.meta as PollMeta, counts.get(p.id) ?? [], votes.get(p.id) ?? null));
  }
  return out;
}

export type VoteResult =
  { ok: true; poll: PollView } | { ok: false; status: number; error: string };

/** Cast or change a vote on a DM poll. */
export async function voteDmPoll(
  access: ChatAccess,
  messageId: string,
  optionIdx: number,
): Promise<VoteResult> {
  if (access.kind !== 'dm') return { ok: false, status: 400, error: 'Not a DM poll' };
  const msg = await prisma.directMessage.findFirst({
    where: { id: messageId, conversationId: access.id, kind: 'poll', deletedAt: null },
    select: { id: true, kind: true, meta: true, expiresAt: true },
  });
  if (!msg || (msg.expiresAt && msg.expiresAt.getTime() <= Date.now())) {
    return { ok: false, status: 404, error: 'No such poll' };
  }
  const meta = msg.meta as unknown as PollMeta;
  if (optionIdx >= meta.options.length) return { ok: false, status: 400, error: 'Invalid option' };

  await prisma.directPollVote.upsert({
    where: { messageId_userId: { messageId, userId: access.viewerId } },
    create: { messageId, userId: access.viewerId, optionIdx },
    update: { optionIdx },
  });
  const polls = await loadDmPolls([msg], access.viewerId);
  const poll = polls.get(messageId)!;
  publishChatUpdate(access, {
    kind: 'dm',
    chatId: access.id,
    op: 'poll',
    messageId,
    options: poll.options,
    totalVotes: poll.totalVotes,
  });
  return { ok: true, poll };
}
