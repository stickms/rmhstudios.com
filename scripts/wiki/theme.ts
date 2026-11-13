/* eslint-disable no-console -- a CLI: stdout is its output */
/**
 * Apply the Wikipedia look to wiki.rmhstudios.com: the CSS override, the site
 * title and the sidebar navigation (`lib/wiki/appearance.server.ts`).
 *
 *   WIKIJS_URL=http://localhost:7010 WIKIJS_API_KEY=… pnpm wiki:theme
 *
 * Idempotent. The same action is the "Apply wiki theme" button on /admin/wiki.
 */
import 'dotenv/config';
import { applyWikiAppearance } from '@/lib/wiki/appearance.server';

applyWikiAppearance()
  .then(() => console.log('wiki theme applied.'))
  .catch((err) => {
    console.error(`wiki theme failed: ${(err as Error).message}`);
    process.exit(1);
  });
