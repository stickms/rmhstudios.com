/**
 * Contracts for the library upload dialog (redesign audit C1, batch 8): the
 * upload quota and its appeal, deleting your own upload, and the AI title /
 * description draft. Client-safe: types only, by `import type`. The PDF upload
 * itself is multipart (batch 9).
 */
import { endpoint } from '@/lib/contract/endpoint';
import type { QuotaStatus } from '@/lib/library/quota.server';

/** Multipart: `file` (PDF/EPUB), optional `cover`, `title`, `description`, `pages`. Answers 201. */
export const uploadLibraryBookApi =
  endpoint<{
    body: FormData;
    res: {
      slug: string;
      url: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/library/upload',
    },
  );

/** The caller's library usage, as the upload dialog reads it. */
export type LibraryQuota =
  QuotaStatus;

/** The signed-in user's library usage, cap, own uploads and pending appeal. */
export const getLibraryQuotaApi =
  endpoint<{
    res: QuotaStatus;
  }>()(
    {
      method:
        'GET',
      path: '/api/library/quota',
    },
  );

/** File an appeal for a higher cap. 400/409 carry the reason as `{ error }`. */
export const requestLibraryQuotaApi =
  endpoint<{
    body: {
      requestedTotal: number;
      reason: string;
    };
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/library/quota',
    },
  );

/** Owner or admin only. */
export const deleteLibraryUploadApi =
  endpoint<{
    res: {
      ok: true;
    };
  }>()(
    {
      method:
        'DELETE',
      path: '/api/library/$slug',
    },
  );

/** Blank fields when AI is not configured, so the form falls back to the filename. */
export const draftLibraryMetadataApi =
  endpoint<{
    body: {
      text: string;
    };
    res: {
      title: string;
      description: string;
    };
  }>()(
    {
      method:
        'POST',
      path: '/api/library/draft',
    },
  );
