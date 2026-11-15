/**
 * GET /api/admin/emoji-packs — the emoji & sticker pack review queue. Admin only.
 *
 * Pending packs, oldest edit first, each with its owner and a preview of its
 * items. Decisions go to `POST /api/admin/emoji-packs/$id`.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import * as C from '@/lib/admin/admin-ops.contract';
import { listPendingPacks } from '@/lib/emoji/packs.server';

export const route = apiRoute('/api/admin/emoji-packs', {
  GET: implement(C.listAdminEmojiPacksApi, { auth: 'admin' }, async () =>
    Response.json({ packs: await listPendingPacks() }),
  ),
});
