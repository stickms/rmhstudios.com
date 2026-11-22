/**
 * The member's own wiki edits, for the account export (s09-04, server-only).
 *
 * A revision row holds the text as it was BEFORE its editor's change, usually somebody else's words, so the export
 * lists that an edit happened (where, when, what the member said it was) and never a body.
 */
import { prisma } from '@/lib/prisma.server';

export interface CommunityPageEditExport {
  communitySlug: string;
  pageSlug: string;
  pageTitle: string;
  summary: string | null;
  createdAt: string;
}

const EXPORT_MAX_ROWS = 10_000;

export async function exportCommunityPageRevisions(userId: string): Promise<CommunityPageEditExport[]> {
  const rows = await prisma.communityPageRevision.findMany({
    where: { editorId: userId },
    orderBy: { createdAt: 'desc' },
    take: EXPORT_MAX_ROWS,
    // Named fields only: `body` is deliberately not selected.
    select: {
      summary: true,
      createdAt: true,
      page: { select: { slug: true, title: true, community: { select: { slug: true } } } },
    },
  });
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    communitySlug: row.page.community.slug,
    pageSlug: row.page.slug,
    pageTitle: row.page.title,
    summary: row.summary,
    createdAt: row.createdAt.toISOString(),
  }));
}
