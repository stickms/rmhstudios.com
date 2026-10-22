// Time the tag RSS feed query for a hot, mid and rare tag, and print the SQL Prisma runs.
// Usage: tsx --env-file=.env scripts/perf-ws6/rss-tag-bench.mts
/* eslint-disable no-console */
import { performance } from 'node:perf_hooks';
import { prisma } from '@/lib/prisma.server';
import { tagFeedItems } from '@/lib/feed/rss.server';

const tags = ['tag1', 'tag2', 'tag317', 'nonexistent'];
for (const tag of tags) {
  await tagFeedItems(tag);
  const ms: number[] = [];
  for (let i = 0; i < 9; i++) {
    const t = performance.now();
    await tagFeedItems(tag);
    ms.push(performance.now() - t);
  }
  ms.sort((a, b) => a - b);
  console.log(`${tag.padEnd(12)} median ${ms[4].toFixed(1)} ms  max ${ms[8].toFixed(1)} ms`);
}
void prisma;
process.exit(0);
