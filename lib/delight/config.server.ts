import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import type { DelightConfig } from '@/lib/delight/schema';

const CACHE_KEY = 'delight:config';

/** Z8 flag + "is a hunt active" for the pre-paint cache. Two indexed reads, cached for 60s. */
export async function getDelightConfig(): Promise<DelightConfig> {
  return cached(
    CACHE_KEY,
    60_000,
    async () => {
      const [flag, hunt] = await Promise.all([
        prisma.delightSetting.findUnique({ where: { key: 'aprilfools' }, select: { value: true } }),
        prisma.hunt.findFirst({ where: { active: true }, select: { id: true } }),
      ]);
      const cfg = { fools: flag?.value === '1', hunt: !!hunt };
      return cfg;
    },
    { l2: false },
  );
}

export function dropDelightConfigCache(): void {
  void invalidateCached(CACHE_KEY);
}

export async function setFools(on: boolean): Promise<void> {
  await prisma.delightSetting.upsert({
    where: { key: 'aprilfools' },
    create: { key: 'aprilfools', value: on ? '1' : '0' },
    update: { value: on ? '1' : '0' },
  });
  dropDelightConfigCache();
}
