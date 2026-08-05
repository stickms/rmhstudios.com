/* eslint-disable no-console -- this is a CLI reporting script; stdout is the output */
/**
 * Blue/green migration safety check.
 *
 * `deploy.sh` runs `prisma migrate deploy` and THEN hot-swaps the web tier
 * (7005 → 7015). For the length of that swap — and for the whole of a rollback
 * — the **old** application code is talking to the **new** schema. Every
 * statement flagged here is one that breaks during exactly that window, which
 * is why none of them show up in local `db:push` testing: locally the code and
 * the schema change together.
 *
 * What is flagged, and what actually goes wrong:
 *
 *   DROP COLUMN            The old code still names the column in its SELECT
 *                          list (Prisma selects columns explicitly, so this is
 *                          every query touching the model). Result: every read
 *                          of that table 500s until the swap finishes, and a
 *                          rollback never recovers because the data is gone.
 *                          Safe version: stop reading it, deploy, drop it in
 *                          the NEXT migration.
 *
 *   SET NOT NULL           The old code still INSERTs rows without the column.
 *                          Result: every write to that table fails. Safe
 *                          version: add the column nullable, backfill, deploy
 *                          the code that always writes it, then tighten.
 *
 *   RENAME COLUMN          Breaks in both directions at once — the old code
 *                          reads the old name, the new code reads the new one,
 *                          and only one of them exists at any instant. Safe
 *                          version: add + backfill + dual-write + drop, across
 *                          three deploys.
 *
 *   CREATE INDEX           A plain CREATE INDEX takes a SHARE lock on the
 *   (no CONCURRENTLY)      table, which blocks every INSERT/UPDATE/DELETE for
 *                          as long as the build takes. On `rmheet` or
 *                          `notification` that is a write outage measured in
 *                          minutes. Indexes on a table CREATEd in the same
 *                          migration are exempt: the table is empty and nothing
 *                          else can be writing to it yet.
 *
 * ## Opting out
 *
 * Some of these are genuinely the right call — dropping a column from a table
 * with 40 rows, or accepting a two-second index build. Acknowledge it in the
 * migration itself:
 *
 *     -- migration-safety: acknowledged the audit_log table has ~200 rows and
 *     -- no write path outside the admin console
 *
 * The reason is required and is not decoration: it is the thing a reviewer
 * reads, and the thing that stops the marker being pasted in reflexively. The
 * acknowledgement covers the whole file.
 *
 * ## The baseline
 *
 * `BASELINE` is the newest migration that existed when this check was added.
 * Everything at or before it is **not scanned** — that history predates the
 * check, it has already shipped, and rewriting it is both impossible and
 * pointless. The gate applies to migrations written from here on. Use `--all`
 * to scan the full history anyway (useful when auditing, never as a gate).
 *
 *   pnpm exec tsx scripts/check-migration-safety.ts            # full report
 *   pnpm exec tsx scripts/check-migration-safety.ts --check    # CI: terse
 *   pnpm exec tsx scripts/check-migration-safety.ts --all      # ignore BASELINE
 *   pnpm exec tsx scripts/check-migration-safety.ts --baseline 20260101000000_x
 *
 * Both modes exit 1 when there is an unacknowledged finding; `--check` prints
 * only the failures, the default prints the acknowledged opt-outs and the
 * scanned set too.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATIONS_DIR = resolve(process.cwd(), 'prisma', 'migrations');

/**
 * The newest migration that existed when this check landed (2026-08-05).
 * Migrations up to and including this one are not scanned — see "The baseline"
 * above. Do NOT advance this to silence a finding on a new migration; fix the
 * migration or acknowledge it in the file.
 */
const BASELINE = '20260805000000_game_save';

const args = process.argv.slice(2);
const checkMode = args.includes('--check');
const scanAll = args.includes('--all');
const baselineIdx = args.indexOf('--baseline');
const baseline = baselineIdx >= 0 ? (args[baselineIdx + 1] ?? BASELINE) : BASELINE;

/**
 * File-level acknowledgement, optionally scoped to ONE rule.
 *
 *   -- migration-safety: acknowledged <reason>
 *   -- migration-safety: acknowledged[create-index-not-concurrent] <reason>
 *
 * The scoped form exists because the bare form is too blunt to be safe: a
 * migration that legitimately acknowledges a small-table index build would also
 * silence a `DROP COLUMN` added to the same file six months later, which is the
 * exact defect this script exists to catch. Prefer the scoped form; the bare
 * form is kept only for a file where every finding shares one reason.
 */
