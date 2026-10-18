import { prisma } from '@/lib/prisma.server';

export async function getMemberLivery(userId: string): Promise<string | null> {
  const row = await prisma.ndwLivery.findUnique({ where: { userId }, select: { code: true } });
  return row?.code ?? null;
}

export async function saveMemberLivery(userId: string, code: string): Promise<void> {
  await prisma.ndwLivery.upsert({ where: { userId }, create: { userId, code }, update: { code } });
}
