import { prisma } from '@/lib/prisma.server';
import type { ModMacroDTO } from './macros';

const MAX_PER_SCOPE = 50;
const select = { id: true, title: true, body: true } as const;

/** `communityId` null = the site-wide (admin) set. */
export function listMacros(communityId: string | null): Promise<ModMacroDTO[]> {
  return prisma.modMacro.findMany({
    where: { communityId },
    orderBy: { createdAt: 'desc' },
    take: MAX_PER_SCOPE,
    select,
  });
}

export async function createMacro(
  communityId: string | null,
  createdById: string,
  input: { title: string; body: string },
): Promise<ModMacroDTO | null> {
  if ((await prisma.modMacro.count({ where: { communityId } })) >= MAX_PER_SCOPE) return null;
  return prisma.modMacro.create({ data: { communityId, createdById, ...input }, select });
}

export async function deleteMacro(communityId: string | null, id: string): Promise<boolean> {
  const { count } = await prisma.modMacro.deleteMany({ where: { id, communityId } });
  return count > 0;
}
