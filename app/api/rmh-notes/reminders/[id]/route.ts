import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

type Params = Promise<{ id: string }>;

export async function PATCH(req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const reminder = await prisma.noteReminder.findFirst({ where: { id, userId: session.user.id } });
  if (!reminder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { isCompleted?: boolean; snoozedUntil?: string | null; dueAt?: string; title?: string; repeatRule?: string | null; snoozeMinutes?: number } = {};
  try { body = await req.json(); } catch { /* empty */ }

  let snoozedUntil = reminder.snoozedUntil;
  if (body.snoozeMinutes) {
    snoozedUntil = new Date(Date.now() + body.snoozeMinutes * 60000);
  } else if ('snoozedUntil' in body) {
    snoozedUntil = body.snoozedUntil ? new Date(body.snoozedUntil) : null;
  }

  const data: Record<string, unknown> = {};
  if (body.isCompleted !== undefined) data.isCompleted = body.isCompleted;
  if (body.dueAt !== undefined) data.dueAt = new Date(body.dueAt);
  if (body.title !== undefined) data.title = body.title;
  if ('repeatRule' in body) data.repeatRule = body.repeatRule;
  data.snoozedUntil = snoozedUntil;

  // If completing a recurring reminder, create next occurrence
  if (body.isCompleted && reminder.repeatRule) {
    const next = computeNextOccurrence(reminder.dueAt, reminder.repeatRule);
    if (next) {
      await prisma.noteReminder.create({
        data: {
          noteId: reminder.noteId,
          userId: session.user.id,
          title: reminder.title,
          dueAt: next,
          repeatRule: reminder.repeatRule,
        },
      });
    }
  }

  const updated = await prisma.noteReminder.update({
    where: { id },
    data,
    include: { note: { select: { id: true, title: true, color: true } } },
  });

  return NextResponse.json({ reminder: updated });
}

export async function DELETE(_req: Request, { params }: { params: Params }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;

  const reminder = await prisma.noteReminder.findFirst({ where: { id, userId: session.user.id } });
  if (!reminder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.noteReminder.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

function computeNextOccurrence(date: Date, rule: string): Date | null {
  const next = new Date(date);
  if (rule === 'daily') next.setDate(next.getDate() + 1);
  else if (rule === 'weekly') next.setDate(next.getDate() + 7);
  else if (rule === 'monthly') next.setMonth(next.getMonth() + 1);
  else return null;
  // Ensure next is in the future
  const now = new Date();
  if (next <= now) {
    if (rule === 'daily') return new Date(now.getTime() + 86400000);
    if (rule === 'weekly') return new Date(now.getTime() + 7 * 86400000);
    if (rule === 'monthly') { const m = new Date(now); m.setMonth(m.getMonth() + 1); return m; }
  }
  return next;
}
