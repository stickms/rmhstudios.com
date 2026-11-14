/* eslint-disable no-console -- a CLI: stdout is its output */
/**
 * Write the sidebar of wiki.rmhstudios.com (`MediaWiki:Sidebar`, from
 * `lib/wiki/sidebar.server.ts`).
 *
 *   MEDIAWIKI_URL=http://localhost:7010 MEDIAWIKI_BOT_USER=… MEDIAWIKI_BOT_PASSWORD=… pnpm wiki:sidebar
 *
 * Idempotent. The same action is the "Update sidebar" button on /admin/wiki.
 */
import 'dotenv/config';
import { applyWikiSidebar } from '@/lib/wiki/sidebar.server';

applyWikiSidebar()
  .then(() => console.log('wiki sidebar written.'))
  .catch((err) => {
    console.error(`wiki sidebar failed: ${(err as Error).message}`);
    process.exit(1);
  });
