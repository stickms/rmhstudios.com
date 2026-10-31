/**
 * How CI splits the match project across parallel jobs (.github/workflows/balatro-mp-tests.yml,
 * job `e2e-match`: one runner, one Postgres service and one stack per shard).
 *
 *   pnpm exec tsx testing/balatro-e2e/shards.ts <shard>   # prints that shard's files
 *   pnpm exec tsx testing/balatro-e2e/shards.ts --list    # prints the shard names
 *
 * Every match file belongs to exactly one shard, and the workflow's matrix lists exactly these
 * shard names: testing/balatro-e2e/lib/shards.unit.test.ts (the harness project) fails
 * otherwise, so a new match file can never silently drop out of CI. Balance by the timings in
 * the comments (turbo on, tests only, measured on a loaded 4-core machine); a shard should
 * stay under ~8 minutes of tests so the whole job, setup included, stays under ~12.
 */
import path from 'node:path';

export const MATCH_DIR = 'testing/balatro-e2e/match';

export const MATCH_SHARDS: Record<string, string[]> = {
  // E2E-01, 02, 10, 08/23, 11 (two real browsers) ~4 min; E2E-24, the 12-ante soak, ~2 min
  'nemesis-soak': ['nemesis.test.ts', 'soak.test.ts'],
  // E2E-12, 14, 21, 15 (two real browsers: drop, reload-rejoin, kick, relay) ~6 min
  'nemesis-resilience': ['nemesis-resilience.test.ts'],
  // E2E-04, 05, 06, 07, 20 (one browser + bots) ~3.5 min; E2E-19 spectate/replay; the smoke
  'formats-spectate': ['formats.test.ts', 'spectate-replay.test.ts', 'smoke.test.ts'],
  // E2E-13 host migration, E2E-22 (1 + 15 bots, migration in the large room) ~7.5 min
  migration: ['host-migration.test.ts', 'large.test.ts'],
  // E2E-16 practice (every ruleset), E2E-17/18 + LOB-04 (queue, party, invite link) ~6 min
  'practice-queue': ['practice.test.ts', 'queue.test.ts'],
};

export function shardFiles(name: string): string[] {
  const files = MATCH_SHARDS[name];
  if (!files)
    throw new Error(`unknown match shard ${name} (known: ${Object.keys(MATCH_SHARDS).join(', ')})`);
  return files.map((f) => path.posix.join(MATCH_DIR, f));
}

if (process.argv[1] && /shards\.ts$/.test(process.argv[1])) {
  const arg = process.argv[2] ?? '';
  if (arg === '--list') process.stdout.write(`${Object.keys(MATCH_SHARDS).join('\n')}\n`);
  else process.stdout.write(`${shardFiles(arg).join(' ')}\n`);
}
