import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  DEFAULTS,
  MINIMUMS,
  ENV_NAMES,
  peakConnections,
  planPools,
} from '../../scripts/db-connection-budget.mjs';

/**
 * `scripts/db-connection-budget.mjs` is what keeps the fleet's Postgres pools
 * inside the server's real `max_connections`. The committed budget assumes the
 * tuned host (200), but applying that tuning is a manual root action the
 * sandboxed deploy cannot perform, so a stock host (100) runs a fleet whose
 * blue/green peak is 170 connections. Past the limit Postgres refuses new
 * connections outright ("sorry, too many clients already") and every service —
 * web, hubs, auth lookups — fails at once. This takes a deploy down in the most
 * literal sense, so the arithmetic is pinned here:
 *
 *  - a tuned host keeps today's pool sizes exactly (no silent throughput loss);
 *  - a stock host gets pools that fit, including the hotswap overlap;
 *  - pools only ever shrink, never grow past what the operator configured;
 *  - the defaults here are the ones docker-compose.yml actually starts with.
 */

const tuned = { maxConnections: 200, reserved: 3, webWorkers: 2, current: { ...DEFAULTS } };
const stock = { ...tuned, maxConnections: 100 };

describe('documented compose sum', () => {
  it('matches the arithmetic in docker-compose.yml (no Go supervisor pool since D3; the wiki since its MediaWiki move)', () => {
    // docker-compose.yml: 88 + 27 + 24 + 6 + 3 + (2 + 2 slack) + 10 + 8 (wiki)
    expect(peakConnections(DEFAULTS, 2)).toBe(170);
  });

  it('keeps the compose comment in step with the sum', () => {
    const compose = readFileSync(join(__dirname, '../../docker-compose.yml'), 'utf8');
    expect(compose).toContain('88 + 27 + 24 + 6 + 3 + 4 + 10 + 8 = 170');
    expect(compose).not.toContain('GO_DB_POOL_SIZE=');
  });

  it('counts as many wiki connections as the wiki image allows Apache workers', () => {
    const dockerfile = readFileSync(join(__dirname, '../../deploy/mediawiki/Dockerfile'), 'utf8');
    const script = readFileSync(join(__dirname, '../../scripts/db-connection-budget.mjs'), 'utf8');
    const workers = /MaxRequestWorkers (\d+)/.exec(dockerfile)?.[1];
    expect(workers).toBeDefined();
    expect(script).toContain(`const WIKI = ${workers};`);
  });
});

describe('planPools', () => {
  it('leaves a tuned 200-connection host exactly as configured', () => {
    const plan = planPools(tuned);
    expect(plan.changed).toBe(false);
    expect(plan.fits).toBe(true);
    expect(plan.pools).toEqual(DEFAULTS);
  });

  it('shrinks the pools to fit a stock 100-connection host, hotswap overlap included', () => {
    const plan = planPools(stock);
    expect(plan.before).toBeGreaterThan(plan.usable); // the bug: defaults do not fit
    expect(plan.changed).toBe(true);
    expect(plan.fits).toBe(true);
    expect(peakConnections(plan.pools, 2)).toBeLessThanOrEqual(97);
    for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
      expect(plan.pools[key]).toBeLessThanOrEqual(DEFAULTS[key]);
      expect(plan.pools[key]).toBeGreaterThanOrEqual(MINIMUMS[key]);
    }
  });

  it('subtracts PG16 reserved_connections as well as the superuser reserve', () => {
    const plan = planPools({ ...stock, reserved: 3 + 10 });
    expect(plan.usable).toBe(87);
    expect(peakConnections(plan.pools, 2)).toBeLessThanOrEqual(87);
  });

  it('never grows a pool the operator set smaller', () => {
    const current = { web: 10, server: 3, auth: 2, jobs: 8 };
    const plan = planPools({ ...tuned, current });
    expect(plan.changed).toBe(false);
    expect(plan.pools).toEqual(current);
  });

  it('shrinks an operator override that the server cannot hold', () => {
    const plan = planPools({ ...tuned, current: { ...DEFAULTS, web: 40 } });
    expect(plan.changed).toBe(true);
    expect(plan.fits).toBe(true);
    expect(plan.pools.web).toBeLessThan(40);
  });

  it('accounts for every web worker', () => {
    const plan = planPools({ ...tuned, webWorkers: 4 });
    expect(plan.before).toBeGreaterThan(plan.usable);
    expect(plan.fits).toBe(true);
    expect(peakConnections(plan.pools, 4)).toBeLessThanOrEqual(plan.usable);
  });

  it('reports a server too small to fit even at the minimums', () => {
    const plan = planPools({ ...stock, maxConnections: 40 });
    expect(plan.fits).toBe(false);
    expect(plan.pools).toEqual(MINIMUMS);
  });
});

describe('docker-compose.yml', () => {
  const compose = readFileSync(join(__dirname, '../../docker-compose.yml'), 'utf8');

  it.each(Object.entries(ENV_NAMES))(
    'starts %s with the default the budget assumes',
    (key, envName) => {
      const fallback = DEFAULTS[key as keyof typeof DEFAULTS];
      expect(compose).toContain(
        `- ${key === 'jobs' ? 'DATABASE_POOL_SIZE' : envName}=\${${envName}:-${fallback}}`,
      );
    },
  );
});