const ACK_RE = /--\s*migration-safety:\s*acknowledged(?:\[([a-z-]+)\])?\s+(\S.*)$/gim;

interface Acknowledgement {
  /** Null = applies to every rule in the file. */
  rule: string | null;
  reason: string;
}

function parseAcknowledgements(sql: string): Acknowledgement[] {
  const out: Acknowledgement[] = [];
  ACK_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ACK_RE.exec(sql)) !== null) {
    out.push({ rule: m[1] ?? null, reason: m[2].trim() });
  }
  return out;
}

/** The acknowledgement covering a finding, if any. */
function ackFor(acks: Acknowledgement[], finding: Finding): Acknowledgement | undefined {
  return acks.find((a) => a.rule === null || a.rule === finding.id);
}

interface Finding {
  /**
   * Stable machine slug, used by the scoped acknowledgement form. Separate from
   * `rule` because `rule` is prose shown to a human and will get reworded; an
   * acknowledgement that breaks when someone improves an error message is worse
   * than no acknowledgement at all.
   */
  id: RuleId;
  rule: string;
  line: number;
  statement: string;
  why: string;
}

type RuleId =
  | 'drop-column'
  | 'set-not-null'
  | 'rename-column'
  | 'create-index-not-concurrent';

interface MigrationReport {
  name: string;
  /** Findings with no covering acknowledgement — these fail the build. */
  findings: Finding[];
  /** Findings a scoped or blanket acknowledgement covers, kept for the report. */
  excused: { finding: Finding; reason: string }[];
}

/**
 * Blank out comments and string literals, preserving every byte position (and
 * therefore every line number) by replacing with spaces.
 *
 * This matters more than it looks: the migration that removed the tsvector
 * column documents `ALTER TABLE rmheet DROP COLUMN content_tsv` in its header
 * comment. A naive substring scan reports that prose as a defect, the first
 * person to see it learns the tool cries wolf, and the check is worthless from
 * then on. Same lesson the design-consistency gate records about scanning
 * `className=` values rather than string literals generally.
 */
function blankNonCode(sql: string): string {
  const out = sql.split('');
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      while (i < sql.length && sql[i] !== '\n') {
        out[i] = ' ';
        i++;
      }
    } else if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      for (; i < stop; i++) if (sql[i] !== '\n') out[i] = ' ';
    } else if (sql[i] === "'") {
      out[i] = ' ';
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") {
          out[i] = ' ';
          out[i + 1] = ' ';
          i += 2;
          continue;
        }
        const done = sql[i] === "'";
        if (sql[i] !== '\n') out[i] = ' ';
        i++;
        if (done) break;
      }
    } else {
      i++;
    }
  }
  return out.join('');
}

/** 1-based line number for a source-string index. */
function lineAt(src: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx && i < src.length; i++) if (src[i] === '\n') line++;
  return line;
}

/** A short, single-line excerpt of the offending statement for the report. */
function excerpt(src: string, idx: number): string {
  const end = src.indexOf(';', idx);
  const raw = src.slice(idx, end === -1 ? Math.min(src.length, idx + 160) : end);
  return raw.replace(/\s+/g, ' ').trim().slice(0, 140);
}

/** Table names created by this migration — indexes on them are cheap and safe. */
function tablesCreatedHere(code: string): Set<string> {
  const created = new Set<string>();
  const re = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"?([\w.]+)"?/gi;
  for (let m = re.exec(code); m; m = re.exec(code)) created.add(m[1].toLowerCase());
  return created;
}

