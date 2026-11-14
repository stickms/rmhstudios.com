import { MAIN_PAGE, STARTER_PAGES } from '@/lib/wiki/starter-pages';
import {
  createWikiPage,
  INSTALLER_USER,
  listWikiPages,
  purgeWikiPages,
  WikiError,
  wikiPageLastEditor,
  writeWikiText,
} from '@/lib/wiki/mediawiki.server';

export const SEED_SUMMARY = 'Starter page from rmhstudios.com';

/**
 * Create every starter page whose title is not on the wiki yet. Idempotent: an
 * existing page is never overwritten, so an admin's edits survive a re-run.
 * The one exception is the main page while it is still the placeholder
 * MediaWiki's installer wrote, which nobody has edited.
 * Used by `POST /api/admin/wiki/seed` and `scripts/wiki/seed.ts`.
 */
export async function seedStarterPages(): Promise<{ created: string[]; skipped: string[] }> {
  const existing = new Set((await listWikiPages()).map((p) => p.title));
  const created: string[] = [];
  const skipped: string[] = [];
  for (const page of STARTER_PAGES) {
    if (existing.has(page.title)) {
      if (page.title === MAIN_PAGE && (await wikiPageLastEditor(page.title)) === INSTALLER_USER) {
        await writeWikiText(page.title, page.content, SEED_SUMMARY);
        created.push(page.title);
      } else {
        skipped.push(page.title);
      }
      continue;
    }
    try {
      await createWikiPage({ title: page.title, content: page.content, summary: SEED_SUMMARY });
      created.push(page.title);
    } catch (err) {
      // Raced with another seed or an edit on the wiki itself.
      if (err instanceof WikiError && err.code === 'conflict') skipped.push(page.title);
      else throw err;
    }
  }
  // The starter pages link to each other, and the first ones were rendered
  // before the later ones existed. Render the new ones again now that every
  // target is there.
  if (created.length) await purgeWikiPages(created);
  return { created, skipped };
}
