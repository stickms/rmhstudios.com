#!/usr/bin/env node
/* eslint-disable no-console -- deploy-time CLI: deploy.sh parses its stdout */
/**
 * Fit the fleet's Postgres pools inside the server's REAL max_connections.
 *
 * WHY: docker-compose.yml's connection budget (~160 at the blue/green peak)
 * assumes the tuned host from deploy/postgres/postgresql.tuning.conf
 * (max_connections = 200). Applying that file is a root action plus a Postgres
 * restart, which the sandboxed deploy cannot do (deploy/apply-perf-tuning.sh is
 * the manual path), so a stock host keeps 100. Past the limit Postgres refuses
 * new connections outright ("sorry, too many clients already") and web, the
 * hubs and their auth lookups all fail at once: under load, the site errors.
 *
 * deploy.sh runs this once per deploy, inside the web image (it has `pg` and the
 * same env_file), BEFORE any service starts. It reads the live limit, adds up
 * the worst case — two web containers during the hotswap — and when that does
 * not fit, scales the pools that dominate it down proportionally. It only ever
 * SHRINKS a pool; a tuned host keeps today's sizes. A pool that waits (5s
 * acquire timeout) degrades far better than a server that refuses everyone.
 *
 * Output: `POOL:<ENV>=<n>` lines for deploy.sh to export (compose interpolates
 * them, see the `${…:-default}` entries), plus human-readable lines it logs.
 * Any failure to read the server prints a warning and exits 0 with no POOL
 * lines, so the deploy proceeds exactly as before.
 */
import { pathToFileURL } from 'node:url';

/** The pool sizes docker-compose.yml starts each service with (test-enforced). */
export const DEFAULTS = { web: 20, server: 5, auth: 4, jobs: 16 };

/** Below these a service stops being useful; the plan never goes lower. */
export const MINIMUMS = { web: 4, server: 2, auth: 1, jobs: 4 };

/** Which variable carries each pool (compose interpolates these). */
export const ENV_NAMES = {
  web: 'DATABASE_POOL_SIZE', // lib/prisma.server, per Nitro worker
  server: 'SERVER_DB_POOL_SIZE', // server/shared/prisma-client, per hub
  auth: 'AUTH_DB_POOL_SIZE', // the hubs' raw session-lookup pg pool
  jobs: 'JOBS_DB_POOL_SIZE', // the jobs worker's lib/prisma.server pool
};

const HUBS = 3; // socket, rmhbox, rmhtube — each runs `server` + `auth`
const WEB_CONTAINERS_AT_PEAK = 2; // old + new during deploy/hotswap-web.sh
const WEB_PGBOSS_PER_WORKER = 2; // lib/jobs/boss.server.ts producer pool
/** Connections nothing here sizes: pg-boss worker 8, ladder-worker 3+3,
 *  homes-worker 3, Go supervisor 1 + status probe 2 (+2 slack), and 10 for
 *  migrate / psql / backups / admin sessions. */
const FIXED = 8 + 6 + 3 + 5 + 10;

/**
 * @typedef {{ web: number, server: number, auth: number, jobs: number }} Pools
 */

/**
 * Worst-case connections the fleet can hold open at once with these pools.
 * @param {Pools} p
 * @param {number} webWorkers Nitro cluster workers per web container
 */
export function peakConnections(p, webWorkers) {
  return (
    WEB_CONTAINERS_AT_PEAK * webWorkers * (p.web + WEB_PGBOSS_PER_WORKER) +
    HUBS * (p.server + p.auth) +
    p.jobs +
    FIXED
  );
}

/**
 * @param {{ maxConnections: number, reserved: number, webWorkers: number, current: Pools }} input
 *   `reserved` = superuser_reserved_connections + reserved_connections (PG16+).
 */
export function planPools({ maxConnections, reserved, webWorkers, current }) {
  const usable = maxConnections - reserved;
  const before = peakConnections(current, webWorkers);
  if (before <= usable) {
    return { usable, before, after: before, pools: { ...current }, changed: false, fits: true };
  }
  // Scale the sized pools by one factor so no service is starved first.
  const scalable =
    WEB_CONTAINERS_AT_PEAK * webWorkers * current.web +
    HUBS * (current.server + current.auth) +
    current.jobs;
  const fixed = before - scalable;
  const factor = Math.max(0, (usable - fixed) / scalable);
  /** @type {Pools} */
  const pools = { ...current };
  for (const key of /** @type {(keyof Pools)[]} */ (Object.keys(DEFAULTS))) {
    const scaled = Math.max(MINIMUMS[key], Math.floor(current[key] * factor));
    pools[key] = Math.min(current[key], scaled); // shrink only
  }
  const after = peakConnections(pools, webWorkers);
  return { usable, before, after, pools, changed: true, fits: after <= usable };
}

/** @param {string | undefined} raw @param {number} fallback */
function intEnv(raw, fallback) {
  const n = parseInt(raw ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log('db-budget: DATABASE_URL unset — pools left as configured.');
    return;
  }
  const direct = process.env.DATABASE_DIRECT_URL;
  if (direct && direct !== url) {
    // The app talks to PgBouncer, which bounds the real backends itself.
    console.log('db-budget: DATABASE_URL is pooled (PgBouncer) — pools left as configured.');
    return;
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 5_000,
  });
  let maxConnections;
  let reserved;
  try {
    await client.connect();
    const show = async (/** @type {string} */ name) =>
      Number((await client.query(`SHOW ${name}`)).rows[0]?.[name]);
    maxConnections = await show('max_connections');
    reserved = await show('superuser_reserved_connections');
    // PG16+ only; older servers reject the name.
    reserved += await show('reserved_connections').catch(() => 0);
  } catch (err) {
    console.log(
      `db-budget: WARNING could not read max_connections (${err instanceof Error ? err.message : err}) — pools left as configured.`,
    );
    return;
  } finally {
    await client.end().catch(() => {});
  }

  const env = process.env;
  const current = {
    web: intEnv(env.DATABASE_POOL_SIZE, DEFAULTS.web),
    server: intEnv(env.SERVER_DB_POOL_SIZE, DEFAULTS.server),
    auth: intEnv(env.AUTH_DB_POOL_SIZE, DEFAULTS.auth),
    jobs: intEnv(env.JOBS_DB_POOL_SIZE, DEFAULTS.jobs),
  };
  const webWorkers = intEnv(env.NITRO_CLUSTER_WORKERS, 2);
  const plan = planPools({ maxConnections, reserved, webWorkers, current });

  console.log(
    `db-budget: max_connections=${maxConnections} (usable ${plan.usable}), fleet peak at configured pools=${plan.before}`,
  );
  if (!plan.changed) {
    console.log('db-budget: fits — pools left as configured.');
    return;
  }
  for (const key of /** @type {(keyof typeof DEFAULTS)[]} */ (Object.keys(DEFAULTS))) {
    if (plan.pools[key] !== current[key]) {
      console.log(`db-budget: ${ENV_NAMES[key]} ${current[key]} -> ${plan.pools[key]}`);
      console.log(`POOL:${ENV_NAMES[key]}=${plan.pools[key]}`);
    }
  }
  console.log(
    plan.fits
      ? `db-budget: shrunk to fit (peak ${plan.after}). Raise max_connections to restore full pools: sudo bash deploy/apply-perf-tuning.sh`
      : `db-budget: WARNING even minimum pools need ${plan.after} > ${plan.usable}. Raise max_connections (sudo bash deploy/apply-perf-tuning.sh) or enable PgBouncer.`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
