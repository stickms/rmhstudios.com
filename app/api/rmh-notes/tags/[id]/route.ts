import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ id: string }>;

export async function PATCH(req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const tag = await prisma.noteTag.findFirst({ where: { id, userId: session.user.id } });
  if (!tag) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { name?: string; color?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const updated = await prisma.noteTag.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name }),
      ...(body.color !== undefined && { color: body.color }),
    },
    include: { _count: { select: { notes: true } } },
  });

  return NextResponse.json({ tag: updated });
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const tag = await prisma.noteTag.findFirst({ where: { id, userId: session.user.id } });
  if (!tag) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.noteTag.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
