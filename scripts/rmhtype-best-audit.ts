/**
 * Read-only audit (sprint 12 17): how many RMHType profiles hold a `bestWpm` above `MAX_WPM`, the ceiling the server
 * now holds every ranked run to. Bests set before the check existed are not rewritten; this only counts them, so the
 * integration summary can say how many there are. It writes nothing.
 *
 *   pnpm exec tsx scripts/rmhtype-best-audit.ts
 */
import 'dotenv/config';
import { prisma } from '@/lib/prisma.server';
import { MAX_WPM } from '@/lib/rmhtype/typing-run';

const out = (line: string): void => void process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  const where = { bestWpm: { gt: MAX_WPM } };
  const [count, byDifficulty, top] = await Promise.all([
    prisma.rmhTypeProfile.count({ where }),
    prisma.rmhTypeProfile.groupBy({ by: ['difficulty'], where, _count: { _all: true } }),
    prisma.rmhTypeProfile.findMany({
      where,
      orderBy: { bestWpm: 'desc' },
      take: 10,
      select: { userId: true, difficulty: true, bestWpm: true, bestWpmAccuracy: true },
    }),
  ]);
  out(`RMHType profiles with bestWpm > ${MAX_WPM}: ${count}`);
  for (const row of byDifficulty) out(`  ${row.difficulty}: ${row._count._all}`);
  for (const row of top) out(`  top: ${row.userId} ${row.difficulty} ${row.bestWpm} at ${row.bestWpmAccuracy}%`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
