/**
 * /api/emoji-packs/installed — the viewer's packs plus their items.
 *
 * One round trip, because the picker and the `:shortcode:` completer both need
 * the whole set before they can render anything. Not gated: using packs is free.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { installedPacksApi } from '@/lib/emoji/packs.contract';
import { listInstalledPacks, listOwnedPacks } from '@/lib/emoji/packs.server';

export const route = apiRoute('/api/emoji-packs/installed', {
  GET: implement(installedPacksApi, { rateLimit: 'read' }, async ({ userId }) => {
    const [installed, owned] = await Promise.all([
      listInstalledPacks(userId),
      listOwnedPacks(userId),
    ]);
    return Response.json({ installed, owned });
  }),
});
