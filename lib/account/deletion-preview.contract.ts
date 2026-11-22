/** Contract for GET /api/account/delete/preview (s09-14). Client-safe. */
import { endpoint } from '@/lib/contract/endpoint';
import type { DeletionPausePreview } from '@/lib/account/deletion-hold';

/** What a deletion request would stop: the counts the dialog lists before the confirm. */
export const getDeletionPreviewApi = endpoint<{ res: DeletionPausePreview }>()({
  method: 'GET',
  path: '/api/account/delete/preview',
});
