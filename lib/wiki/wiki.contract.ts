/**
 * Contract for signing in to wiki.rmhstudios.com (`docs/wiki.md`). The wiki
 * sends the browser here; the answer is always a redirect, never JSON, so
 * nothing on the site calls it with `api()`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { wikiSsoQuery } from '@/lib/wiki/wiki-schema';

export const wikiSsoApi = endpoint<{
  query: z.infer<typeof wikiSsoQuery>;
  res: never;
}>()({ method: 'GET', path: '/api/wiki/sso' });
