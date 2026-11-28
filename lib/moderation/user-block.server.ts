import { prisma } from '@/lib/prisma.server';

export async function blockedEitherWay(a: string, b: string): Promise<boolean> {
  const hit = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { id: true },
  });
  return !!hit;
}
