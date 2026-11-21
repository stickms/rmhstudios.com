/* eslint-disable no-console */
/**
 * Recompute every RMHStudy profile's `currentStreak` and `longestStreak` from its session rows.
 *
 * Profiles written before the streak fix still hold a streak of 1 however long the member
 * studied, and the stored values feed the profile, the leaderboard and the history header. Days
 * are counted in each profile's stored time zone (UTC when it has none). Idempotent: a profile
 * already holding the right values is left alone, so it is safe to run twice. Profiles are
 * processed in batches of 500.
 *
 * Production: a one-off after the deploy that adds `rmhstudy_profile.timeZone`.
 *   pnpm exec tsx scripts/rmhstudy/recompute-streaks.ts --dry-run   # report what would change
 *   pnpm exec tsx scripts/rmhstudy/recompute-streaks.ts             # write it
 */
import { prisma } from '@/lib/prisma.server';
import { recomputeStreaks } from '@/lib/rmhstudy/recompute-streaks.server';

async function main() {
  const dryRun =
    process.argv.includes(
      '--dry-run',
    );
  if (
    dryRun
  )
    console.log(
      '[rmhstudy-streaks] dry run: nothing will be written\n',
    );
  const result =
    await recomputeStreaks(
      prisma,
      {
        dryRun,
        onChange:
          (
            profile,
            next,
          ) => {
            console.log(
              `  ${profile.userId}: current ${profile.currentStreak} -> ${next.currentStreak}, longest ${profile.longestStreak} -> ${next.longestStreak}`,
            );
          },
      },
    );
  console.log(
    `\n[rmhstudy-streaks] ${result.scanned} profiles: ${result.changed} ${dryRun ? 'would change' : 'updated'}, ${result.unchanged} already correct, ${result.skipped} without sessions`,
  );
}

main()
  .catch(
    (
      error,
    ) => {
      console.error(
        '[rmhstudy-streaks] failed:',
        error,
      );
      process.exit(
        1,
      );
    },
  )
  .then(
    () =>
      process.exit(
        0,
      ),
  );
