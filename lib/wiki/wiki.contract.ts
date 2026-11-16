/**
 * Contracts for wiki.rmhstudios.com (`docs/wiki.md`). The wiki's pages call
 * these, not the site's React client, so nothing here is used with `api()`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { wikiAssistBody, wikiOgQuery, wikiSsoQuery } from '@/lib/wiki/wiki-schema';

/** Sign in: the wiki sends the browser here; the answer is always a redirect. */
export const wikiSsoApi = endpoint<{
  query: z.infer<typeof wikiSsoQuery>;
  res: never;
}>()({ method: 'GET', path: '/api/wiki/sso' });

/**
 * "Edit with AI" on the wiki's edit page. A cross-origin POST from the wiki
 * with the reader's site session; the answer is `text/event-stream` of
 * `{"delta"}` frames closed by `[DONE]`, read by the wiki's own script
 * (deploy/mediawiki/extensions/RMHStudiosAssist).
 */
export const wikiAssistApi = endpoint<{
  body: z.infer<typeof wikiAssistBody>;
  res: never;
}>()({ method: 'POST', path: '/api/wiki/assist' });

/**
 * The link-preview card for a wiki page: a 1200x630 PNG, named in each wiki
 * page's `og:image` (deploy/mediawiki/extensions/RMHStudiosOpenGraph).
 */
export const wikiOgCardApi = endpoint<{
  query: z.infer<typeof wikiOgQuery>;
  res: never;
}>()({ method: 'GET', path: '/api/og/wiki' });
