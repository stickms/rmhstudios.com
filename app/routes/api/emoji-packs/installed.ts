/**
 * /api/emoji-packs/installed — the viewer's packs plus their items.
 *
 * One round trip, because the picker and the `:shortcode:` completer both need
 * the whole set before they can render anything. Not gated: using packs is free.
 */
import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listInstalledPacks, listOwnedPacks } from '@/lib/emoji/packs.server';

export const Route = createFileRoute('/api/emoji-packs/installed')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const [installed, owned] = await Promise.all([
          listInstalledPacks(userId),
          listOwnedPacks(userId),
        ]);
        return Response.json({ installed, owned });
      }),
    },
  },
});
