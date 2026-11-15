/** Z3 — site museum: admin-edited eras, public read. */
import { prisma } from '@/lib/prisma.server';
import { cached, invalidateCached } from '@/lib/cached.server';
import type { z } from 'zod';
import type { eraSchema } from '@/lib/delight/schema';

const KEY = 'delight:museum';
const select = { id: true, eraDate: true, title: true, body: true, imageUrl: true } as const;

export async function listEras() {
  return cached(
    KEY,
    5 * 60_000,
    async () => {
      const rows = await load();
      return rows;
    },
    { l2: false },
  );
}

async function load() {
  const rows = await prisma.siteEra.findMany({ orderBy: { eraDate: 'desc' }, take: 200, select });
  return rows.map((r) => ({ ...r, eraDate: r.eraDate.toISOString().slice(0, 10) }));
}

type EraInput = z.infer<typeof eraSchema>;
const data = (i: EraInput) => ({
  eraDate: new Date(`${i.eraDate}T00:00:00Z`),
  title: i.title,
  body: i.body,
  imageUrl: i.imageUrl ?? null,
});

export async function createEra(i: EraInput) {
  const row = await prisma.siteEra.create({ data: data(i), select: { id: true } });
  void invalidateCached(KEY);
  return row;
}

export async function updateEra(id: string, i: EraInput): Promise<boolean> {
  const res = await prisma.siteEra.updateMany({ where: { id }, data: data(i) });
  void invalidateCached(KEY);
  return res.count > 0;
}

export async function deleteEra(id: string): Promise<void> {
  await prisma.siteEra.deleteMany({ where: { id } });
  void invalidateCached(KEY);
}
