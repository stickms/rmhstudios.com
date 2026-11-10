/**
 * The bot's SQL seam: raw statements through the shared Prisma client, with the database retry
 * policy written once instead of at every call site.
 *
 * The Go bot used raw pgx against the Prisma-managed tables, and these are the same statements
 * (camelCase columns quoted as Prisma names them, `$n` placeholders). A JSON column takes a
 * `JSON.stringify`ed parameter cast with `::jsonb`; that cast is the only textual difference.
 *
 * # Only retried when it is provably safe
 *
 * pgx retried only what `pgconn.SafeToRetry` vouched never reached the server. The equivalent
 * here is a failure to get a connection at all — the pool timing out (P2024) or the server being
 * unreachable (P1001 / ECONNREFUSED). A connection that dropped while awaiting a reply is NOT
 * retried: an insert may have committed, and re-running it would double-count a message or a
 * voice session.
 */
import { withRetry, permanent, RETRY_DB, type RetryLogger } from './retry';

/** What the seam needs from a Prisma client (narrow, so tests inject a fake). */
export interface RawClient {
  $queryRawUnsafe<T = unknown>(sql: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number>;
}

export function retryableDbError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: unknown; name?: unknown; message?: unknown; cause?: unknown };
  if (e.name === 'AbortError') return false;
  if (e.code === 'P2024' || e.code === 'P1001' || e.code === 'ECONNREFUSED') return true;
  const cause = e.cause as { code?: unknown } | undefined;
  return cause?.code === 'ECONNREFUSED';
}

export class Sql {
  constructor(
    private readonly client: RawClient | null,
    private readonly logger: RetryLogger | null = null,
  ) {}

  /** False in a database-less run (local dev): every repo method is then a no-op. */
  get enabled(): boolean {
    return this.client !== null;
  }

  private retry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return withRetry(
      label,
      RETRY_DB,
      async () => {
        try {
          return await fn();
        } catch (err) {
          throw retryableDbError(err) ? err : permanent(err);
        }
      },
      { logger: this.logger },
    );
  }

  /** Run a statement; resolves to the affected row count. */
  exec(sql: string, ...args: unknown[]): Promise<number> {
    if (!this.client) return Promise.resolve(0);
    const client = this.client;
    return this.retry('db.exec', () => client.$executeRawUnsafe(sql, ...args));
  }

  /** Run a query; resolves to its rows. */
  query<T>(sql: string, ...args: unknown[]): Promise<T[]> {
    if (!this.client) return Promise.resolve([]);
    const client = this.client;
    return this.retry('db.query', () => client.$queryRawUnsafe<T[]>(sql, ...args));
  }

  /** The first row, or null when there is none (an answer, not a fault). */
  async one<T>(sql: string, ...args: unknown[]): Promise<T | null> {
    const rows = await this.query<T>(sql, ...args);
    return rows[0] ?? null;
  }
}

/** A nullable timestamp column as epoch ms. */
export function ms(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.getTime();
  const n = new Date(v as string).getTime();
  return Number.isFinite(n) ? n : null;
}

/** A required timestamp column as epoch ms (0 when absent). */
export function msReq(v: unknown): number {
  return ms(v) ?? 0;
}

/** A count/int column (Postgres bigint arrives as a JS bigint). */
export function num(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') return v;
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** A Date parameter from epoch ms (null stays null). */
export function at(v: number | null | undefined): Date | null {
  return v === null || v === undefined ? null : new Date(v);
}

/** "" → SQL NULL, so an unknown name is absent rather than an empty string. */
export function nullable(s: string | null | undefined): string | null {
  return s ? s : null;
}
