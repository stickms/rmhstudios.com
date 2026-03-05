import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q) {
    return NextResponse.json({ users: [] });
  }

  const users = await prisma.user.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { username: { contains: q, mode: 'insensitive' } },
        { handle: { contains: q, mode: 'insensitive' } },
      ],
    },
    select: userDisplaySelect,
    take: 5,
  });

  return NextResponse.json({ users: users.map(resolveUser) });
}
