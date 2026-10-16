import { prisma } from '@/lib/prisma.server';
import type { ReleaseNoteView } from '@/lib/devplatform/release-notes';

type Row = {
  id: string;
  version: string;
  title: string;
  body: string;
  publishedAt: Date | null;
  createdAt: Date;
};
const view = (r: Row): ReleaseNoteView => ({
  id: r.id,
  version: r.version,
  title: r.title,
  body: r.body,
  publishedAt: r.publishedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});

export async function listPublishedNotes(): Promise<ReleaseNoteView[]> {
  const rows = await prisma.releaseNote.findMany({
    where: { publishedAt: { not: null } },
    orderBy: { publishedAt: 'desc' },
    take: 50,
  });
  return rows.map(view);
}

export async function listAllNotes(): Promise<ReleaseNoteView[]> {
  const rows = await prisma.releaseNote.findMany({ orderBy: { createdAt: 'desc' }, take: 100 });
  return rows.map(view);
}

export async function createNote(
  authorId: string,
  d: { version: string; title: string; body: string; publish?: boolean },
): Promise<ReleaseNoteView> {
  const r = await prisma.releaseNote.create({
    data: {
      version: d.version,
      title: d.title,
      body: d.body,
      authorId,
      publishedAt: d.publish ? new Date() : null,
    },
  });
  return view(r);
}

export async function updateNote(
  id: string,
  d: { version?: string; title?: string; body?: string; publish?: boolean },
): Promise<ReleaseNoteView | null> {
  const existing = await prisma.releaseNote.findUnique({
    where: { id },
    select: { publishedAt: true },
  });
  if (!existing) return null;
  const r = await prisma.releaseNote.update({
    where: { id },
    data: {
      version: d.version,
      title: d.title,
      body: d.body,
      // Keep the original publish time when an already-published note is edited.
      ...(d.publish === undefined
        ? {}
        : { publishedAt: d.publish ? (existing.publishedAt ?? new Date()) : null }),
    },
  });
  return view(r);
}

export async function deleteNote(id: string): Promise<boolean> {
  return (await prisma.releaseNote.deleteMany({ where: { id } })).count > 0;
}
