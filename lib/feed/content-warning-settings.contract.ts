/**
 * Contracts for /api/settings/content-warnings (sprint 06 #16): the reader's "Posts with content warnings" choice.
 * Client-safe: types come from the zod schema by `import type`.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { contentWarningSettingSchema } from '@/lib/feed/content-warning-schema';

type ContentWarningSetting = z.infer<typeof contentWarningSettingSchema>;

export const getContentWarningSettingApi = endpoint<{
  res: ContentWarningSetting;
}>()({
  method: 'GET',
  path: '/api/settings/content-warnings',
});

export const setContentWarningSettingApi = endpoint<{
  body: ContentWarningSetting;
  res: ContentWarningSetting;
}>()({
  method: 'POST',
  path: '/api/settings/content-warnings',
});
