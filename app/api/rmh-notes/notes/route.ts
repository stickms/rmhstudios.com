import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const folderId = searchParams.get('folderId');
  const tagId = searchParams.get('tagId');
  const view = searchParams.get('view') ?? 'all';

  const where: Record<string, unknown> = { userId: session.user.id };

  if (view === 'archive') {
    where.isArchived = true;
    where.isDeleted = false;
  } else if (view === 'trash') {
    where.isDeleted = true;
  } else {
    where.isArchived = false;
    where.isDeleted = false;
    if (view === 'pinned') where.isPinned = true;
    if (view === 'favorites') where.isFavorite = true;
    if (folderId === 'none') where.folderId = null;
    else if (folderId) where.folderId = folderId;
  }

  const notes = await prisma.note.findMany({
    where,
    orderBy: [{ isPinned: 'desc' }, { sortOrder: 'asc' }, { updatedAt: 'desc' }],
    include: {
      tags: { include: { tag: true } },
      reminders: { where: { isCompleted: false }, orderBy: { dueAt: 'asc' }, take: 1 },
      folder: { select: { id: true, name: true, color: true } },
    },
  });

  // filter by tag if needed
  const filtered = tagId
    ? notes.filter((n) => n.tags.some((t) => t.tagId === tagId))
    : notes;

  return NextResponse.json({ notes: filtered });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { title?: string; content?: string; folderId?: string; color?: string; templateId?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  let content = body.content ?? '{"type":"doc","content":[{"type":"paragraph"}]}';

  // If templateId given, copy template content
  if (body.templateId) {
    const tmpl = await prisma.noteTemplate.findFirst({
      where: { id: body.templateId, OR: [{ userId: session.user.id }, { isBuiltin: true }] },
    });
    if (tmpl) content = tmpl.content;
  }

  const note = await prisma.note.create({
    data: {
      userId: session.user.id,
      title: body.title ?? 'Untitled',
      content,
      folderId: body.folderId ?? null,
      color: body.color ?? null,
    },
    include: {
      tags: { include: { tag: true } },
      reminders: { where: { isCompleted: false }, take: 1 },
      folder: { select: { id: true, name: true, color: true } },
    },
  });

  return NextResponse.json({ note }, { status: 201 });
}
