import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') ?? 'upcoming'; // upcoming | overdue | all

  const now = new Date();
  const where: Record<string, unknown> = { userId: session.user.id, isCompleted: false };

  if (view === 'overdue') {
    where.dueAt = { lt: now };
    where.snoozedUntil = null;
  } else if (view === 'upcoming') {
    where.dueAt = { gte: now };
  }

  const reminders = await prisma.noteReminder.findMany({
    where,
    orderBy: { dueAt: 'asc' },
    include: { note: { select: { id: true, title: true, color: true } } },
  });

  return NextResponse.json({ reminders });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { noteId?: string; title?: string; dueAt?: string; repeatRule?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (!body.noteId || !body.dueAt) {
    return NextResponse.json({ error: 'noteId and dueAt are required' }, { status: 400 });
  }

  const note = await prisma.note.findFirst({ where: { id: body.noteId, userId: session.user.id } });
  if (!note) return NextResponse.json({ error: 'Note not found' }, { status: 404 });

  const dueAt = new Date(body.dueAt);
  if (isNaN(dueAt.getTime())) {
    return NextResponse.json({ error: 'Invalid date format for dueAt' }, { status: 400 });
  }

  const reminder = await prisma.noteReminder.create({
    data: {
      noteId: body.noteId,
      userId: session.user.id,
      title: body.title ? (body.title as string).slice(0, 500) : null,
      dueAt,
      repeatRule: body.repeatRule ?? null,
    },
    include: { note: { select: { id: true, title: true, color: true } } },
  });

  return NextResponse.json({ reminder }, { status: 201 });
}
