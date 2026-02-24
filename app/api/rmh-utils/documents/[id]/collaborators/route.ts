import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      userId: true,
      collaborators: {
        include: { user: { select: { id: true, name: true, image: true, email: true } } },
      },
    },
  });

  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = doc.userId === session.user.id;
  const isCollaborator = doc.collaborators.some((c) => c.userId === session.user.id);
  if (!isOwner && !isCollaborator) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({ collaborators: doc.collaborators });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const { username, role = 'EDITOR' } = body;

  if (!username) return NextResponse.json({ error: 'Username required' }, { status: 400 });
  if (!['VIEWER', 'EDITOR'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
  }

  // Only owner can add collaborators
  const doc = await prisma.document.findUnique({ where: { id }, select: { userId: true } });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (doc.userId !== session.user.id) {
    return NextResponse.json({ error: 'Only the owner can manage collaborators' }, { status: 403 });
  }

  // Find user by username
  const targetUser = await prisma.user.findUnique({ where: { username }, select: { id: true } });
  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (targetUser.id === session.user.id) {
    return NextResponse.json({ error: 'Cannot add yourself' }, { status: 400 });
  }

  const collaborator = await prisma.documentCollaborator.upsert({
    where: { documentId_userId: { documentId: id, userId: targetUser.id } },
    create: { documentId: id, userId: targetUser.id, role },
    update: { role },
    include: { user: { select: { id: true, name: true, image: true } } },
  });

  return NextResponse.json({ collaborator }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

  const doc = await prisma.document.findUnique({ where: { id }, select: { userId: true } });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Owner can remove anyone, collaborator can remove themselves
  if (doc.userId !== session.user.id && userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.documentCollaborator.deleteMany({
    where: { documentId: id, userId },
  });

  return NextResponse.json({ success: true });
}
