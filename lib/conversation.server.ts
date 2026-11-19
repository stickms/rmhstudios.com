import { prisma } from '@/lib/prisma.server';
import { findDmFor } from '@/lib/chat/chat.server';
import { resolveUserDisplay } from '@/lib/user-display';

export interface ConversationOtherUser {
  id: string;
  name: string | null;
  image: string | null;
  username: string | null;
  /** Bot-worker account — the DM header marks it so nobody mistakes it for a person. */
  isBot: boolean;
}

const participantSelect = {
  id: true,
  name: true,
  image: true,
  username: true,
  isBot: true,
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
  const dm = await findDmFor(conversationId, viewerId);
  if (!dm) return null;
  const otherId = dm.participantOneId === viewerId ? dm.participantTwoId : dm.participantOneId;
  const other = await prisma.user.findUnique({ where: { id: otherId }, select: participantSelect });
  if (!other) return null;
  const resolved = resolveUserDisplay(other);
  return {
    id: other.id,
    name: resolved.name,
    image: resolved.image,
    username: other.username,
    isBot: other.isBot,
  };
}
