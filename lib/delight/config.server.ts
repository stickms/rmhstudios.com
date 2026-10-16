import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import type { DelightConfig } from '@/lib/delight/schema';

const CACHE_KEY = 'delight:config';

/** Z8 flag + "is a hunt active" for the pre-paint cache. Two indexed reads, cached for 60s. */
export async function getDelightConfig(): Promise<DelightConfig> {
  const hit = apiCache.get<DelightConfig>(CACHE_KEY);
  if (hit) return hit;
  const [flag, hunt] = await Promise.all([
    prisma.delightSetting.findUnique({ where: { key: 'aprilfools' }, select: { value: true } }),
    prisma.hunt.findFirst({ where: { active: true }, select: { id: true } }),
  ]);
  const cfg = { fools: flag?.value === '1', hunt: !!hunt };
  apiCache.set(CACHE_KEY, cfg, 60_000);
  return cfg;
}

export function dropDelightConfigCache(): void {
  apiCache.invalidate(CACHE_KEY);
}

export async function setFools(on: boolean): Promise<void> {
  await prisma.delightSetting.upsert({
    where: { key: 'aprilfools' },
    create: { key: 'aprilfools', value: on ? '1' : '0' },
    update: { value: on ? '1' : '0' },
  });
  dropDelightConfigCache();
}
