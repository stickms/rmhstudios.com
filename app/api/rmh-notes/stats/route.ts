import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userId = session.user.id;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);

  const [totalNotes, pinnedCount, archivedCount, trashedCount, remindersTotal, remindersCompleted, overdueCount, weekNotes, tagsCount, foldersCount] = await Promise.all([
    prisma.note.count({ where: { userId, isDeleted: false } }),
    prisma.note.count({ where: { userId, isPinned: true, isDeleted: false } }),
    prisma.note.count({ where: { userId, isArchived: true, isDeleted: false } }),
    prisma.note.count({ where: { userId, isDeleted: true } }),
    prisma.noteReminder.count({ where: { userId } }),
    prisma.noteReminder.count({ where: { userId, isCompleted: true } }),
    prisma.noteReminder.count({ where: { userId, isCompleted: false, dueAt: { lt: now } } }),
    prisma.note.count({ where: { userId, isDeleted: false, createdAt: { gte: sevenDaysAgo } } }),
    prisma.noteTag.count({ where: { userId } }),
    prisma.noteFolder.count({ where: { userId } }),
  ]);

  // Notes per day for last 30 days
  const recentNotes = await prisma.note.findMany({
    where: { userId, isDeleted: false, createdAt: { gte: thirtyDaysAgo } },
    select: { createdAt: true },
  });

  const byDay: Record<string, number> = {};
  for (const note of recentNotes) {
    const day = note.createdAt.toISOString().split('T')[0];
    byDay[day] = (byDay[day] ?? 0) + 1;
  }

  // Streak calculation
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    if (byDay[key]) streak++;
    else if (i > 0) break;
  }

  // Mood counts
  const moods = await prisma.noteMood.findMany({
    where: { userId },
    orderBy: { date: 'desc' },
    take: 30,
  });

  return NextResponse.json({
    totalNotes,
    pinnedCount,
    archivedCount,
    trashedCount,
    remindersTotal,
    remindersCompleted,
    overdueCount,
    weekNotes,
    tagsCount,
    foldersCount,
    streak,
    notesPerDay: byDay,
    recentMoods: moods,
  });
}
