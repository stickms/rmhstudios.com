import { prisma } from '@/lib/prisma.server';
import { canViewPost } from '@/lib/feed/audience.server';
import type { CodeEmbed } from './shared';

/** The snippet for a post the viewer is allowed to see, or null. */
export async function getPostEmbed(
  postId: string,
  viewerId: string | null,
): Promise<CodeEmbed | null> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, audience: true, communityId: true, deletedAt: true, codeEmbed: true },
  });
  if (!post || post.deletedAt || !post.codeEmbed || !(await canViewPost(post, viewerId)))
    return null;
  const { html, css, js } = post.codeEmbed;
  return { html, css, js };
}
