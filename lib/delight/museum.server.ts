/** Z3 — site museum: admin-edited eras, public read. */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import type { z } from 'zod';
import type { eraSchema } from '@/lib/delight/schema';

const KEY = 'delight:museum';
const select = { id: true, eraDate: true, title: true, body: true, imageUrl: true } as const;

export async function listEras() {
  const hit = apiCache.get<Awaited<ReturnType<typeof load>>>(KEY);
  if (hit) return hit;
  const rows = await load();
  apiCache.set(KEY, rows, 5 * 60_000);
  return rows;
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
  apiCache.invalidate(KEY);
  return row;
}

export async function updateEra(id: string, i: EraInput): Promise<boolean> {
  const res = await prisma.siteEra.updateMany({ where: { id }, data: data(i) });
  apiCache.invalidate(KEY);
  return res.count > 0;
}

export async function deleteEra(id: string): Promise<void> {
  await prisma.siteEra.deleteMany({ where: { id } });
  apiCache.invalidate(KEY);
}
