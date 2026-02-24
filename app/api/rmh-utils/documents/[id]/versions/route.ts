import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Check access
  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      userId: true,
      collaborators: { where: { userId: session.user.id }, select: { id: true } },
    },
  });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (doc.userId !== session.user.id && doc.collaborators.length === 0) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      title: true,
      createdBy: true,
      createdAt: true,
    },
    take: 50,
  });

  return NextResponse.json({ versions });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  // Check access
  const doc = await prisma.document.findUnique({
    where: { id },
    select: {
      userId: true,
      title: true,
      yjsState: true,
      collaborators: { where: { userId: session.user.id }, select: { role: true } },
    },
  });
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const isOwner = doc.userId === session.user.id;
  const collabRole = doc.collaborators[0]?.role;
  if (!isOwner && collabRole !== 'EDITOR' && collabRole !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (!doc.yjsState) {
    return NextResponse.json({ error: 'No document state to snapshot' }, { status: 400 });
  }

  const version = await prisma.documentVersion.create({
    data: {
      documentId: id,
      title: body.title || doc.title,
      yjsState: doc.yjsState,
      createdBy: session.user.id,
    },
    select: {
      id: true,
      title: true,
      createdBy: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ version }, { status: 201 });
}
