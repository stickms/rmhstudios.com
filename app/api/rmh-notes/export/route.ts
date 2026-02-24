import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const [notes, folders, tags, reminders, templates, moods] = await Promise.all([
    prisma.note.findMany({
      where: { userId: session.user.id },
      include: { tags: { include: { tag: true } }, reminders: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.noteFolder.findMany({ where: { userId: session.user.id } }),
    prisma.noteTag.findMany({ where: { userId: session.user.id } }),
    prisma.noteReminder.findMany({ where: { userId: session.user.id } }),
    prisma.noteTemplate.findMany({ where: { userId: session.user.id } }),
    prisma.noteMood.findMany({ where: { userId: session.user.id }, orderBy: { date: 'desc' } }),
  ]);

  const exportData = {
    exportedAt: new Date().toISOString(),
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    notes: notes.map((n) => ({
      ...n,
      tags: n.tags.map((t) => t.tag.name),
    })),
    folders,
    tags,
    reminders,
    templates,
    moods,
  };

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="rmhnotes-export-${new Date().toISOString().split('T')[0]}.json"`,
    },
  });
}
