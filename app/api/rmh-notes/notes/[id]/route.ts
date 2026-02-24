import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ id: string }>;

async function getNote(noteId: string, userId: string) {
  return prisma.note.findFirst({ where: { id: noteId, userId } });
}

export async function GET(_req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const note = await prisma.note.findFirst({
    where: { id, userId: session.user.id },
    include: {
      tags: { include: { tag: true } },
      reminders: { orderBy: { dueAt: 'asc' } },
      folder: { select: { id: true, name: true, color: true } },
      shares: { select: { token: true, expiresAt: true, createdAt: true } },
    },
  });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ note });
}

export async function PATCH(req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getNote(id, session.user.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }

  const allowedFields = [
    'title', 'content', 'color', 'isPinned', 'isFavorite', 'isArchived',
    'isDeleted', 'deletedAt', 'folderId', 'wordCount', 'charCount', 'sortOrder', 'moodEmoji',
    'tagIds',
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body && key !== 'tagIds') data[key] = body[key];
  }

  // Save version snapshot before updating content
  if ('content' in body && body.content !== existing.content) {
    await prisma.noteVersion.create({
      data: { noteId: id, content: existing.content, title: existing.title },
    });
    // Keep only last 30 versions
    const count = await prisma.noteVersion.count({ where: { noteId: id } });
    if (count > 30) {
      const oldest = await prisma.noteVersion.findFirst({
        where: { noteId: id }, orderBy: { createdAt: 'asc' },
      });
      if (oldest) await prisma.noteVersion.delete({ where: { id: oldest.id } });
    }
  }

  const note = await prisma.note.update({
    where: { id },
    data,
    include: {
      tags: { include: { tag: true } },
      reminders: { where: { isCompleted: false }, take: 1 },
      folder: { select: { id: true, name: true, color: true } },
    },
  });

  // Handle tag updates
  if (Array.isArray(body.tagIds)) {
    await prisma.noteTagRelation.deleteMany({ where: { noteId: id } });
    if ((body.tagIds as string[]).length > 0) {
      await prisma.noteTagRelation.createMany({
        data: (body.tagIds as string[]).map((tagId) => ({ noteId: id, tagId })),
        skipDuplicates: true,
      });
    }
  }

  return NextResponse.json({ note });
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const existing = await getNote(id, session.user.id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Hard delete if already in trash, otherwise soft-delete
  if (existing.isDeleted) {
    await prisma.note.delete({ where: { id } });
  } else {
    await prisma.note.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  return NextResponse.json({ success: true });
}
