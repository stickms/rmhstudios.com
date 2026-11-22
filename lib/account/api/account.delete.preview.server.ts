/** GET /api/account/delete/preview: what a deletion request would stop (s09-14). Counts only. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getDeletionPreviewApi } from '@/lib/account/deletion-preview.contract';
import { previewDeletionPause } from '@/lib/account/deletion-hold.server';

export const route = apiRoute('/api/account/delete/preview', {
  GET: implement(getDeletionPreviewApi, { rateLimit: 'read' }, async ({ userId }) => previewDeletionPause(userId)),
});
