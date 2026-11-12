/**
 * Casino — durable table store (third-pass audit OP3, first slice).
 *
 * Lets a deploy (SIGTERM, then a new process) keep a casino table that holds
 * coins: the seats, the bets, the hands, the dealer's cards and the shoe. The
 * hub writes each table here as it changes and once more at shutdown, and the
 * next process reads them back before it listens. Blackjack is the only game
 * on it so far; the other three still refund at shutdown (`casino-shutdown.ts`).
 *
 * OFF by default. `openCasinoTableStore()` constructs a store only when
 * `CASINO_DURABLE_TABLES=1` AND `REDIS_STATE_URL` (the durable, AOF, noeviction
 * `redis-state` plane, never the evictable cache-plane `REDIS_URL`) is
 * reachable at boot. Anything else returns `null` and the hub runs exactly as
 * it did before: tables in memory, stakes refunded at shutdown. The same rule
 * as `server/rmhbox/lobby-store.ts`: a store that cannot connect is logged
 * once and the hub starts without it, because the hub must always start.
 *
 * Layout: one key per table (`casino:table:<game>:<roomId>`, a JSON payload the
 * game's own schema validates) plus a set index per game (`casino:tables:<game>`)
 * so boot finds them without SCAN.
 *
 * NO TTL, on purpose. A lobby that expires costs a lobby; a table that expires
 * costs the coins staked on it. Every entry is removed by the code that ends
 * its table (the room is destroyed), and anything a dead process left behind is
 * read by the next boot, which plays the round out and then removes it.
 */

import Redis from 'ioredis';
import type { CasinoGame } from './casino-shutdown';

export const TABLE_KEY_PREFIX = 'casino:table:';
export const TABLE_INDEX_PREFIX = 'casino:tables:';

/** One table as written: `data` is whatever the game's serializer produced. */
export interface TableEntry {
  id: string;
  data: unknown;
}

/** One table as read back: `data` is the parsed JSON, or `undefined` if it was not JSON. */
export interface LoadedTable {
  id: string;
  data: unknown;
}

export interface CasinoTableStore {
  /** Write every entry, all or none. */
  saveAll(game: CasinoGame, entries: TableEntry[]): Promise<void>;
  remove(game: CasinoGame, ids: string[]): Promise<void>;
  loadAll(game: CasinoGame): Promise<LoadedTable[]>;
  close(): Promise<void>;
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/**
 * In-memory store: the store contract without Redis. A test carries one
 * instance across a simulated restart; nothing in production constructs it.
 */
export class MemoryCasinoTableStore implements CasinoTableStore {
  /** Raw JSON strings by `<game>:<id>`, exactly as the Redis store would hold them. */
  readonly entries = new Map<string, string>();

  async saveAll(game: CasinoGame, entries: TableEntry[]): Promise<void> {
    // Stringify everything first so a value that cannot be written writes nothing.
    const raws = entries.map((e) => [`${game}:${e.id}`, JSON.stringify(e.data)] as const);
    for (const [key, raw] of raws) this.entries.set(key, raw);
  }

  async remove(game: CasinoGame, ids: string[]): Promise<void> {
    for (const id of ids) this.entries.delete(`${game}:${id}`);
  }

  async loadAll(game: CasinoGame): Promise<LoadedTable[]> {
    const prefix = `${game}:`;
    const out: LoadedTable[] = [];
    for (const [key, raw] of this.entries) {
      if (key.startsWith(prefix)) out.push({ id: key.slice(prefix.length), data: parseJson(raw) });
    }
    return out;
  }

  async close(): Promise<void> {}
}

export class RedisCasinoTableStore implements CasinoTableStore {
  constructor(private readonly redis: Redis) {}

  async saveAll(game: CasinoGame, entries: TableEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const multi = this.redis.multi();
    for (const e of entries) {
      multi.set(TABLE_KEY_PREFIX + game + ':' + e.id, JSON.stringify(e.data));
      multi.sadd(TABLE_INDEX_PREFIX + game, e.id);
    }
    const results = await multi.exec();
    // A MULTI that queued but failed inside EXEC reports per-command errors, not a rejection.
    const failed = results?.find(([err]) => err);
    if (!results || failed) throw failed?.[0] ?? new Error('casino table save: transaction discarded');
  }

  async remove(game: CasinoGame, ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.redis
      .multi()
      .del(...ids.map((id) => TABLE_KEY_PREFIX + game + ':' + id))
      .srem(TABLE_INDEX_PREFIX + game, ...ids)
      .exec();
  }

  async loadAll(game: CasinoGame): Promise<LoadedTable[]> {
    const ids = await this.redis.smembers(TABLE_INDEX_PREFIX + game);
    if (ids.length === 0) return [];
    const raws = await this.redis.mget(...ids.map((id) => TABLE_KEY_PREFIX + game + ':' + id));
    const out: LoadedTable[] = [];
    const gone: string[] = [];
    ids.forEach((id, i) => {
      const raw = raws[i];
      if (raw == null) gone.push(id);
      else out.push({ id, data: parseJson(raw) });
    });
    if (gone.length > 0) await this.redis.srem(TABLE_INDEX_PREFIX + game, ...gone);
    return out;
  }

  async close(): Promise<void> {
    await Promise.allSettled([this.redis.quit()]);
    this.redis.disconnect();
  }
}

// ─── Boot ────────────────────────────────────────────────────────

interface StoreLogger {
  info(entry: Record<string, unknown>): void;
  warn(entry: Record<string, unknown>): void;
}

const CONNECT_TIMEOUT_MS = 3_000;

/**
 * Open the durable table store, or return `null` (feature off). Never throws.
 * With `CASINO_DURABLE_TABLES` unset this returns before constructing anything
 * and logs nothing, so the hub's behaviour is unchanged.
 */
export async function openCasinoTableStore(
  logger: StoreLogger,
  env: Record<string, string | undefined> = process.env,
): Promise<CasinoTableStore | null> {
  if (env.CASINO_DURABLE_TABLES !== '1') return null;
  const url = env.REDIS_STATE_URL;
  if (!url) {
    logger.info({ event: 'casino_durable_tables_disabled', reason: 'REDIS_STATE_URL unset' });
    return null;
  }

  const redis = new Redis(url, {
    lazyConnect: true,
    connectTimeout: CONNECT_TIMEOUT_MS,
    // Boot only: give up quickly instead of retrying forever if Redis is down.
    retryStrategy: () => null,
    // A write that cannot be sent fails instead of waiting: the callers bound
    // every save and decide what a failed one means for the coins.
    maxRetriesPerRequest: 1,
  });
  // Errors after boot must never crash the hub; a failed save is handled by its caller.
  redis.on('error', (err: Error) => logger.warn({ event: 'casino_durable_tables_redis_error', error: err.message }));

  try {
    await Promise.race([
      redis.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('connect timeout')), CONNECT_TIMEOUT_MS + 500).unref(),
      ),
    ]);
  } catch (err) {
    logger.warn({
      event: 'casino_durable_tables_unavailable',
      error: err instanceof Error ? err.message : String(err),
      running: 'in-memory tables, stakes refunded at shutdown',
    });
    redis.disconnect();
    return null;
  }

  // Connected: allow normal reconnects from here on.
  redis.options.retryStrategy = (times) => Math.min(times * 200, 5_000);
  logger.info({ event: 'casino_durable_tables_enabled' });
  return new RedisCasinoTableStore(redis);
}
