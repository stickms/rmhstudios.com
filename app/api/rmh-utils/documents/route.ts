import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type')?.toUpperCase();
  const showDeleted = searchParams.get('deleted') === 'true';

  const where: Record<string, unknown> = {
    OR: [
      { userId: session.user.id },
      { collaborators: { some: { userId: session.user.id } } },
    ],
    isDeleted: showDeleted,
  };

  if (type && ['DOC', 'SHEET', 'SLIDE'].includes(type)) {
    where.type = type;
  }

  const documents = await prisma.document.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      user: { select: { id: true, name: true, image: true } },
      collaborators: {
        include: { user: { select: { id: true, name: true, image: true } } },
      },
    },
  });

  return NextResponse.json({ documents });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { type, title } = body;

  if (!type || !['DOC', 'SHEET', 'SLIDE'].includes(type)) {
    return NextResponse.json({ error: 'Invalid document type' }, { status: 400 });
  }

  const document = await prisma.document.create({
    data: {
      type,
      title: title || 'Untitled',
      userId: session.user.id,
    },
    include: {
      user: { select: { id: true, name: true, image: true } },
      collaborators: {
        include: { user: { select: { id: true, name: true, image: true } } },
      },
    },
  });

  return NextResponse.json({ document }, { status: 201 });
}