function scanSql(sql: string): Finding[] {
  const code = blankNonCode(sql);
  const findings: Finding[] = [];
  const newTables = tablesCreatedHere(code);

  const simpleRules: { rule: string; re: RegExp; why: string }[] = [
    {
      id: 'drop-column',
      rule: 'DROP COLUMN',
      re: /\bDROP\s+COLUMN\b/gi,
      why: 'the old code still names this column in its SELECT list — every read of the table fails until the swap completes, and a rollback cannot bring the data back. Stop reading it, deploy, drop it next time.',
    },
    {
      id: 'set-not-null',
      rule: 'SET NOT NULL',
      re: /\bALTER\s+COLUMN\s+(?:"[^"]+"|\w+)\s+SET\s+NOT\s+NULL\b/gi,
      why: 'the old code still INSERTs rows without this column — every write to the table fails. Add nullable, backfill, ship the code that always writes it, then tighten.',
    },
    {
      id: 'rename-column',
      rule: 'RENAME COLUMN',
      re: /\bRENAME\s+COLUMN\b/gi,
      why: 'only one of the two names exists at a time, so whichever version of the code is not currently deployed is broken. Expand/contract across three deploys instead.',
    },
  ];

  for (const { rule, re, why } of simpleRules) {
    for (let m = re.exec(code); m; m = re.exec(code)) {
      findings.push({ rule, line: lineAt(code, m.index), statement: excerpt(sql, m.index), why });
    }
  }

  // CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] "name" ON "table"
  const idxRe =
    /\bCREATE\s+(UNIQUE\s+)?INDEX\s+(CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?"?[\w.]+"?\s+ON\s+"?([\w.]+)"?/gi;
  for (let m = idxRe.exec(code); m; m = idxRe.exec(code)) {
    if (m[2]) continue; // CONCURRENTLY — fine
    const table = (m[3] ?? '').toLowerCase();
    if (newTables.has(table)) continue; // empty table created in this same migration
    findings.push({
      id: 'create-index-not-concurrent',
      rule: 'CREATE INDEX without CONCURRENTLY',
      line: lineAt(code, m.index),
      statement: excerpt(sql, m.index),
      why: `a plain CREATE INDEX holds a SHARE lock on "${table}" for the whole build, blocking every write to it. Build it CONCURRENTLY (outside the migration transaction), or acknowledge it if the table is small.`,
    });
  }

  return findings;
}

function listMigrations(): string[] {
  let entries: string[];
  try {
    entries = readdirSync(MIGRATIONS_DIR);
  } catch {
    console.error(`No migrations directory at ${MIGRATIONS_DIR}`);
    process.exit(1);
  }
  return entries
    .filter((name) => {
      try {
        return statSync(resolve(MIGRATIONS_DIR, name)).isDirectory();
      } catch {
        return false;
      }
    })
    .sort();
}

const all = listMigrations();
const scanned = scanAll ? all : all.filter((name) => name > baseline);

const reports: MigrationReport[] = [];
for (const name of scanned) {
  let sql: string;
  try {
    sql = readFileSync(resolve(MIGRATIONS_DIR, name, 'migration.sql'), 'utf-8');
  } catch {
    continue; // no migration.sql — nothing to check
  }
  const acks = parseAcknowledgements(sql);
  const findings: Finding[] = [];
  const excused: { finding: Finding; reason: string }[] = [];
  for (const finding of scanSql(sql)) {
    const ack = ackFor(acks, finding);
    if (ack) excused.push({ finding, reason: ack.reason });
    else findings.push(finding);
  }
  reports.push({ name, findings, excused });
}

const unacknowledged = reports.filter((r) => r.findings.length > 0);
const acknowledged = reports.filter((r) => r.excused.length > 0);

console.log(
  `\nMigration safety (blue/green: old code runs against the new schema during the swap)\n`,
);
console.log(
  scanAll
    ? `  scanning all ${scanned.length} migration(s)`
    : `  baseline ${baseline} — scanning ${scanned.length} migration(s) after it ` +
        `(${all.length - scanned.length} predate the check)`,
);

if (!checkMode && acknowledged.length > 0) {
  console.log(`\nAcknowledged (${acknowledged.length} migration(s)):`);
  for (const r of acknowledged) {
    console.log(`  ${r.name} — ${r.excused.length} finding(s)`);
    for (const { finding, reason } of r.excused) {
      console.log(`    · ${finding.id} (line ${finding.line}) — ${reason}`);
    }
  }
}

if (unacknowledged.length > 0) {
  console.log(`\nUNSAFE (${unacknowledged.length} migration(s)):`);
  for (const r of unacknowledged) {
    console.log(`\n  ${r.name}/migration.sql`);
    for (const f of r.findings) {
      console.log(`    line ${f.line}  ${f.rule}`);
      console.log(`      ${f.statement}`);
      console.log(`      ${f.why}`);
    }
  }
  console.log(
    `\n  If one of these is deliberate, say so in the migration file:\n` +
      `      -- migration-safety: acknowledged[<rule-id>] <why this one is fine>\n` +
      `      (rule ids above; the unscoped form covers EVERY rule in the file — prefer the scoped one)\n` +
      `  The reason is required. Do NOT advance BASELINE in ` +
      `scripts/check-migration-safety.ts to silence it.\n`,
  );
  process.exit(1);
}

if (!checkMode) {
  console.log(`\n  no unsafe statements found\n`);
} else {
  console.log(`  OK\n`);
}
