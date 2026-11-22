/* eslint-disable no-console */
/**
 * Give every account still missing an @handle one derived from its name.
 *
 * `user.handle` is nullable, and until the Better Auth `user.create` hook in
 * lib/auth.ts existed nothing assigned one. An account with a NULL handle can't
 * be @mentioned at all — /api/feed/mention-search only offers users with a
 * handle — and renders a bare nothing wherever the UI prints `@…`.
 *
 * Production is backfilled automatically by the
 * `20260731120000_backfill_user_handles` migration. This script is the
 * re-runnable equivalent for development databases (which use `prisma db push`
 * and therefore never run migrations) and for stragglers — including bot
 * accounts, which the Go bot-worker inserts directly.
 *
 * Deleted accounts are skipped: POST /api/account/delete anonymizes a user by
 * nulling its handle, and handing one back would republish them.
 *
 * Run:      pnpm handles:backfill
 * Preview:  pnpm handles:backfill --dry-run
 */

import { backfillMissingHandles } from '@/lib/handle.server';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const startedAt = Date.now();

  if (dryRun) console.log('[handles] dry run — no rows will be written\n');

  const result = await backfillMissingHandles({
    dryRun,
    onAssign: (user, handle) => {
      console.log(`  ${user.name ?? '(no name)'} → @${handle}`);
    },
  });

  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `\n[handles] ${result.assigned}/${result.scanned} assigned` +
      (result.failed ? `, ${result.failed} deferred to the next run` : '') +
      ` in ${seconds}s`,
  );

  if (result.scanned === 0) console.log('[handles] every account already has one.');
}

main()
  .catch((error) => {
    console.error('[handles] backfill failed:', error);
    process.exit(1);
  })
  .then(() => process.exit(0));
