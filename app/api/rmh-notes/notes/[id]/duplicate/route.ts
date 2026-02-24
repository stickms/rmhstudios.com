import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ id: string }>;

export async function POST(_req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const note = await prisma.note.findFirst({
    where: { id, userId: session.user.id },
    include: { tags: true },
  });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const duplicate = await prisma.note.create({
    data: {
      userId: session.user.id,
      title: `${note.title} (copy)`,
      content: note.content,
      color: note.color,
      folderId: note.folderId,
      wordCount: note.wordCount,
      charCount: note.charCount,
    },
    include: {
      tags: { include: { tag: true } },
      reminders: { take: 1 },
      folder: { select: { id: true, name: true, color: true } },
    },
  });

  // Copy tags
  if (note.tags.length > 0) {
    await prisma.noteTagRelation.createMany({
      data: note.tags.map((t) => ({ noteId: duplicate.id, tagId: t.tagId })),
      skipDuplicates: true,
    });
  }

  return NextResponse.json({ note: duplicate }, { status: 201 });
}
