import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ id: string }>;

export async function GET(_req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const note = await prisma.note.findFirst({ where: { id, userId: session.user.id } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const share = await prisma.noteShare.findFirst({ where: { noteId: id } });
  return NextResponse.json({ share });
}

export async function POST(req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const note = await prisma.note.findFirst({ where: { id, userId: session.user.id } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { expiresInDays?: number } = {};
  try { body = await req.json(); } catch { /* empty */ }

  const expiresAt = body.expiresInDays
    ? new Date(Date.now() + body.expiresInDays * 86400000)
    : null;

  // Upsert: if share already exists, update; otherwise create
  const existing = await prisma.noteShare.findFirst({ where: { noteId: id } });
  const share = existing
    ? await prisma.noteShare.update({ where: { id: existing.id }, data: { expiresAt } })
    : await prisma.noteShare.create({ data: { noteId: id, expiresAt } });

  return NextResponse.json({ share });
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const note = await prisma.note.findFirst({ where: { id, userId: session.user.id } });
  if (!note) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.noteShare.deleteMany({ where: { noteId: id } });
  return NextResponse.json({ success: true });
}
