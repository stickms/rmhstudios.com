/* eslint-disable no-console -- a CLI: stdout is its output */
/**
 * Seed wiki.rmhstudios.com with the starter pages (`lib/wiki/starter-pages.ts`).
 *
 *   MEDIAWIKI_URL=http://localhost:7010 MEDIAWIKI_BOT_USER=… MEDIAWIKI_BOT_PASSWORD=… pnpm wiki:seed
 *
 * Idempotent: a page whose title already exists is left untouched. The same
 * action is the "Add starter pages" button on /admin/wiki. Setup: docs/wiki.md.
 */
import 'dotenv/config';
import { seedStarterPages } from '@/lib/wiki/seed.server';

seedStarterPages()
  .then(({ created, skipped }) => {
    for (const title of created) console.log(`created  ${title}`);
    for (const title of skipped) console.log(`exists   ${title}`);
    console.log(`${created.length} created, ${skipped.length} already there.`);
  })
  .catch((err) => {
    console.error(`wiki seed failed: ${(err as Error).message}`);
    process.exit(1);
  });
