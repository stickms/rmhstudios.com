// Prisma relationLoadStrategy 'query' (default) vs 'join' for the sitemap posts page.
// Usage: tsx scripts/perf-ws6/sitemap-query-bench.mts [skip] [runs]
/* eslint-disable no-console */
import { performance } from 'node:perf_hooks';
import { prisma } from '@/lib/prisma.server';
import { PUBLIC_POST_WHERE } from '@/lib/feed/rss.server';

const skip = Number(process.argv[2] ?? 0);
const runs = Number(process.argv[3] ?? 7);
const where = {
  ...PUBLIC_POST_WHERE,
  originalId: null,
  user: { handle: { not: null }, isBot: false },
};
let last = performance.now();
let worst = 0;
setInterval(() => {
  const n = performance.now();
  worst = Math.max(worst, n - last - 2);
  last = n;
}, 2);
async function run(strategy: 'query' | 'join') {
  worst = 0;
  const t = performance.now();
  const rows = await prisma.rMHark.findMany({
    relationLoadStrategy: strategy,
    where,
    select: { id: true, updatedAt: true, user: { select: { handle: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    skip,
    take: 40_000,
  });
  return { ms: performance.now() - t, n: rows.length, stall: worst };
}
await run('query');
for (const s of ['query', 'join', 'query', 'join'] as const) {
  const ms: number[] = [];
  const stalls: number[] = [];
  let n = 0;
  for (let i = 0; i < runs; i++) {
    const r = await run(s);
    ms.push(r.ms);
    stalls.push(r.stall);
    n = r.n;
  }
  ms.sort((a, b) => a - b);
  console.log(
    `${s.padEnd(5)} skip=${skip} rows=${n} median=${ms[Math.floor(ms.length / 2)].toFixed(0)}ms min=${ms[0].toFixed(0)}ms event-loop stall max=${Math.max(...stalls).toFixed(0)}ms`,
  );
}
process.exit(0);
