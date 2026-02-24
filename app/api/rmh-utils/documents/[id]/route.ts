import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true, image: true } },
      collaborators: {
        include: { user: { select: { id: true, name: true, image: true } } },
      },
    },
  });

  if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Check access
  const isOwner = document.userId === session.user.id;
  const isCollaborator = document.collaborators.some((c) => c.userId === session.user.id);
  if (!isOwner && !isCollaborator) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ document });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Verify access
  const doc = await prisma.document.findUnique({
    where: { id },
    select: { userId: true, collaborators: { where: { userId: session.user.id }, select: { role: true } } },
  });

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = doc.userId === session.user.id;
  const collabRole = doc.collaborators[0]?.role;
  if (!isOwner && collabRole !== 'EDITOR' && collabRole !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const updateData: Record<string, unknown> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.isFavorite !== undefined) updateData.isFavorite = body.isFavorite;
  if (body.metadata !== undefined) updateData.metadata = body.metadata;
  if (body.isDeleted !== undefined) {
    updateData.isDeleted = body.isDeleted;
    updateData.deletedAt = body.isDeleted ? new Date() : null;
  }

  const document = await prisma.document.update({
    where: { id },
    data: updateData,
    include: {
      user: { select: { id: true, name: true, image: true } },
      collaborators: {
        include: { user: { select: { id: true, name: true, image: true } } },
      },
    },
  });

  return NextResponse.json({ document });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const doc = await prisma.document.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (doc.userId !== session.user.id) {
    return NextResponse.json({ error: 'Only the owner can permanently delete' }, { status: 403 });
  }

  await prisma.document.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
