import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const note = await prisma.note.findFirst({ where: { id, userId: session.user.id } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const versions = await prisma.noteVersion.findMany({
    where: { noteId: id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  return NextResponse.json({ versions });
}

export async function POST(req: Request, { params }: { params: Params }) {
  // Restore a version
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const note = await prisma.note.findFirst({ where: { id, userId: session.user.id } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { versionId: string } = { versionId: '' };
  try { body = await req.json(); } catch { /* empty */ }

  const version = await prisma.noteVersion.findFirst({
    where: { id: body.versionId, noteId: id },
  });
  if (!version) return NextResponse.json({ error: 'Version not found' }, { status: 404 });

  // Save current as a version first
  await prisma.noteVersion.create({
    data: { noteId: id, content: note.content, title: note.title },
  });

  const updated = await prisma.note.update({
    where: { id },
    data: { content: version.content, title: version.title },
    include: {
      tags: { include: { tag: true } },
      reminders: { where: { isCompleted: false }, take: 1 },
      folder: { select: { id: true, name: true, color: true } },
    },
  });

  return NextResponse.json({ note: updated });
}
