/**
 * The vibe data a person can take with them (GDPR "download my data"): the pages they own, the
 * prompts that built each version, their per-user vibe store rows, and which of their posts embed
 * a vibe. The generated HTML is deliberately left out — it is a build artifact, not personal data,
 * and one page can be megabytes.
 */
import { prisma } from '@/lib/prisma.server';

/** Per-collection bound, matching the rest of the export. */
const CAP = 10_000;

export async function exportVibeData(userId: string) {
  const [pages, kv, embeds] = await Promise.all([
    prisma.vibePage.findMany({
      where: { ownerId: userId },
      take: CAP,
      orderBy: { createdAt: 'desc' },
      select: {
        slug: true,
        title: true,
        description: true,
        kind: true,
        prompt: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        tweakValues: true,
        parent: { select: { slug: true } },
        // Owner edits are the only way a page gains versions, so every prompt here is theirs.
        versions: {
          take: 200,
          orderBy: { createdAt: 'asc' },
          select: { id: true, prompt: true, title: true, description: true, createdAt: true },
        },
      },
    }),
    prisma.vibeKv.findMany({
      where: { scope: 'user', ownerKey: userId },
      take: CAP,
      orderBy: { updatedAt: 'desc' },
      select: { key: true, value: true, updatedAt: true, page: { select: { slug: true } } },
    }),
    prisma.postVibeEmbed.findMany({
      where: { post: { userId } },
      take: CAP,
      orderBy: { createdAt: 'desc' },
      select: { postId: true, versionId: true, createdAt: true, page: { select: { slug: true } } },
    }),
  ]);

  return {
    pages: pages.map(({ parent, versions, ...page }) => ({
      ...page,
      remixOf: parent?.slug ?? null,
      versions,
    })),
    storeRows: kv.map(({ page, ...row }) => ({ pageSlug: page.slug, ...row })),
    postEmbeds: embeds.map(({ page, ...row }) => ({ pageSlug: page.slug, ...row })),
  };
}
