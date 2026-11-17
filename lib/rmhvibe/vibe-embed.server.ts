import { prisma } from '@/lib/prisma.server';
import { canViewPost } from '@/lib/feed/audience.server';
import { parseTweakSpec, validateTweakValues } from '@/lib/rmhvibe/tweaks';

type PostVibe = {
  slug: string;
  versionId: string;
  title: string | null;
  description: string | null;
  thumbnailUrl: string | null;
  kind: 'page' | 'widget';
};

/** The vibe pinned to a post the viewer may see, or null (post, page or version gone; page not ready). */
export async function getPostVibe(postId: string, viewerId: string | null): Promise<PostVibe | null> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: {
      id: true,
      userId: true,
      audience: true,
      communityId: true,
      deletedAt: true,
      vibeEmbed: {
        select: {
          versionId: true,
          page: { select: { id: true, slug: true, status: true, kind: true, thumbnailUrl: true } },
        },
      },
    },
  });
  const pin = post?.vibeEmbed;
  if (!post || post.deletedAt || !pin || pin.page.status !== 'ready') return null;
  if (!(await canViewPost(post, viewerId))) return null;
  const version = await prisma.vibePageVersion.findFirst({
    where: { id: pin.versionId, pageId: pin.page.id },
    select: { title: true, description: true },
  });
  if (!version) return null;
  return {
    slug: pin.page.slug,
    versionId: pin.versionId,
    title: version.title,
    description: version.description,
    thumbnailUrl: pin.page.thumbnailUrl,
    kind: pin.page.kind === 'widget' ? 'widget' : 'page',
  };
}

/** A ready page at `versionId` (its latest when omitted), or null. The version must be the page's own. */
export async function getVibeRunnable(slug: string, versionId: string | undefined) {
  const page = await prisma.vibePage.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      status: true,
      kind: true,
      title: true,
      prompt: true,
      thumbnailUrl: true,
      tweakValues: true,
    },
  });
  if (!page || page.status !== 'ready') return null;
  const version = await prisma.vibePageVersion.findFirst({
    where: versionId ? { id: versionId, pageId: page.id } : { pageId: page.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, title: true, description: true, html: true, tweakSpec: true },
  });
  if (!version) return null;
  const tweakSpec = parseTweakSpec(version.tweakSpec);
  return {
    slug: page.slug,
    versionId: version.id,
    title: version.title || page.title || page.prompt,
    description: version.description,
    html: version.html,
    kind: page.kind === 'widget' ? ('widget' as const) : ('page' as const),
    thumbnailUrl: page.thumbnailUrl,
    tweakValues: validateTweakValues(tweakSpec, page.tweakValues),
    tweakSpec,
  };
}
