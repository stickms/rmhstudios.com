import path from 'node:path';
import { defineConfig } from 'prisma/config';
import 'dotenv/config';

/**
 * Prisma CLI config — drives `migrate dev`, `migrate deploy`, `migrate status`
 * and `db push`. This is NOT the runtime datasource; the app builds its own
 * clients in `lib/prisma.server.ts`.
 *
 * ## Why migrations use DATABASE_DIRECT_URL
 *
 * `DATABASE_URL` may point at PgBouncer in transaction pooling mode. Migrations
 * cannot run through it, for two independent reasons:
 *
 *  1. **Prisma's migration lock is a SESSION-scoped advisory lock.** In
 *     transaction mode a server connection returns to the pool at COMMIT, so the
 *     lock is taken on one backend and the next statement may land on another —
 *     the lock is silently lost, and two concurrent deploys can apply migrations
 *     at the same time. (The application's own advisory locks are all
 *     `pg_advisory_xact_lock`, which IS transaction-scoped and therefore safe
 *     through the pooler — locked in by `lib/__tests__/pgbouncer-safety.test.ts`.)
 *  2. Some DDL — notably `CREATE INDEX CONCURRENTLY` — cannot run inside the
 *     implicit transaction a pooled connection imposes.
 *
 * The fallback keeps every existing setup working unchanged: with
 * `DATABASE_DIRECT_URL` unset — the shape before PgBouncer, and every local dev
 * box — this resolves to `DATABASE_URL` exactly as before.
 */
const migrationUrl = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  datasource: {
    url: migrationUrl!,
  },
});
