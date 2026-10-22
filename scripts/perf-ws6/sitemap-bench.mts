/* eslint-disable no-console */
// Cold cost of one sitemap chunk, in-process against the seeded DB (npm run via tsx).
// SITEMAP_BENCH_MODE=after uses the batched-gzip path (bytes are then gzip bytes). Prints wall ms, rows, XML bytes, max event-loop stall, heap delta. Usage: tsx sitemap-bench.mts <section> <chunk> [runs]
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';

const [section = 'posts', chunkArg = '1', runsArg = '5'] = process.argv.slice(2);
const mod = await import('@/lib/sitemap.server');
const { renderUrlset } = await import('@/lib/sitemap');
let serve: typeof import('@/lib/sitemap-serve.server') | null = null;
if (process.env.SITEMAP_BENCH_MODE === 'after') serve = await import('@/lib/sitemap-serve.server');
const SITE = 'https://rmhstudios.com';
const chunk = Number(chunkArg);
const h = monitorEventLoopDelay({ resolution: 1 });
const rows: string[] = [];
for (let i = 0; i < Number(runsArg); i++) {
  global.gc?.();
  const heap0 = process.memoryUsage().heapUsed;
  h.reset();
  h.enable();
  const t = performance.now();
  let bytes = 0;
  let n = 0;
  if (serve) {
    serve.clearSitemapCache();
    const body = await serve.getSitemapBody(section, chunk);
    n = body?.entries ?? 0;
    bytes = body?.gzip.length ?? 0;
  } else {
    const entries = (await mod.renderSection(section, chunk)) ?? [];
    n = entries.length;
    bytes = Buffer.byteLength(renderUrlset(entries, SITE));
  }
  const ms = performance.now() - t;
  h.disable();
  rows.push(
    `run ${i} ${ms.toFixed(0)} ms  entries ${n}  bytes ${(bytes / 1e6).toFixed(2)} MB  loop max ${(h.max / 1e6).toFixed(0)} ms  p99 ${(h.percentile(99) / 1e6).toFixed(0)} ms  heap+ ${((process.memoryUsage().heapUsed - heap0) / 1e6).toFixed(0)} MB`,
  );
}
console.log(rows.join('\n'));
process.exit(0);
