/**
 * Contracts for the wiki admin API. Client-safe: types only, no zod at runtime.
 * The wiki itself is MediaWiki on wiki.rmhstudios.com; these endpoints are how a
 * signed-in site admin manages its pages (`docs/wiki.md`).
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type {
  createWikiPageBody,
  updateWikiPageBody,
  wikiAssistBody,
  wikiPage,
  wikiPageList,
  wikiSeedResult,
} from '@/lib/wiki/wiki-schema';

type Page = z.infer<typeof wikiPage>;

export const listWikiPagesApi = endpoint<{ res: z.infer<typeof wikiPageList> }>()({
  method: 'GET',
  path: '/api/admin/wiki/pages',
});

export const createWikiPageApi = endpoint<{
  body: z.infer<typeof createWikiPageBody>;
  res: Page;
}>()({ method: 'POST', path: '/api/admin/wiki/pages' });

export const getWikiPageApi = endpoint<{ res: Page }>()({
  method: 'GET',
  path: '/api/admin/wiki/pages/$id',
});

export const updateWikiPageApi = endpoint<{
  body: z.infer<typeof updateWikiPageBody>;
  res: Page;
}>()({ method: 'PUT', path: '/api/admin/wiki/pages/$id' });

export const deleteWikiPageApi = endpoint<{ res: { success: true } }>()({
  method: 'DELETE',
  path: '/api/admin/wiki/pages/$id',
});

/** Creates the starter pages that do not exist yet (`lib/wiki/starter-pages.ts`). */
export const seedWikiPagesApi = endpoint<{ res: z.infer<typeof wikiSeedResult> }>()({
  method: 'POST',
  path: '/api/admin/wiki/seed',
});

/** Writes the wiki's sidebar, `MediaWiki:Sidebar` (`lib/wiki/sidebar.server.ts`). */
export const applyWikiSidebarApi = endpoint<{ res: { success: true } }>()({
  method: 'POST',
  path: '/api/admin/wiki/sidebar',
});

/**
 * DeepSeek writing assistant. The response is `text/event-stream`
 * (`{"delta"}` frames, `{"error"}` on failure, closed by `[DONE]`), so the
 * client reads it with `streamWikiAssist`, not `api()`.
 */
export const wikiAssistApi = endpoint<{
  body: z.infer<typeof wikiAssistBody>;
  res: never;
}>()({ method: 'POST', path: '/api/admin/wiki/assist' });
