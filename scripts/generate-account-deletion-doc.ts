/**
 * Generates `docs/account-deletion.md` from `lib/account/erasure-registry.ts`, the single source for what account
 * deletion does with every model that has a relation to `User`.
 *
 *     pnpm docs:deletion
 *     pnpm docs:deletion --check
 *
 * `--check` fails (exit 1) when the page differs from what the registry produces. The page is excluded from prettier
 * (`.prettierignore`) because prettier would re-pad its tables.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ERASURE_REGISTRY, TODO_CEILING, type ErasureDecision } from '../lib/account/erasure-registry';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'account-deletion.md');

const HEADER = [
  '<!--',
  '  GENERATED FILE — do not edit by hand.',
  '  Source: lib/account/erasure-registry.ts (scripts/generate-account-deletion-doc.ts).',
  '  Regenerate with `pnpm docs:deletion`.',
  '-->',
  '',
].join('\n');

const GROUPS: Array<[string, ErasureDecision[], string]> = [
  [
    'Erased',
    ['erase', 'deidentify', 'cascade'],
    'Deleted, de-identified or cascaded by `anonymizeAccount`. A `deidentify` row stays with its member reference replaced or nulled; a `cascade` row goes with its parent in the database.',
  ],
  [
    'Kept on purpose',
    ['keep'],
    'Kept for a stated reason: a ledger, an audit trail, another member\'s record, or published content that stays under "Deleted user" as posts do.',
  ],
  [
    'Owner decision',
    ['owner'],
    'An open owner decision from an earlier sprint. Their handling is unchanged and a test pins it until the owner decides.',
  ],
  ['TODO', ['todo'], ''],
];

const esc = (s: string) => s.replace(/\|/g, '\\|');

export function renderAccountDeletionDoc(): string {
  const entries = Object.entries(ERASURE_REGISTRY);
  let o = `${HEADER}# Account deletion

What happens to a member's data when they delete their account, and where each table stands.

## What deletion does

Deleting an account is two phases (\`lib/account/deletion.server.ts\`):

1. **Schedule.** \`scheduleDeletion\` sets \`deletionScheduledAt\` 30 days out (\`DELETION_GRACE_DAYS\`), signs the member out and hides the account. Signing back in cancels it. The grace period is as it is; changing it is an open owner decision.
2. **Finalise.** A nightly sweep (\`finalizeDueDeletions\`) runs \`anonymizeAccount\`: one transaction of explicit deletes and updates, plus per-domain \`…ErasureOps\` helpers.

The \`User\` row is anonymised in place, never removed, so \`onDelete: Cascade\` from \`User\` never fires. A table is therefore erased only when \`anonymizeAccount\` says so. Posts and other published content stay under "Deleted user".

## The registry

\`lib/account/erasure-registry.ts\` classifies every model that has a relation to \`User\`: \`erase\`, \`deidentify\`, \`cascade\`, \`keep\`, \`owner\` or \`todo\`, each with a one-line reason. The registry is the source and this page is generated from it (\`pnpm docs:deletion\`; \`pnpm docs:deletion --check\` fails when the page is stale): \`lib/account/__tests__/erasure-coverage.test.ts\` fails for a model with a \`User\` relation that has no entry, for an \`erase\` entry with no delete in \`anonymizeAccount\`, for a \`deidentify\` entry with no update, for a missing reason, for a row missing from this page, and for a \`todo\` count above \`TODO_CEILING\`. A new model lands classified, not as \`todo\`.

The clearly private leaf tables (birthday, reminders, drafts, saves, history, settings, notifications, and private reading highlights) are erased by \`coverageErasureOps\` in \`lib/account/erasure-coverage.server.ts\`.

${entries.length} models are classified.

`;
  for (const [h, decs, intro0] of GROUPS) {
    const intro =
      h === 'TODO'
        ? `Not handled yet, each with the reason it was deferred. Each is a later, reviewable change that lowers \`TODO_CEILING\` (now ${TODO_CEILING}).`
        : intro0;
    const rows = entries.filter(([, e]) => decs.includes(e.decision)).sort(([a], [b]) => a.localeCompare(b));
    o += `## ${h}\n\n${intro} ${rows.length} models.\n\n| Model | Decision | Reason |\n| --- | --- | --- |\n`;
    for (const [n, e] of rows) {
      let r = e.reason;
      if (e.scope) r += ` Scope: ${e.scope}.`;
      if (e.parent) r += ` Parent: \`${e.parent}\`.`;
      o += `| \`${n}\` | ${e.decision} | ${esc(r)} |\n`;
    }
    o += '\n';
  }
  return o.trimEnd() + '\n';
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const next = renderAccountDeletionDoc();
  if (process.argv.includes('--check')) {
    const cur = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (cur !== next) {
      console.error('docs/account-deletion.md is stale: run `pnpm docs:deletion`.');
      process.exit(1);
    }
    process.stdout.write('docs/account-deletion.md is up to date.\n');
  } else {
    writeFileSync(OUT, next);
    process.stdout.write('wrote docs/account-deletion.md\n');
  }
}
