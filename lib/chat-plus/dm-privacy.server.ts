/**
 * Can `senderId` message `recipientId`? The same rule the DM send routes apply
 * (`UserProfile.dmPrivacy`), for the P04 paths that write DMs on the sender's
 * behalf (forwarding). A note-to-self is always allowed.
 */

import { prisma } from '@/lib/prisma.server';

export async function canDirectMessage(senderId: string, recipientId: string): Promise<boolean> {
  if (senderId === recipientId) return true;
  const recipient = await prisma.user.findUnique({
    where: { id: recipientId },
    select: { profile: { select: { dmPrivacy: true } } },
  });
  const privacy = recipient?.profile?.dmPrivacy ?? 'EVERYONE';
  if (privacy === 'NONE') return false;
  if (privacy === 'FOLLOWERS') {
    const follows = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: recipientId, followingId: senderId } },
      select: { followerId: true },
    });
    return !!follows;
  }
  return true;
}
