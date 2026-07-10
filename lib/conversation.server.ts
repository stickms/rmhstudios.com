import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';

export interface ConversationOtherUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
}

const participantSelect = {
  id: true,
  name: true,
  image: true,
  username: true,
  profile: { select: { displayName: true, customImage: true } },
} as const;

/**
 * The *other* participant in a DM conversation, for the viewer. Returns `null`
 * when the conversation doesn't exist or the viewer isn't a participant.
 *
 * Lets the conversation route prefetch just the header (name/avatar) instead of
 * the whole inbox — the old client path fetched `/api/messages` in full purely
 * to find this one user.
 */
export async function getConversationOtherUser(
  conversationId: string,
  viewerId: string
): Promise<ConversationOtherUser | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      participantOneId: true,
      participantTwoId: true,
      participantOne: { select: participantSelect },
      participantTwo: { select: participantSelect },
    },
  });
  if (!conv) return null;
  if (conv.participantOneId !== viewerId && conv.participantTwoId !== viewerId) return null;

  const other = conv.participantOneId === viewerId ? conv.participantTwo : conv.participantOne;
  const resolved = resolveUserDisplay(other);
  return { id: other.id, name: resolved.name, image: resolved.image, username: other.username };
}
