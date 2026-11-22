/**
 * Contracts for User Build screenshots (s07-17). Client-safe: types only, no zod at runtime.
 * `$id` is the build's id or its slug.
 */
import type { z } from 'zod';
import { endpoint } from '@/lib/contract/endpoint';
import type { ScreenshotView } from '@/lib/builds/screenshots';
import type { saveScreenshotsBody } from '@/lib/builds/screenshots-schema';

/** Multipart, one `image` per request. Owner only. The picture is stored but not yet part of the build: save the list. */
export const uploadBuildImageApi = endpoint<{
  body: FormData;
  res: {
    url: string;
    width: number;
    height: number;
  };
}>()({
  method: 'POST',
  path: '/api/user-builds/$id/images',
});

/** The build's screenshots in order. A private build answers 404 to anyone but its owner. */
export const listScreenshotsApi = endpoint<{
  res: {
    items: ScreenshotView[];
  };
}>()({
  method: 'GET',
  path: '/api/user-builds/$id/screenshots',
});

/**
 * Replaces the list. Owner only. 400 with `code` and the zero-based `index` when a screenshot has no description
 * (`DESCRIPTION_REQUIRED`), or the list is over eight (`TOO_MANY`).
 */
export const saveScreenshotsApi = endpoint<{
  body: z.infer<typeof saveScreenshotsBody>;
  res: {
    items: ScreenshotView[];
  };
}>()({
  method: 'PUT',
  path: '/api/user-builds/$id/screenshots',
});
