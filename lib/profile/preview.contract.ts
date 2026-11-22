/** Contract for `GET /api/profile/preview` (sprint 10 08). Client-safe: types only, no zod. */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ProfilePreviewResult } from '@/lib/profile/preview';
import type { previewQuery } from '@/lib/profile/preview-schema';

/**
 * The caller's own profile as a signed-out visitor or a signed-in stranger sees it. The response is about the caller's
 * privacy choices, so it is `no-store`.
 */
export const getProfilePreviewApi = endpoint<{
  query: z.infer<typeof previewQuery>;
  res: ProfilePreviewResult;
}>()({
  method: 'GET',
  path: '/api/profile/preview',
});
