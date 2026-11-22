/**
 * The medschools-worker is a process with no import graph pointing at it: it only exists if every
 * build, compose and deploy list names it. This pins those lists as text, the way the other
 * wiring contracts in this repo do, so a rename or a half-applied edit fails here and not in prod.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('medschools-worker wiring', () => {
  it('package.json runs it in dev, build and start', () => {
    const scripts = (
      JSON.parse(read('package.json')) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    const dev = scripts['medschools-worker:dev'] ?? '';
    expect(dev).toContain('server/medschools-worker/index.ts');
    expect(dev).toContain('features/medschools');
    for (const name of ['dev', 'build', 'start']) {
      expect(scripts[name], name).toContain('medschools-worker');
    }
  });

  it('the Dockerfile bundles it and asserts the output exists', () => {
    const dockerfile = read('Dockerfile');
    expect(dockerfile).toContain('server/medschools-worker/index.ts');
    expect(dockerfile).toContain('test -f dist-server/server/medschools-worker/index.cjs');
  });

  it('docker-compose.yml declares a small service for it', () => {
    const compose = read('docker-compose.yml');
    const start = compose.indexOf('\n  medschools-worker:');
    expect(start).toBeGreaterThan(-1);
    const rest = compose.slice(start + 1);
    const next = rest.slice(1).search(/\n {2}[a-z][\w-]*:/);
    const block = next === -1 ? rest : rest.slice(0, next + 1);
    expect(block).toMatch(/mem_limit:\s*512m/);
    expect(block).toMatch(/cpus:\s*0\.5/);
    expect(block).toContain('DATABASE_POOL_SIZE=3');
    expect(block).toContain("command: ['node', 'dist-server/server/medschools-worker/index.cjs']");
  });

  it('deploy.sh watches it for a crash-loop', () => {
    const line = read('deploy.sh')
      .split('\n')
      .find((l) => l.startsWith('WORKER_SERVICES='));
    expect(line).toContain('medschools-worker');
  });

  it('the connection budget counts it and .env.example documents its settings', () => {
    expect(read('scripts/db-connection-budget.mjs')).toContain('medschools-worker');
    const env = read('.env.example');
    for (const name of [
      'MEDSCHOOLS_CYCLETRACK_ENABLED',
      'MEDSCHOOLS_CYCLETRACK_CRON',
      'MEDSCHOOLS_DEDUPE_SECRET',
      'MEDSCHOOLS_SHUTDOWN_DEADLINE_MS',
      'MEDSCHOOLS_ADMIT_ENABLED',
      'MEDSCHOOLS_ADMIT_LIVE_CRON',
      'MEDSCHOOLS_INTERVIEWS_CRON',
    ]) {
      expect(env, name).toContain(name);
    }
  });

  it('index.ts schedules through pg-boss, not a private timer', () => {
    const src = read('server/medschools-worker/index.ts');
    expect(src).toContain('startScheduledConsumer');
    expect(src).toContain('medschools.cycletrack');
    expect(src).toContain('medschools.backfill');
    expect(src).toContain("'20 * * * *'");
    expect(src).not.toContain('setInterval(');
    expect(src).not.toContain('node-cron');
  });

  it('the enabled flag gates the hourly tick, the bootstrap and the cron backfill; only a manual run bypasses it (R12)', () => {
    const src = read('server/medschools-worker/index.ts').replace(/\s+/g, ' ');
    const backfill = src.slice(src.indexOf('const backfillTick'), src.indexOf('// ─── Startup bootstrap'));
    expect(backfill).toContain('runBackfill');
    expect(backfill).toContain('!CYCLETRACK_ENABLED && data.manual !== true ) return;');
    const hourly = src.slice(src.indexOf('const cycletrackTick'), src.indexOf('const backfillTick'));
    expect(hourly).toContain('!CYCLETRACK_ENABLED');
    expect(src).toContain('CYCLETRACK_ENABLED && !stopping && (await needsBackfill');
  });

  it('the hourly tick queues a due backfill itself, and bootstrap queues only the hourly run', () => {
    const src = read('server/medschools-worker/index.ts').replace(/\s+/g, ' ');
    const hourly = src.slice(src.indexOf('const cycletrackTick'), src.indexOf('const backfillTick'));
    expect(hourly).toContain('!stopping && !backfillInFlight');
    expect(hourly).toContain('await needsBackfill( medPrisma, )');
    expect(hourly).toContain('backfillConsumer?.runNow()');
    // Order matters: the check comes after the run, and only when the flag let the run happen.
    expect(hourly.indexOf('runCycletrack')).toBeLessThan(hourly.indexOf('needsBackfill'));
    const main = src.slice(src.indexOf('if ( backfillDue )'));
    expect(main).toContain('cycletrackConsumer.runNow()');
    expect(main).not.toContain('backfillConsumer.runNow()');
  });

  const flat = () => read('server/medschools-worker/index.ts').replace(/\s+/g, ' ');
  const slice = (src: string, from: string, to: string) =>
    src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));

  it('registers medschools.admit-live and medschools.interviews through startScheduledConsumer with their default crons', () => {
    const src = flat();
    expect(src).toContain("const ADMIT_LIVE_QUEUE = 'medschools.admit-live'");
    expect(src).toContain("const INTERVIEWS_QUEUE = 'medschools.interviews'");
    expect(src).toContain("process.env.MEDSCHOOLS_ADMIT_LIVE_CRON?.trim() || '*/5 * * * *'");
    expect(src).toContain("process.env.MEDSCHOOLS_INTERVIEWS_CRON?.trim() || '35 4 * * *'");
    const live = slice(src, 'admitLiveConsumer = await startScheduledConsumer', 'interviewsConsumer = await');
    expect(live).toContain('queue: ADMIT_LIVE_QUEUE');
    expect(live).toContain('expireInSeconds: 20 * 60');
    expect(live).toContain('retryLimit: 0');
    expect(live).toContain('handler: admitLiveTick');
    const iv = slice(src, 'interviewsConsumer = await startScheduledConsumer', 'Started');
    expect(iv).toContain('queue: INTERVIEWS_QUEUE');
    expect(iv).toContain('expireInSeconds: 3 * 60 * 60');
    expect(iv).toContain('retryLimit: 0');
    expect(iv).toContain('handler: interviewsTick');
  });

  it('both Admit ticks are guarded() and check ADMIT_ENABLED, then the secret, before running; only manual bypasses the flag', () => {
    const src = flat();
    expect(src).toContain("const ADMIT_ENABLED = process.env.MEDSCHOOLS_ADMIT_ENABLED !== 'false'");
    expect(src).toContain("(process.env.MEDSCHOOLS_DEDUPE_SECRET ?? '').length >= 16");
    const gate = slice(src, 'function admitGate', 'const admitLiveTick');
    expect(gate).toContain('!ADMIT_ENABLED && data.manual !== true');
    expect(gate.indexOf('ADMIT_ENABLED')).toBeLessThan(gate.indexOf('secretOk()'));
    // The secret is never bypassed, manual or not.
    expect(gate).not.toMatch(/secretOk\(\)[^}]*manual/);
    expect(gate).toContain('log.error(');
    const live = slice(src, 'const admitLiveTick', 'const interviewsTick');
    const iv = slice(src, 'const interviewsTick', '// ─── Startup bootstrap');
    expect(live).toContain("guarded( 'admit-live'");
    expect(iv).toContain("guarded( 'interviews'");
    expect(live.indexOf('admitGate(')).toBeLessThan(live.indexOf('runAdmitLive('));
    expect(iv.indexOf('admitGate(')).toBeLessThan(iv.indexOf('runAdmitInterviews('));
  });

  it('a missing secret logs an error and the CycleTrack tick still runs', () => {
    const src = flat();
    const cycletrack = slice(src, 'const cycletrackTick', 'const backfillTick');
    const backfill = slice(src, 'const backfillTick', 'function admitGate');
    expect(cycletrack).not.toContain('secretOk');
    expect(backfill).not.toContain('secretOk');
    const main = src.slice(src.indexOf('async function main()'));
    const startup = main.slice(0, main.indexOf('const backfillDue'));
    expect(startup).toContain('if (!secretOk())');
    expect(startup).toContain('log.error(');
    expect(startup).toContain('CycleTrack is unaffected');
    expect(startup).not.toContain('process.exit');
  });

  it('one admitHost, separate from the CycleTrack host, serves both Admit ticks', () => {
    const src = flat();
    expect(src.match(/createPoliteHost\( SOURCES\.ADMIT/g)).toHaveLength(1);
    const live = slice(src, 'const admitLiveTick', 'const interviewsTick');
    const iv = slice(src, 'const interviewsTick', '// ─── Startup bootstrap');
    expect(live).toContain('host: admitHost');
    expect(iv).toContain('host: admitHost');
    expect(live).not.toContain('cycletrackHost');
    expect(iv).not.toContain('cycletrackHost');
  });

  it('bootstrap seeds Admit aliases and warns with the skipped pairs; it queues no Admit run', () => {
    const src = flat();
    const boot = slice(src, 'async function bootstrap()', '// ─── Scheduler');
    expect(boot).toContain('seedAdmitAliases(');
    expect(boot).toContain('admit.skipped.length > 0');
    expect(boot).toContain('log.warn(');
    expect(boot).toContain('admit.skipped.map');
    expect(boot).not.toContain('admitLiveConsumer');
    // The Admit seed sits in its own try/catch, before and apart from the backfill-due return.
    const seedAt = boot.indexOf('seedAdmitAliases(');
    const tryAt = boot.lastIndexOf('try {', seedAt);
    const catchAt = boot.indexOf('} catch (e) {', seedAt);
    expect(tryAt).toBeGreaterThan(boot.indexOf('seedRegistryIfEmpty('));
    expect(catchAt).toBeGreaterThan(seedAt);
    expect(boot.slice(catchAt, catchAt + 120)).toContain('log.error(');
    expect(boot.indexOf('return ( CYCLETRACK_ENABLED')).toBeGreaterThan(catchAt);
    expect(boot).not.toContain('interviewsConsumer');
  });

  it('shutdown pauses all four consumers and waits on the shared in-flight set', () => {
    const src = flat();
    const sd = src.slice(src.indexOf('async function shutdown'));
    for (const c of ['cycletrackConsumer', 'backfillConsumer', 'admitLiveConsumer', 'interviewsConsumer']) {
      expect(sd, c).toContain(`${c}?.pause()`);
    }
    expect(sd).toContain('Promise.allSettled( [ ...inFlight');
  });
});
