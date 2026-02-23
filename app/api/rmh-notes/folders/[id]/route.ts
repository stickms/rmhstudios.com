import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ id: string }>;

export async function PATCH(req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const folder = await prisma.noteFolder.findFirst({ where: { id, userId: session.user.id } });
  if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { name?: string; color?: string; parentId?: string; position?: number } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const updated = await prisma.noteFolder.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.color !== undefined && { color: body.color }),
      ...(body.parentId !== undefined && { parentId: body.parentId }),
      ...(body.position !== undefined && { position: body.position }),
    },
    include: { _count: { select: { notes: { where: { isDeleted: false, isArchived: false } } } } },
  });

  return NextResponse.json({ folder: updated });
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const folder = await prisma.noteFolder.findFirst({ where: { id, userId: session.user.id } });
  if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Unset folderId on notes in this folder
  await prisma.note.updateMany({ where: { folderId: id }, data: { folderId: null } });
  await prisma.noteFolder.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
