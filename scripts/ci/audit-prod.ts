/* eslint-disable no-console -- CI script: its output is the job log. */
/**
 * The production dependency audit the deploy gate runs (ci-checks.yml `audit`).
 * Policy, and why it is not a bare `pnpm audit --audit-level=high`:
 * scripts/ci/audit-policy.ts. Allowlist: .github/audit-allowlist.json.
 *
 * Usage: pnpm exec tsx scripts/ci/audit-prod.ts
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  readFileSync,
} from 'node:fs';
import {
  checkAllowlist,
  judge,
  parseAudit,
} from './audit-policy.ts';

const audit =
  spawnSync(
    'pnpm',
    [
      'audit',
      '--prod',
      '--json',
    ],
    {
      encoding:
        'utf8',
      maxBuffer:
        64 <<
        20,
    },
  );
let report: unknown;
try {
  report =
    JSON.parse(
      audit.stdout,
    );
} catch {
  // Never pass because the audit could not run (registry down, bad output).
  console.error(
    audit.stdout.slice(
      0,
      2000,
    ),
    audit.stderr.slice(
      0,
      2000,
    ),
  );
  console.error(
    '::error::pnpm audit did not produce a JSON report; the audit did not run.',
  );
  process.exit(
    1,
  );
}

const allowlist =
  checkAllowlist(
    JSON.parse(
      readFileSync(
        new URL(
          '../../.github/audit-allowlist.json',
          import.meta
            .url,
        ),
        'utf8',
      ),
    ),
  );
const today =
  new Date()
    .toISOString()
    .slice(
      0,
      10,
    );
const verdicts =
  judge(
    parseAudit(
      report,
    ),
    allowlist,
    today,
  );

const rows: string[] =
  [];
for (const {
  kind,
  advisory:
    a,
  why,
} of verdicts) {
  const line = `${a.severity} ${a.module} ${a.vulnerable} (${a.ghsa}) — ${a.title}. ${why}. Via ${a.paths[0] ?? '?'}. ${a.url}`;
  console.log(
    `::${kind === 'block' ? 'error' : 'warning'}::${line}`,
  );
  rows.push(
    `| ${kind === 'block' ? 'blocks' : 'warns'} | ${a.severity} | ${a.module} ${a.vulnerable} | [${a.ghsa}](${a.url}) | ${why} |`,
  );
}
const blocking =
  verdicts.filter(
    (
      v,
    ) =>
      v.kind ===
      'block',
  ).length;
const summary =
  process
    .env
    .GITHUB_STEP_SUMMARY;
if (
  summary &&
  rows.length >
    0
) {
  appendFileSync(
    summary,
    `### Production dependency audit\n\n| | severity | package | advisory | |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\n`,
  );
}
console.log(
  `[audit] ${verdicts.length} high/critical advisory(ies): ${blocking} blocking, ${verdicts.length - blocking} warning`,
);
process.exit(
  blocking >
    0
    ? 1
    : 0,
);
