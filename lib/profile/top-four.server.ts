/** Server half of Top Four (P1): store the four picks in the member's showcase layout. */
import { prisma } from '@/lib/prisma.server';
import { MAX_MODULES } from '@/lib/profile/modules';
import {
  parseLayout,
  moduleSchema,
  type ProfileModule,
  type TopFourItem,
} from '@/lib/profile/modules-schema';
import { resolveTopFour } from '@/lib/profile/top-four';

/**
 * Replace the Top Four. Picks are resolved against the catalogs first, so a
 * client cannot store an id that does not exist. An empty list removes the
 * module from the profile. Returns the stored picks.
 */
export async function setTopFour(
  userId: string,
  items: readonly TopFourItem[],
): Promise<TopFourItem[]> {
  const stored: TopFourItem[] = resolveTopFour(items).map((e) => ({ kind: e.kind, id: e.id }));

  const row = await prisma.profileLayout.findUnique({
    where: { userId },
    select: { modules: true },
  });
  const current = parseLayout(row?.modules);
  const without = current.filter((m) => m.kind !== 'top-four');

  let next: ProfileModule[];
  if (stored.length === 0) {
    next = without;
  } else {
    const entry = moduleSchema.parse({ kind: 'top-four', config: { items: stored } });
    const index = current.findIndex((m) => m.kind === 'top-four');
    if (index >= 0) {
      next = current.map((m, i) => (i === index ? entry : m));
    } else if (current.length < MAX_MODULES) {
      next = [...current, entry];
    } else {
      next = current;
    }
  }
  await prisma.profileLayout.upsert({
    where: { userId },
    create: { userId, modules: next },
    update: { modules: next },
  });
  return stored;
}

export async function getTopFour(userId: string): Promise<TopFourItem[]> {
  const row = await prisma.profileLayout.findUnique({
    where: { userId },
    select: { modules: true },
  });
  const mod = parseLayout(row?.modules).find((m) => m.kind === 'top-four');
  return mod && mod.kind === 'top-four' ? mod.config.items : [];
}
