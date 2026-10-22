import { prisma } from '@/lib/prisma.server';
import { canViewPost } from '@/lib/feed/audience.server';
import { isPostLockedFor } from '@/lib/feed/map-feed-item.server';
import type { CodeEmbed } from './shared';

/** The snippet for a post the viewer is allowed to see, or null. */
export async function getPostEmbed(
  postId: string,
  viewerId: string | null,
): Promise<CodeEmbed | null> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, audience: true, communityId: true, deletedAt: true, expiresAt: true, codeEmbed: true },
  });
  if (!post || post.deletedAt || !post.codeEmbed || !(await canViewPost(post, viewerId)))
    return null;
  // A priced post's snippet is paid content, like its body.
  if (await isPostLockedFor(post.id, viewerId)) return null;
  const { html, css, js } = post.codeEmbed;
  return { html, css, js };
}
