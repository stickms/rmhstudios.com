import { STARTER_PAGES } from '@/lib/wiki/starter-pages';
import { createWikiPage, listWikiPages, WikiError } from '@/lib/wiki/wikijs.server';

/**
 * Create every starter page whose path is not on the wiki yet. Idempotent: an
 * existing page is never overwritten, so an admin's edits survive a re-run.
 * Used by `POST /api/admin/wiki/seed` and `scripts/wiki/seed.ts`.
 */
export async function seedStarterPages(): Promise<{ created: string[]; skipped: string[] }> {
  const existing = new Set((await listWikiPages()).map((p) => p.path));
  const created: string[] = [];
  const skipped: string[] = [];
  for (const page of STARTER_PAGES) {
    if (existing.has(page.path)) {
      skipped.push(page.path);
      continue;
    }
    try {
      await createWikiPage({ ...page, isPublished: true });
      created.push(page.path);
    } catch (err) {
      // Raced with another seed, or the page exists in a state `list` hides.
      if (err instanceof WikiError && err.code === 'conflict') skipped.push(page.path);
      else throw err;
    }
  }
  return { created, skipped };
}
