import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ id: string }>;

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const template = await prisma.noteTemplate.findFirst({
    where: { id, userId: session.user.id, isBuiltin: false },
  });
  if (!template) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.noteTemplate.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
