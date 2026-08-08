/**
 * Tests for `scripts/check-migration-safety.ts`.
 *
 * The script guards the window during a blue/green swap where the OLD web
 * container is still serving against the NEW schema. It has one property that
 * makes testing it non-optional: **`scripts/` is excluded from `tsconfig.json`**
 * (see its `exclude` list), so `tsc --noEmit` never looks at it. A refactor
 * there compiles by not being compiled.
 *
 * That is not hypothetical. When rule ids were introduced, each rule literal
 * declared an `id` that the array's type annotation omitted and the loop's
 * destructuring dropped, so three of the four rules pushed findings with
 * `id: undefined` — silently making their scoped acknowledgements unmatchable.
 * Nothing caught it. These tests are what catches it.
 *
 * They drive the real script as a subprocess against fixture migrations in a
 * temp directory, so they test what CI actually runs rather than a re-import of
 * its internals. The script is compiled once with esbuild rather than launched
 * fifteen times through `tsx` — same source, same subprocess boundary, one
 * compile instead of fifteen (see `compiled` below).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildSync } from 'esbuild';

const ROOT = resolve(__dirname, '../..');
const SCRIPT = join(ROOT, 'scripts/check-migration-safety.ts');

let sandbox: string;
/**
 * The script, transpiled once into the sandbox and then run with plain `node`.
 *
 * There are 15 runs in this file. Booting `tsx` for each of them costs ~350ms
 * of loader startup apiece — over five seconds of the suite spent compiling the
 * same 428 lines fifteen times. esbuild does that compile once (~30ms) and each
 * run is then a bare node process (~40ms).
 *
 * The script imports nothing but `node:fs` and `node:path`, so the bundle is a
 * faithful copy of what `tsx scripts/check-migration-safety.ts` executes in
 * CI — same source, same semantics, one compile.
 */
let compiled: string;

/**
 * Run the script against a sandbox whose `prisma/migrations` we control.
 *
 * `--baseline __fixture_base__` sorts before every fixture name, so all of them
 * are scanned. The script reads migrations relative to `process.cwd()`, which
 * is why the sandbox mirrors the repo layout rather than being passed as a flag.
 */
function run(migrations: Record<string, string>): { code: number; out: string } {
  const dir = join(sandbox, 'prisma', 'migrations');
  rmSync(dir, { recursive: true, force: true });
  for (const [name, sql] of Object.entries(migrations)) {
    mkdirSync(join(dir, name), { recursive: true });
    writeFileSync(join(dir, name, 'migration.sql'), sql);
  }
  return exec(['--baseline', '__fixture_base__'], sandbox);
}

