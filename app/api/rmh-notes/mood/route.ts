import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const moods = await prisma.noteMood.findMany({
    where: { userId: session.user.id },
    orderBy: { date: 'desc' },
    take: 60,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];
  const todayMood = moods.find((m) => m.date.toISOString().split('T')[0] === todayStr);

  return NextResponse.json({ moods, todayMood: todayMood ?? null });
}

export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { emoji?: string; color?: string; note?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (!body.emoji || !body.color) {
    return NextResponse.json({ error: 'emoji and color required' }, { status: 400 });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const mood = await prisma.noteMood.upsert({
    where: { userId_date: { userId: session.user.id, date: today } },
    create: { userId: session.user.id, emoji: body.emoji, color: body.color, note: body.note ?? null, date: today },
    update: { emoji: body.emoji, color: body.color, note: body.note ?? null },
  });

  return NextResponse.json({ mood });
}
