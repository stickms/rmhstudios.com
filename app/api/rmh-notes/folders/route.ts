import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const folders = await prisma.noteFolder.findMany({
    where: { userId: session.user.id },
    orderBy: [{ position: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { notes: { where: { isDeleted: false, isArchived: false } } } } },
  });

  return NextResponse.json({ folders });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: string; parentId?: string; color?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const folder = await prisma.noteFolder.create({
    data: {
      userId: session.user.id,
      name: body.name.trim(),
      parentId: body.parentId ?? null,
      color: body.color ?? null,
    },
    include: { _count: { select: { notes: { where: { isDeleted: false, isArchived: false } } } } },
  });

  return NextResponse.json({ folder }, { status: 201 });
}
