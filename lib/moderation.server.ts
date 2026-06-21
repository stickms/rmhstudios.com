/**
 * Moderation read helpers shared across feed/profile queries.
 */

import { prisma } from '@/lib/prisma.server';

/**
 * Author ids whose content should be hidden from `userId`'s feed: people they
 * blocked, people they muted, and people who blocked them (so a blocker also
 * disappears from the blocked user's timeline). Returns [] for anonymous users.
 */
export async function getHiddenAuthorIds(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  try {
    const [blocked, muted, blockedBy] = await Promise.all([
      prisma.userBlock.findMany({ where: { blockerId: userId }, select: { blockedId: true } }),
      prisma.userMute.findMany({ where: { muterId: userId }, select: { mutedId: true } }),
      prisma.userBlock.findMany({ where: { blockedId: userId }, select: { blockerId: true } }),
    ]);
    const ids = new Set<string>();
    for (const b of blocked) ids.add(b.blockedId);
    for (const m of muted) ids.add(m.mutedId);
    for (const b of blockedBy) ids.add(b.blockerId);
    return [...ids];
  } catch (err) {
    console.error('[moderation] getHiddenAuthorIds failed:', err);
    return [];
  }
}
