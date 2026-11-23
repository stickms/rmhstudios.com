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
    // The worker inlines its seed JSON at bundle time, so the builder stage must copy every file it imports.
    for (const f of ['sdn-aliases.json', 'sdn-forums.json']) expect(dockerfile, f).toContain(`data/medschools/${f}`);
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
    // lib/prisma.server (the AI metering pool) is sized here; the worker's own client is fixed at 3 in index.ts.
    expect(block).toContain('DATABASE_POOL_SIZE=1');
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
      'MEDSCHOOLS_ADMIT_HISTORY_CRON',
      'MEDSCHOOLS_ADMIT_HISTORY_MAX_PROFILES',
      'MEDSCHOOLS_ADMIT_HISTORY_DAILY_PROFILES',
      'MEDSCHOOLS_ADMIT_DAILY_REQUESTS',
      'MEDSCHOOLS_SDN_FORUMS_DAILY_REQUESTS',
      'MEDSCHOOLS_SDN_WWW_DAILY_REQUESTS',
      'MEDSCHOOLS_CYCLETRACK_DAILY_REQUESTS',
      'MEDSCHOOLS_SDN_ENABLED',
      'MEDSCHOOLS_SDN_LIVE_CRON',
      'MEDSCHOOLS_SDN_BACKFILL_CRON',
      'MEDSCHOOLS_SDN_INTERVIEWS_CRON',
      'MEDSCHOOLS_SDN_MAX_LLM_CALLS',
      'MEDSCHOOLS_SDN_BACKFILL_MAX_LLM_CALLS',
      'MEDSCHOOLS_AI_MONTHLY_USD',
      'MEDSCHOOLS_ADMIT_FORUMS_ENABLED',
      'MEDSCHOOLS_ADMIT_FORUMS_CRON',
      'MEDSCHOOLS_ADMIT_FORUMS_MAX_REQUESTS',
      'MEDSCHOOLS_ADMIT_FORUMS_MAX_LLM_CALLS',
      'MEDSCHOOLS_ADMIT_FORUMS_DAILY_REQUESTS',
      'MEDSCHOOLS_ADMIT_FORUMS_AI_SHARE',
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
    expect(live).toContain('expireInSeconds: ADMIT_LIVE_EXPIRY_S');
    expect(src).toContain('const ADMIT_LIVE_EXPIRY_S = 20 * 60');
    expect(live).toContain('retryLimit: 0');
    expect(live).toContain('handler: admitLiveTick');
    const iv = slice(src, 'interviewsConsumer = await startScheduledConsumer', 'Started');
    expect(iv).toContain('queue: INTERVIEWS_QUEUE');
    expect(iv).toContain('expireInSeconds: INTERVIEWS_EXPIRY_S');
    expect(src).toContain('const INTERVIEWS_EXPIRY_S = 3 * 60 * 60');
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

  it('shutdown pauses all seven consumers, waits on the shared in-flight set and stops the shared pg-boss once', () => {
    const src = flat();
    const sd = src.slice(src.indexOf('async function shutdown'));
    for (const c of [
      'cycletrackConsumer',
      'backfillConsumer',
      'admitLiveConsumer',
      'interviewsConsumer',
      'sdnLiveConsumer',
      'sdnBackfillConsumer',
      'sdnInterviewsConsumer',
    ]) {
      expect(sd, c).toContain(`${c}?.pause()`);
    }
    expect(sd).toContain('Promise.allSettled( [ ...inFlight');
  });

  it('registers the three SDN queues through startScheduledConsumer with their default crons and expiries', () => {
    const src = flat();
    expect(src).toContain("const SDN_LIVE_QUEUE = 'medschools.sdn-live'");
    expect(src).toContain("const SDN_BACKFILL_QUEUE = 'medschools.sdn-backfill'");
    expect(src).toContain("const SDN_INTERVIEWS_QUEUE = 'medschools.sdn-interviews'");
    expect(src).toContain("process.env.MEDSCHOOLS_SDN_LIVE_CRON?.trim() || '20 12 * * *'");
    expect(src).toContain("process.env.MEDSCHOOLS_SDN_BACKFILL_CRON?.trim() || '15 0 1 * *'");
    expect(src).toContain("process.env.MEDSCHOOLS_SDN_INTERVIEWS_CRON?.trim() || '50 5 * * 1'");
    const live = slice(src, 'sdnLiveConsumer = await startScheduledConsumer', 'sdnBackfillConsumer = await');
    expect(live).toContain('queue: SDN_LIVE_QUEUE');
    expect(live).toContain('expireInSeconds: 25 * 60');
    expect(live).toContain('retryLimit: 0');
    expect(live).toContain('handler: sdnLiveTick');
    const bf = slice(src, 'sdnBackfillConsumer = await startScheduledConsumer', 'sdnInterviewsConsumer = await');
    expect(bf).toContain('queue: SDN_BACKFILL_QUEUE');
    expect(bf).toContain('expireInSeconds: 3 * 60 * 60');
    expect(bf).toContain('retryLimit: 0');
    expect(bf).toContain('handler: sdnBackfillTick');
    const iv = slice(src, 'sdnInterviewsConsumer = await startScheduledConsumer', 'Started');
    expect(iv).toContain('queue: SDN_INTERVIEWS_QUEUE');
    expect(iv).toContain('expireInSeconds: 60 * 60');
    expect(iv).toContain('retryLimit: 0');
    expect(iv).toContain('handler: sdnInterviewsTick');
  });

  it('all three SDN ticks are guarded() and call sdnGate: the flag first (manual bypasses), then the secret (never bypassed)', () => {
    const src = flat();
    expect(src).toContain("const SDN_ENABLED = process.env.MEDSCHOOLS_SDN_ENABLED !== 'false'");
    const gate = slice(src, 'function sdnGate', 'const sdnLiveTick');
    expect(gate).toContain('!SDN_ENABLED && data.manual !== true');
    expect(gate.indexOf('SDN_ENABLED')).toBeLessThan(gate.indexOf('secretOk()'));
    expect(gate).not.toMatch(/secretOk\(\)[^}]*manual/);
    expect(gate).toContain('log.error(');
    const live = slice(src, 'const sdnLiveTick', 'const sdnBackfillTick');
    const bf = slice(src, 'const sdnBackfillTick', 'const sdnInterviewsTick');
    const iv = slice(src, 'const sdnInterviewsTick', '// ─── Startup bootstrap');
    expect(live).toContain("guarded('sdn-live'");
    expect(bf).toContain("guarded('sdn-backfill'");
    expect(iv).toContain("guarded('sdn-interviews'");
    expect(live.indexOf("sdnGate('sdn-live'")).toBeLessThan(live.indexOf('runSdnLive('));
    expect(bf.indexOf("sdnGate('sdn-backfill'")).toBeLessThan(bf.indexOf('runSdnBackfill('));
    expect(iv.indexOf("sdnGate('sdn-interviews'")).toBeLessThan(iv.indexOf('runSdnInterviews('));
    // The SDN ticks never run for CycleTrack's flag, and CycleTrack's ticks never read the SDN flag.
    expect(slice(src, 'const cycletrackTick', 'const backfillTick')).not.toContain('SDN_ENABLED');
  });

  it('SDN forums and www get separate polite hosts; live and backfill share the forums host; none is the Admit or CycleTrack host', () => {
    const src = flat();
    expect(src.match(/createPoliteHost\(SOURCES\.SDN_FORUMS/g)).toHaveLength(1);
    expect(src.match(/createPoliteHost\(SOURCES\.SDN_WWW/g)).toHaveLength(1);
    const live = slice(src, 'const sdnLiveTick', 'const sdnBackfillTick');
    const bf = slice(src, 'const sdnBackfillTick', 'const sdnInterviewsTick');
    const iv = slice(src, 'const sdnInterviewsTick', '// ─── Startup bootstrap');
    expect(live).toContain('host: sdnForumsHost');
    expect(bf).toContain('host: sdnForumsHost');
    expect(iv).toContain('host: sdnWwwHost');
    for (const t of [live, bf, iv]) {
      expect(t).not.toContain('cycletrackHost');
      expect(t).not.toContain('admitHost');
    }
  });

  it('the SDN ticks build the AI once with the budget gate, cap and per-run call limits from env', () => {
    const src = flat();
    expect(src.match(/createSdnAi\(\)/g)).toHaveLength(1);
    expect(src.match(/createBudgetGate\(/g)).toHaveLength(1);
    expect(src).toContain('monthlyCapUsd(process.env.MEDSCHOOLS_AI_MONTHLY_USD,');
    expect(src).toContain('MEDSCHOOLS_SDN_MAX_LLM_CALLS');
    expect(src).toContain('MEDSCHOOLS_SDN_BACKFILL_MAX_LLM_CALLS');
    const live = slice(src, 'const sdnLiveTick', 'const sdnBackfillTick');
    const bf = slice(src, 'const sdnBackfillTick', 'const sdnInterviewsTick');
    for (const t of [live, bf]) {
      expect(t).toContain('ai: sdnAi');
      expect(t).toContain('budget: sdnBudget');
    }
    // The interviews job needs no model.
    expect(slice(src, 'const sdnInterviewsTick', '// ─── Startup bootstrap')).not.toContain('sdnAi');
  });

  it('the live tick queues a due backfill itself, after the run, only when running and not already in flight', () => {
    const src = flat();
    const live = slice(src, 'const sdnLiveTick', 'const sdnBackfillTick');
    expect(live).toContain('!stopping && !sdnBackfillInFlight && SDN_ENABLED');
    expect(live).toContain('sdnBackfillOwed(medPrisma, new Date(), sdnAi.configured())');
    expect(live).toContain('sdnBackfillConsumer?.runNow()');
    expect(live.indexOf('runSdnLive(')).toBeLessThan(live.indexOf('sdnBackfillOwed('));
    // The queued run is a cron-style run: the flag still applies to it (no manual marker).
    expect(live).not.toContain('manual: true');
    const bf = slice(src, 'const sdnBackfillTick', 'const sdnInterviewsTick');
    expect(bf).toContain('sdnBackfillInFlight = true');
    expect(bf).toContain('sdnBackfillInFlight = false');
  });

  it('bootstrap seeds the SDN aliases and ignored stems in their own try/catch, ungated, logs skipped and unmatched, queues no SDN run', () => {
    const src = flat();
    const boot = slice(src, 'async function bootstrap()', '// ─── Scheduler');
    expect(boot).toContain('seedSdnAliases(');
    expect(boot).toContain('seedSdnIgnoredMisses(');
    expect(boot).toContain('sdn.skipped.length > 0');
    expect(boot).toContain('sdn.unmatched');
    expect(boot).not.toContain('SDN_ENABLED');
    expect(boot).not.toContain('sdnLiveConsumer');
    expect(boot).not.toContain('sdnBackfillConsumer');
    expect(boot).not.toContain('sdnInterviewsConsumer');
    const seedAt = boot.indexOf('seedSdnAliases(');
    const tryAt = boot.lastIndexOf('try {', seedAt);
    const catchAt = boot.indexOf('} catch (e) {', seedAt);
    // Apart from the Admit seed's own try/catch.
    expect(tryAt).toBeGreaterThan(boot.indexOf('} catch (e) {', boot.indexOf('seedAdmitAliases(')));
    expect(boot.slice(catchAt, catchAt + 120)).toContain('log.error(');
    expect(boot.indexOf('return ( CYCLETRACK_ENABLED')).toBeGreaterThan(catchAt);
    const main = slice(src, 'if ( backfillDue )', 'main().catch');
    expect(main).not.toContain('sdn');
  });

  it('startup names the missing secret for the SDN jobs and the missing AI key without exiting', () => {
    const src = flat();
    const main = src.slice(src.indexOf('async function main()'));
    const startup = main.slice(0, main.indexOf('const backfillDue'));
    expect(startup).toContain('sdn-live, sdn-backfill, sdn-interviews');
    expect(startup).toContain('sdnAi.configured()');
    expect(startup).not.toContain('process.exit');
  });

  it('shutdown stops the shared pg-boss once', () => {
    const src = flat();
    const sd = src.slice(src.indexOf('async function shutdown'));
    expect(sd.match(/\.stop\(\)/g)).toHaveLength(1);
  });

  it('registers medschools.rmh-publish (the daily public snapshot) as an exclusive pg-boss queue, off its own tick', () => {
    const src = flat();
    expect(src).toContain("const RMH_PUBLISH_QUEUE = 'medschools.rmh-publish'");
    expect(src).toContain('queue: RMH_PUBLISH_QUEUE, cron: RMH_PUBLISH_CRON');
    expect(src).toContain('handler: rmhPublishTick');
    expect(src).toContain('rmhPublishConsumer?.pause()');
    expect(read('features/medschools/scrape/run-rmh-publish.ts')).toContain("RMH_PUBLISH_CRON = '5 0 * * *'");
  });

  it('registers medschools.admit-history as its own exclusive queue with a daily off-peak cron, behind the Admit gate', () => {
    const src = flat();
    expect(src).toContain("const ADMIT_HISTORY_QUEUE = 'medschools.admit-history'");
    expect(src).toContain("process.env.MEDSCHOOLS_ADMIT_HISTORY_CRON?.trim() || '10 3 * * *'");
    expect(src).toContain('const ADMIT_HISTORY_EXPIRY_S = 3 * 60 * 60');
    const reg = slice(src, 'admitHistoryConsumer = await startScheduledConsumer', 'sdnLiveConsumer = await');
    expect(reg).toContain('queue: ADMIT_HISTORY_QUEUE');
    expect(reg).toContain('expireInSeconds: ADMIT_HISTORY_EXPIRY_S');
    expect(reg).toContain('retryLimit: 0');
    expect(reg).toContain('handler: admitHistoryTick');
    const tick = slice(src, 'const admitHistoryTick', 'const sdnLiveTick');
    expect(tick).toContain("guarded( 'admit-history'");
    expect(tick).toContain('host: admitHost');
    expect(tick.indexOf("admitGate('admit-history'")).toBeLessThan(tick.indexOf('runAdmitHistory('));
    expect(tick).toContain('ADMIT_HISTORY_EXPIRY_S * 1000');
    // it is paused at shutdown with the others
    expect(src.slice(src.indexOf('async function shutdown'))).toContain('admitHistoryConsumer?.pause()');
  });

  it('the history backfill is queued at start while it is owed, only when Admit is enabled and the secret is set', () => {
    const src = flat();
    const main = src.slice(src.indexOf('async function main()'));
    const at = main.indexOf('admitHistoryOwed(');
    expect(at).toBeGreaterThan(-1);
    const before = main.slice(Math.max(0, at - 160), at);
    expect(before).toContain('ADMIT_ENABLED && secretOk()');
    expect(main.slice(at, at + 260)).toContain('admitHistoryConsumer.runNow(');
    const boot = slice(src, 'async function bootstrap()', '// ─── Scheduler');
    expect(boot).not.toContain('admitHistoryConsumer');
  });

  it('the Admit ticks use the shared overlap guard with their queue expiry as the hang limit; the run ends itself earlier', () => {
    const src = flat();
    expect(src).toContain("import { createGuard } from './guard'");
    expect(src).toContain('const guarded = createGuard(');
    expect(slice(src, 'const admitLiveTick', 'const interviewsTick')).toContain('ADMIT_LIVE_EXPIRY_S * 1000');
    expect(slice(src, 'const interviewsTick', 'const admitHistoryTick')).toContain('INTERVIEWS_EXPIRY_S * 1000');
    expect(slice(src, 'const interviewsTick', 'const admitHistoryTick')).toContain(
      'shouldStop: stopAfter(INTERVIEWS_RUN_DEADLINE_MS)',
    );
    // 150 min run deadline < 180 min expiry
    expect(src).toContain('const INTERVIEWS_RUN_DEADLINE_MS = 150 * 60_000');
  });

  it('the interviews tick logs when it starts, before the gate', () => {
    const iv = slice(flat(), 'const interviewsTick', 'const admitHistoryTick');
    expect(iv.indexOf('interviews tick starting')).toBeGreaterThan(-1);
    expect(iv.indexOf('interviews tick starting')).toBeLessThan(iv.indexOf("admitGate('interviews'"));
  });

  it('every polite host gets a persisted daily budget; the Admit jobs share one host and the history job has its own quota', () => {
    const src = flat();
    expect(src).toContain('createDailyBudget(medPrisma, host,');
    for (const h of ['CYCLETRACK', 'ADMIT', 'SDN_FORUMS', 'SDN_WWW'])
      expect(src, h).toContain(`SOURCES.${h}, { budget: hostBudget('${h}') }`);
    expect(src.match(/createPoliteHost\( SOURCES\.ADMIT/g)).toHaveLength(1);
    expect(src).toContain("createDailyBudget(medPrisma, 'ADMIT:history'");
    expect(slice(src, 'const admitHistoryTick', 'const sdnLiveTick')).toContain('quota: admitHistoryQuota');
  });

  it('registers medschools.admit-forums as its own exclusive queue, every 3 hours, behind the Admit gate and its own flag', () => {
    const src = flat();
    expect(src).toContain("const ADMIT_FORUMS_QUEUE = 'medschools.admit-forums'");
    expect(src).toContain("process.env.MEDSCHOOLS_ADMIT_FORUMS_CRON?.trim() || '0 */3 * * *'");
    expect(src).toContain('const ADMIT_FORUMS_EXPIRY_S = 40 * 60');
    const reg = slice(src, 'admitForumsConsumer = await startScheduledConsumer', 'log.info( `Started');
    expect(reg).toContain('queue: ADMIT_FORUMS_QUEUE');
    expect(reg).toContain('expireInSeconds: ADMIT_FORUMS_EXPIRY_S');
    expect(reg).toContain('retryLimit: 0');
    expect(reg).toContain('handler: admitForumsTick');
    const tick = slice(src, 'const admitForumsTick', 'const sdnLiveTick');
    expect(tick).toContain("guarded( 'admit-forums'");
    expect(tick).toContain('host: admitHost');
    expect(tick).toContain('ADMIT_FORUMS_ENABLED && data.manual !== true');
    expect(tick.indexOf("admitGate('admit-forums'")).toBeLessThan(tick.indexOf('runAdmitForums('));
    expect(tick).toContain('ADMIT_FORUMS_EXPIRY_S * 1000');
    expect(tick).toContain('quota: admitForumsQuota');
    // the run ends itself (30 min) before its queue expires (40 min)
    expect(tick).toContain('stopAfter(ADMIT_FORUMS_RUN_DEADLINE_MS)');
    expect(src).toContain('const ADMIT_FORUMS_RUN_DEADLINE_MS = 30 * 60_000');
    expect(src.slice(src.indexOf('async function shutdown'))).toContain('admitForumsConsumer?.pause()');
  });

  it('the forums job keeps its own model budget share and its own request quota on the shared Admit host', () => {
    const src = flat();
    expect(src).toContain('createSdnAi(ADMIT_FORUMS_PROMPT_ID)');
    expect(src).toContain('createForumsBudgetGate(');
    expect(src).toContain('forumsAiShare(process.env.MEDSCHOOLS_ADMIT_FORUMS_AI_SHARE');
    expect(src).toContain("createDailyBudget(medPrisma, 'ADMIT:forums'");
    expect(src.match(/createPoliteHost\( SOURCES\.ADMIT/g)).toHaveLength(1);
  });
});
