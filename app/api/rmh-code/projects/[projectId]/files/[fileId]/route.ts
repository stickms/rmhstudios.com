import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

type Params = { params: Promise<{ projectId: string; fileId: string }> };

async function getAuthorizedFile(userId: string, projectId: string, fileId: string) {
  const file = await prisma.codeFile.findUnique({
    where: { id: fileId },
    select: { id: true, projectId: true, userId: true, name: true, path: true, language: true, content: true, updatedAt: true },
  });
  if (!file || file.userId !== userId || file.projectId !== projectId) return null;
  return file;
}

export async function GET(_req: Request, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId, fileId } = await params;
  const file = await getAuthorizedFile(session.user.id, projectId, fileId);
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ file });
}

export async function PUT(req: Request, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId, fileId } = await params;
  const file = await getAuthorizedFile(session.user.id, projectId, fileId);
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { content } = body;
  if (typeof content !== 'string') {
    return NextResponse.json({ error: 'content must be a string' }, { status: 400 });
  }

  const updated = await prisma.codeFile.update({
    where: { id: fileId },
    data: { content },
    select: { id: true, updatedAt: true },
  });

  // bump project updatedAt
  await prisma.codeProject.update({
    where: { id: projectId },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json({ success: true, updatedAt: updated.updatedAt });
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { projectId, fileId } = await params;
  const file = await getAuthorizedFile(session.user.id, projectId, fileId);
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.codeFile.delete({ where: { id: fileId } });

  return NextResponse.json({ success: true });
}
