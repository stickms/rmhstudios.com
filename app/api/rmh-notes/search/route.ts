import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim() ?? '';
  const tagId = searchParams.get('tagId');
  const folderId = searchParams.get('folderId');
  const hasReminder = searchParams.get('hasReminder') === 'true';
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  const where: Record<string, unknown> = {
    userId: session.user.id,
    isDeleted: false,
  };

  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { content: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (folderId) where.folderId = folderId;
  if (dateFrom || dateTo) {
    const createdAt: Record<string, Date> = {};
    if (dateFrom) {
      const d = new Date(dateFrom);
      if (!isNaN(d.getTime())) createdAt.gte = d;
    }
    if (dateTo) {
      const d = new Date(dateTo);
      if (!isNaN(d.getTime())) createdAt.lte = d;
    }
    if (Object.keys(createdAt).length > 0) where.createdAt = createdAt;
  }
  if (hasReminder) {
    where.reminders = { some: { isCompleted: false } };
  }

  const notes = await prisma.note.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    take: 50,
    include: {
      tags: { include: { tag: true } },
      reminders: { where: { isCompleted: false }, take: 1 },
      folder: { select: { id: true, name: true, color: true } },
    },
  });

  const filtered = tagId ? notes.filter((n) => n.tags.some((t) => t.tagId === tagId)) : notes;

  return NextResponse.json({ notes: filtered });
}
