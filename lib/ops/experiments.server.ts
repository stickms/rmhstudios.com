import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { assignVariant, significance, type Variant } from './schema';

const RUNNING_KEY = 'ops:experiments:running';

interface Running {
  id: string;
  key: string;
  testPct: number;
}

/** The one cached read: every running experiment, refreshed at most every 60s. */
async function running(): Promise<Running[]> {
  const hit = apiCache.get<Running[]>(RUNNING_KEY);
  if (hit) return hit;
  const rows = await prisma.experiment.findMany({
    where: { status: 'RUNNING' },
    select: { id: true, key: true, testPct: true },
    take: 50,
  });
  apiCache.set(RUNNING_KEY, rows, 60_000);
  return rows;
}

/** key -> variant for this member across all running experiments (pure hash, no per-user read). */
export async function assignmentsFor(userId: string): Promise<Record<string, Variant>> {
  const out: Record<string, Variant> = {};
  for (const e of await running()) out[e.key] = assignVariant(userId, e.key, e.testPct);
  return out;
}

export async function recordExperimentEvent(
  userId: string,
  key: string,
  event: 'expose' | 'convert',
): Promise<boolean> {
  const exp = (await running()).find((e) => e.key === key);
  if (!exp) return false;
  const variant = assignVariant(userId, key, exp.testPct);
  if (event === 'expose') {
    await prisma.experimentExposure.createMany({
      data: [{ experimentId: exp.id, userId, variant }],
      skipDuplicates: true,
    });
  } else {
    // A conversion only counts for a member who was exposed first.
    await prisma.experimentExposure.updateMany({
      where: { experimentId: exp.id, userId, convertedAt: null },
      data: { convertedAt: new Date() },
    });
  }
  return true;
}

export async function listExperiments() {
  const exps = await prisma.experiment.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  const counts = await prisma.experimentExposure.groupBy({
    by: ['experimentId', 'variant'],
    where: { experimentId: { in: exps.map((e) => e.id) } },
    _count: { _all: true, convertedAt: true },
  });
  return exps.map((e) => {
    const arm = (v: string) => {
      const c = counts.find((x) => x.experimentId === e.id && x.variant === v);
      return { exposed: c?._count._all ?? 0, converted: c?._count.convertedAt ?? 0 };
    };
    const control = arm('control');
    const test = arm('test');
    return {
      id: e.id,
      key: e.key,
      name: e.name,
      status: e.status,
      testPct: e.testPct,
      control,
      test,
      result: significance(control, test),
    };
  });
}

export async function createExperiment(input: { key: string; name: string; testPct: number }) {
  return prisma.experiment.create({ data: input });
}

export async function updateExperiment(
  id: string,
  patch: { status?: 'DRAFT' | 'RUNNING' | 'STOPPED'; testPct?: number },
): Promise<boolean> {
  const res = await prisma.experiment.updateMany({
    // Re-weighting a live experiment would move members between arms.
    where: patch.testPct ? { id, status: { not: 'RUNNING' } } : { id },
    data: {
      ...patch,
      ...(patch.status === 'RUNNING' ? { startedAt: new Date() } : {}),
    },
  });
  apiCache.invalidate(RUNNING_KEY);
  return res.count > 0;
}
