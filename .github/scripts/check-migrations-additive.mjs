/* eslint-disable no-console -- CI gate reporter */
/**
 * Expand/contract gate for NEW Prisma migrations.
 *
 * A release is rolled back by redeploying the previous image on the already
 * migrated database (post-deploy guard, post-deploy-verify). That only works if
 * the previous release still runs on the new schema, so a migration must not
 * remove or tighten anything the old code uses. This flags the statements that
 * do, in migrations ADDED since the base commit (history is not re-judged).
 *
 * A deliberate contract step (the old code no longer touches the column, and a
 * release that stopped using it has already shipped) opts in with a comment
 * anywhere in the file:   -- rmh:contract-ok <why it is safe>
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const OPT_OUT = /--[ \t]*rmh:contract-ok[ \t]+\S/;

const RULES = [
  [/\bdrop\s+table\b/, 'DROP TABLE removes data the previous release reads'],
  [/\bdrop\s+column\b/, 'DROP COLUMN breaks the previous release'],
  [/\bdrop\s+type\b/, 'DROP TYPE breaks the previous release'],
  [/\brename\s+(to|column|constraint)\b/, 'RENAME breaks the previous release'],
  [/\balter\s+type\b[^;]*\brename\s+value\b/, 'renaming an enum value breaks the previous release'],
  [
    /\balter\s+column\b[^;]*\bset\s+not\s+null\b/,
    'SET NOT NULL rejects inserts from the previous release',
  ],
  [
    /\balter\s+column\b[^;]*\bdrop\s+default\b/,
    'DROP DEFAULT breaks inserts from the previous release',
  ],
  [
    /\balter\s+column\b[^;]*\b(set\s+data\s+)?type\b/,
    'changing a column type breaks the previous release',
  ],
  [
    /\badd\s+column\b(?![^,;]*\bdefault\b)(?![^,;]*\bgenerated\b)[^,;]*\bnot\s+null\b/,
    'NOT NULL column without a DEFAULT rejects inserts from the previous release',
  ],
];

/** Comments and string literals can mention anything; match only on real SQL. */
function stripNoise(sql) {
  return sql
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function findBreakingChanges(sql) {
  if (OPT_OUT.test(sql)) return [];
  const clean = stripNoise(sql);
  const found = [];
  for (const statement of clean.split(';')) {
    for (const [pattern, why] of RULES) if (pattern.test(statement)) found.push(why);
  }
  return [...new Set(found)];
}

export function addedMigrations(base) {
  return execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=A', '-z', base, 'HEAD', '--', 'prisma/migrations'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter((file) => /^prisma\/migrations\/[^/]+\/migration\.sql$/.test(file));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const base = process.env.BASE_SHA || process.argv[2];
  if (!base || !/^[a-zA-Z0-9._/~^-]{1,100}$/.test(base)) {
    console.log('No base to compare against; nothing to check.');
    process.exit(0);
  }
  let failed = false;
  for (const file of addedMigrations(base)) {
    for (const problem of findBreakingChanges(readFileSync(file, 'utf8'))) {
      failed = true;
      console.error(
        `::error file=${file}::${problem}. Use expand/contract, or add "-- rmh:contract-ok <why>" if a prior release already stopped using it.`,
      );
    }
  }
  if (failed) process.exit(1);
  console.log('New migrations are additive.');
}
