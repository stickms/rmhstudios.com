/**
 * PgBouncer transaction-pooling safety invariants.
 *
 * Production runs (or can run) the app tier behind PgBouncer in **transaction**
 * mode: a server connection is bound to a client only for the duration of a
 * transaction, then handed to whoever is next. That makes anything which
 * survives a COMMIT — a session-scoped advisory lock, a `SET`, a `LISTEN`, a
 * named prepared statement — unreliable in a way that does not fail loudly. It
 * works in dev (one connection, no contention) and corrupts under load.
 *
 * An audit found this codebase already satisfies every one of those constraints.
 * That is a property worth KEEPING, and it is exactly the kind that gets broken
 * by a one-line change nobody connects to pooling. Hence these tests: each one
 * fails with the reason, not just the symptom.
 *
 * What is deliberately NOT asserted here:
 *  - Interactive `$transaction(async …)` blocks. There are ~80 and they are
 *    CORRECT under transaction pooling (a transaction gets one dedicated server
 *    connection for its whole life). They only matter for pool *sizing* — a long
 *    one holds a backend — which is an operational concern, not an invariant.
 *  - `prisma migrate`. It genuinely needs a session and must not go through the
 *    pooler; that is enforced by `prisma.config.ts` preferring
 *    `DATABASE_DIRECT_URL`, not by a grep.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCANNED_DIRS = ['lib', 'server', 'app', 'hooks', 'stores'];

/** Every .ts/.tsx file under the scanned dirs, excluding tests and generated code. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === 'node_modules' || entry === '__tests__') continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (entry.endsWith('.test.ts') || entry.endsWith('.test.tsx')) continue;
      if (entry === 'routeTree.gen.ts') continue;
      out.push(full);
    }
  };
  for (const dir of SCANNED_DIRS) walk(join(ROOT, dir));
  return out;
}

const FILES = sourceFiles().map((f) => ({ path: relative(ROOT, f), src: readFileSync(f, 'utf8') }));

describe('PgBouncer transaction-mode safety', () => {
  it('scans a non-trivial number of files (guards against a broken walker)', () => {
    // Without this, a bug in sourceFiles() would make every test below pass
    // vacuously — the worst possible outcome for a regression guard.
    expect(FILES.length).toBeGreaterThan(500);
  });

  it('uses no SESSION-scoped advisory locks', () => {
    // `pg_advisory_lock` / `pg_advisory_unlock` / `pg_try_advisory_lock` are held
    // until the SESSION ends. Through a transaction pooler the session is not
    // the client's to keep, so the lock is taken on one backend and released to
    // the pool at COMMIT — silently unlocking.
    //
    // The `_xact_` variants are transaction-scoped and are the correct choice
    // here; the negative lookahead below is what distinguishes them.
    const offenders = FILES.filter((f) => /pg_(try_)?advisory_(?!xact_)/.test(f.src)).map(
      (f) => f.path,
    );
    expect(
      offenders,
      'Session-scoped advisory locks do not survive transaction pooling. Use pg_advisory_xact_lock(), which releases at COMMIT.',
    ).toEqual([]);
  });

  it('issues no session-scoped SET statements', () => {
    // A `SET` (as opposed to `SET LOCAL`) persists for the session, so it leaks
    // to the next client that gets the connection — and is lost for the one that
    // set it. Matches raw-SQL SETs only; `SET LOCAL` and SQL like
    // `UPDATE … SET x` are excluded.
    const offenders = FILES.filter((f) =>
      /\$(executeRaw|queryRaw)(Unsafe)?[(`]\s*SET\s+(?!LOCAL\b)/i.test(f.src),
    ).map((f) => f.path);
    expect(
      offenders,
      'A session-scoped SET leaks to the next client through a transaction pooler. Use SET LOCAL inside a transaction.',
    ).toEqual([]);
  });

  it('opens no LISTEN channels on the pooled client', () => {
    // LISTEN registers interest for the lifetime of a SESSION. Through a
    // transaction pooler the registration is dropped the moment the transaction
    // ends, so notifications are simply never delivered — no error, no data.
    // A future LISTEN/NOTIFY bridge must take its own direct connection
    // (DATABASE_DIRECT_URL), not one from the pool.
    const offenders = FILES.filter((f) =>
      /\$(executeRaw|queryRaw)(Unsafe)?[(`]\s*(LISTEN|UNLISTEN)\s/i.test(f.src),
    ).map((f) => f.path);
    expect(
      offenders,
      'LISTEN does not survive transaction pooling. Use a dedicated direct connection (DATABASE_DIRECT_URL).',
    ).toEqual([]);
  });

  it('does not configure named prepared statements on the pg adapter', () => {
    // @prisma/adapter-pg only names a statement when `statementNameGenerator` is
    // supplied; otherwise node-postgres sends an unnamed extended-protocol
    // query, which is transaction-pooling safe. Setting it would reintroduce the
    // classic Prisma+PgBouncer failure ("prepared statement s0 already exists"),
    // and it would do so only under concurrency.
    const offenders = FILES.filter((f) => /statementNameGenerator/.test(f.src)).map((f) => f.path);
    expect(
      offenders,
      'Named prepared statements break transaction pooling. Leave statementNameGenerator unset.',
    ).toEqual([]);
  });

  it('keeps migrations on a direct connection', () => {
    const config = readFileSync(join(ROOT, 'prisma.config.ts'), 'utf8');
    expect(
      config,
      "prisma.config.ts must prefer DATABASE_DIRECT_URL — prisma migrate's advisory lock is session-scoped and a pooler drops it.",
    ).toMatch(/DATABASE_DIRECT_URL/);
  });
});
