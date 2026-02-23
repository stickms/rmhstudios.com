import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tags = await prisma.noteTag.findMany({
    where: { userId: session.user.id },
    orderBy: { name: 'asc' },
    include: { _count: { select: { notes: true } } },
  });

  return NextResponse.json({ tags });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { name?: string; color?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (!body.name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const existing = await prisma.noteTag.findFirst({
    where: { userId: session.user.id, name: { equals: body.name.trim(), mode: 'insensitive' } },
  });
  if (existing) return NextResponse.json({ tag: existing });

  const tag = await prisma.noteTag.create({
    data: { userId: session.user.id, name: body.name.trim(), color: body.color ?? null },
    include: { _count: { select: { notes: true } } },
  });

  return NextResponse.json({ tag }, { status: 201 });
}
