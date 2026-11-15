/**
 * Contract for the admin blog media upload (sitewide announcements). Client-safe.
 * Multipart: a single `file` field, an image or an mp4/webm/mov video. A 4xx
 * answers `{ error }`, which `serverError()` reads.
 */
import { endpoint } from '@/lib/contract/endpoint';

export const uploadBlogMediaApi =
  endpoint<{
    body: FormData;
    res: {
      url: string;
      kind:
        | 'image'
        | 'video';
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/admin/blog/media',
    },
  );
