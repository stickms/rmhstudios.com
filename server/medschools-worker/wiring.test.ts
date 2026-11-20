/**
 * The medschools-worker is a process with no import graph pointing at it: it only exists if every
 * build, compose and deploy list names it. This pins those lists as text, the way the other
 * wiring contracts in this repo do, so a rename or a half-applied edit fails here and not in prod.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  describe,
  expect,
  it,
} from 'vitest';

const root =
  join(
    __dirname,
    '..',
    '..',
  );
const read =
  (
    p: string,
  ) =>
    readFileSync(
      join(
        root,
        p,
      ),
      'utf8',
    );

describe('medschools-worker wiring', () => {
  it('package.json runs it in dev, build and start', () => {
    const scripts =
      (
        JSON.parse(
          read(
            'package.json',
          ),
        ) as {
          scripts: Record<
            string,
            string
          >;
        }
      )
        .scripts;
    const dev =
      scripts[
        'medschools-worker:dev'
      ] ??
      '';
    expect(
      dev,
    ).toContain(
      'server/medschools-worker/index.ts',
    );
    expect(
      dev,
    ).toContain(
      'features/medschools',
    );
    for (const name of [
      'dev',
      'build',
      'start',
    ]) {
      expect(
        scripts[
          name
        ],
        name,
      ).toContain(
        'medschools-worker',
      );
    }
  });

  it('the Dockerfile bundles it and asserts the output exists', () => {
    const dockerfile =
      read(
        'Dockerfile',
      );
    expect(
      dockerfile,
    ).toContain(
      'server/medschools-worker/index.ts',
    );
    expect(
      dockerfile,
    ).toContain(
      'test -f dist-server/server/medschools-worker/index.cjs',
    );
  });

  it('docker-compose.yml declares a small service for it', () => {
    const compose =
      read(
        'docker-compose.yml',
      );
    const start =
      compose.indexOf(
        '\n  medschools-worker:',
      );
    expect(
      start,
    ).toBeGreaterThan(
      -1,
    );
    const rest =
      compose.slice(
        start +
          1,
      );
    const next =
      rest
        .slice(
          1,
        )
        .search(
          /\n {2}[a-z][\w-]*:/,
        );
    const block =
      next ===
      -1
        ? rest
        : rest.slice(
            0,
            next +
              1,
          );
    expect(
      block,
    ).toMatch(
      /mem_limit:\s*512m/,
    );
    expect(
      block,
    ).toMatch(
      /cpus:\s*0\.5/,
    );
    expect(
      block,
    ).toContain(
      'DATABASE_POOL_SIZE=3',
    );
    expect(
      block,
    ).toContain(
      "command: ['node', 'dist-server/server/medschools-worker/index.cjs']",
    );
  });

  it('deploy.sh watches it for a crash-loop', () => {
    const line =
      read(
        'deploy.sh',
      )
        .split(
          '\n',
        )
        .find(
          (
            l,
          ) =>
            l.startsWith(
              'WORKER_SERVICES=',
            ),
        );
    expect(
      line,
    ).toContain(
      'medschools-worker',
    );
  });

  it('the connection budget counts it and .env.example documents its settings', () => {
    expect(
      read(
        'scripts/db-connection-budget.mjs',
      ),
    ).toContain(
      'medschools-worker',
    );
    const env =
      read(
        '.env.example',
      );
    for (const name of [
      'MEDSCHOOLS_CYCLETRACK_ENABLED',
      'MEDSCHOOLS_CYCLETRACK_CRON',
      'MEDSCHOOLS_DEDUPE_SECRET',
      'MEDSCHOOLS_SHUTDOWN_DEADLINE_MS',
    ]) {
      expect(
        env,
        name,
      ).toContain(
        name,
      );
    }
  });

  it('index.ts schedules through pg-boss, not a private timer', () => {
    const src =
      read(
        'server/medschools-worker/index.ts',
      );
    expect(
      src,
    ).toContain(
      'startScheduledConsumer',
    );
    expect(
      src,
    ).toContain(
      'medschools.cycletrack',
    );
    expect(
      src,
    ).toContain(
      'medschools.backfill',
    );
    expect(
      src,
    ).toContain(
      "'20 * * * *'",
    );
    expect(
      src,
    ).not.toContain(
      'setInterval(',
    );
    expect(
      src,
    ).not.toContain(
      'node-cron',
    );
  });

  it('the enabled flag gates the hourly tick, the bootstrap and the cron backfill; only a manual run bypasses it (R12)', () => {
    const src = read('server/medschools-worker/index.ts').replace(/\s+/g, ' ');
    const backfill = src.slice(
      src.indexOf('const backfillTick'),
      src.indexOf('// ─── Startup bootstrap'),
    );
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
});