/** Run the compiled script with `args`, from `cwd`, capturing both streams. */
function exec(args: string[], cwd: string): { code: number; out: string } {
  try {
    const out = execFileSync(process.execPath, [compiled, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

beforeAll(() => {
  sandbox = mkdtempSync(join(tmpdir(), 'migsafety-'));
  mkdirSync(join(sandbox, 'prisma', 'migrations'), { recursive: true });
  // The script is run from the sandbox, so it needs the repo's node_modules on
  // the resolution path. A symlink is enough and costs nothing.
  cpSync(join(ROOT, 'package.json'), join(sandbox, 'package.json'));

  compiled = join(sandbox, 'check-migration-safety.mjs');
  buildSync({
    entryPoints: [SCRIPT],
    outfile: compiled,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
  });
});

afterAll(() => {
  if (sandbox) rmSync(sandbox, { recursive: true, force: true });
});

describe('unsafe statements', () => {
  it('flags a DROP COLUMN', () => {
    const { code, out } = run({ zz_drop: 'ALTER TABLE "widget" DROP COLUMN "colour";' });
    expect(code).toBe(1);
    expect(out).toContain('drop-column');
  });

  it('flags SET NOT NULL', () => {
    const { code } = run({
      zz_notnull: 'ALTER TABLE "widget" ALTER COLUMN "name" SET NOT NULL;',
    });
    expect(code).toBe(1);
  });

  it('flags RENAME COLUMN', () => {
    const { code } = run({ zz_rename: 'ALTER TABLE "widget" RENAME COLUMN "a" TO "b";' });
    expect(code).toBe(1);
  });

  it('flags a plain CREATE INDEX on a pre-existing table', () => {
    const { code, out } = run({ zz_idx: 'CREATE INDEX "w_idx" ON "widget"("name");' });
    expect(code).toBe(1);
    expect(out).toContain('create-index-not-concurrent');
  });

  it('allows CREATE INDEX CONCURRENTLY', () => {
    const { code } = run({ zz_conc: 'CREATE INDEX CONCURRENTLY "w_idx" ON "widget"("name");' });
    expect(code).toBe(0);
  });

  it('allows an index on a table created in the same migration', () => {
    // The table is empty, so the lock is instantaneous. Flagging it would train
    // people to ignore the tool.
    const { code } = run({
      zz_new:
        'CREATE TABLE "gadget" ("id" TEXT NOT NULL);\nCREATE INDEX "g_idx" ON "gadget"("id");',
    });
    expect(code).toBe(0);
  });

  it('ignores DROP COLUMN mentioned in a comment', () => {
    // The migration that removed the tsvector documents the statement in its
    // header. A naive substring scan reports prose as a defect, and a tool that
    // cries wolf gets ignored.
    const { code } = run({
      zz_comment: '-- we deliberately do not ALTER TABLE "x" DROP COLUMN "y" here\nSELECT 1;',
    });
    expect(code).toBe(0);
  });
});

describe('acknowledgements', () => {
  const INDEX_SQL = 'CREATE INDEX "w_idx" ON "widget"("name");';

  it('a scoped acknowledgement silences only its own rule', () => {
    const { code } = run({
      zz_ack: `-- migration-safety: acknowledged[create-index-not-concurrent] tiny table\n${INDEX_SQL}`,
    });
    expect(code).toBe(0);
  });

  it('REGRESSION: a scoped ack matches a rule whose id is set on the finding', () => {
    // The bug this file was written for: `drop-column`, `set-not-null` and
    // `rename-column` pushed findings with `id: undefined`, so no scoped
    // acknowledgement could ever match them. Only `create-index-not-concurrent`
    // worked, which is why it looked fine.
    const { code } = run({
      zz_ackdrop:
        '-- migration-safety: acknowledged[drop-column] column was never read\nALTER TABLE "widget" DROP COLUMN "colour";',
    });
    expect(code).toBe(0);
  });

  it('a scoped ack does NOT silence a different rule in the same file', () => {
    const { code, out } = run({
      zz_mixed:
        `-- migration-safety: acknowledged[create-index-not-concurrent] tiny table\n` +
        `${INDEX_SQL}\nALTER TABLE "widget" DROP COLUMN "colour";`,
    });
    expect(code).toBe(1);
    expect(out).toContain('drop-column');
  });

  it('an acknowledgement without a reason does not count', () => {
    const { code } = run({ zz_noreason: `-- migration-safety: acknowledged\n${INDEX_SQL}` });
    expect(code).toBe(1);
  });
});

describe('protected columns', () => {
  const DROP_TSV = 'ALTER TABLE "rmheet" DROP COLUMN "content_tsv";';

  it('flags a drop of rmheet.content_tsv by name', () => {
    const { code, out } = run({ zz_tsv: DROP_TSV });
    expect(code).toBe(1);
    expect(out).toContain('drop-protected-column');
    expect(out).toContain('full-text search');
  });

  it('a BLANKET acknowledgement does not silence it', () => {
    // The whole point. `prisma migrate dev` proposes this drop on every run, so
    // a blanket ack written for something else would silence it by accident —
    // and the failure (searches quietly stop matching) is invisible.
    const { code } = run({
      zz_tsv_blanket: `-- migration-safety: acknowledged index on a small table\n${DROP_TSV}`,
    });
    expect(code).toBe(1);
  });

  it('a scoped acknowledgement naming the rule does silence it', () => {
    const { code } = run({
      zz_tsv_scoped: `-- migration-safety: acknowledged[drop-protected-column] search moved off tsvector\n${DROP_TSV}`,
    });
    expect(code).toBe(0);
  });
});

describe('the real migration history', () => {
  it('passes today', () => {
    // Guards against someone advancing BASELINE to silence a finding, and
    // against a fixture-only pass masking a broken real run.
    const { code, out } = exec(['--check'], ROOT);
    expect(code).toBe(0);
    expect(out).toContain('no unsafe statements found');
  });
});
