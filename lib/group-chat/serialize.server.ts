/**
 * Shared serialization for group-chat messages (server-only), so the initial
 * load, the `?after=` poll, and the send response all return the same shape —
 * including rich media and poll tallies (with the viewer's own vote).
 */
import { prisma } from '@/lib/prisma.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import type { GroupMessagePayload } from '@/lib/group-events';

export const groupMessageSelect = {
  id: true,
  content: true,
  createdAt: true,
  gifUrl: true,
  imageUrls: true,
  pollQuestion: true,
  pollOptions: true,
  sender: { select: userDisplaySelect },
} as const;

type GroupMessageRow = {
  id: string;
  content: string;
  createdAt: Date;
  gifUrl: string | null;
  imageUrls: string[];
  pollQuestion: string | null;
  pollOptions: string[];
  sender: Parameters<typeof resolveUser>[0];
};

/** Map message rows to API payloads, attaching poll tallies + the viewer's vote. */
export async function serializeGroupMessages(
  rows: GroupMessageRow[],
  viewerId: string | null,
): Promise<GroupMessagePayload[]> {
  const pollIds = rows.filter((r) => r.pollQuestion).map((r) => r.id);

  // Tally votes per (message, option) and find the viewer's own choices.
  const tallies = new Map<string, number[]>();
  const myVotes = new Map<string, number>();
  if (pollIds.length) {
    const grouped = await prisma.groupPollVote.groupBy({
      by: ['messageId', 'optionIdx'],
      where: { messageId: { in: pollIds } },
      _count: { _all: true },
    });
    for (const g of grouped) {
      const arr = tallies.get(g.messageId) ?? [];
      arr[g.optionIdx] = g._count._all;
      tallies.set(g.messageId, arr);
    }
    if (viewerId) {
      const mine = await prisma.groupPollVote.findMany({
        where: { messageId: { in: pollIds }, userId: viewerId },
        select: { messageId: true, optionIdx: true },
      });
      for (const v of mine) myVotes.set(v.messageId, v.optionIdx);
    }
  }

  return rows.map((m) => {
    let poll: GroupMessagePayload['poll'] = null;
    if (m.pollQuestion) {
      const counts = tallies.get(m.id) ?? [];
      const options = m.pollOptions.map((text, i) => ({ text, votes: counts[i] ?? 0 }));
      poll = {
        question: m.pollQuestion,
        options,
        totalVotes: options.reduce((sum, o) => sum + o.votes, 0),
        myVote: myVotes.has(m.id) ? myVotes.get(m.id)! : null,
      };
    }
    return {
      id: m.id,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      sender: resolveUser(m.sender),
      gifUrl: m.gifUrl,
      imageUrls: m.imageUrls,
      poll,
    };
  });
}
