/* eslint-disable no-console -- a CLI: stdout is its output */
/**
 * Seed wiki.rmhstudios.com with the starter pages (`lib/wiki/starter-pages.ts`).
 *
 *   WIKIJS_URL=http://localhost:7010 WIKIJS_API_KEY=… pnpm wiki:seed
 *
 * Idempotent: a page whose path already exists is left untouched. The same
 * action is the "Add starter pages" button on /admin/wiki. Setup: docs/wiki.md.
 */
import 'dotenv/config';
import { seedStarterPages } from '@/lib/wiki/seed.server';

seedStarterPages()
  .then(({ created, skipped }) => {
    for (const path of created) console.log(`created  ${path}`);
    for (const path of skipped) console.log(`exists   ${path}`);
    console.log(`${created.length} created, ${skipped.length} already there.`);
  })
  .catch((err) => {
    console.error(`wiki seed failed: ${(err as Error).message}`);
    process.exit(1);
  });
